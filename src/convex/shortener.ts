/**
 * URL shortener — ShrtFly-backed short links + device registry.
 *
 * Lives in its own module with self-contained DB helpers so Convex type
 * inference cannot form a circular reference through nameserver.ts.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/** Shape of a stored short link row (used as an explicit return type so
 *  Convex's type inference cannot form a circular reference). */
type ShortLinkRecord = {
  _id: Id<"shortLinks">;
  alias: string;
  originalUrl: string;
  shortUrl: string;
  statsUrl: string | undefined;
  adType: number;
  clicks: number;
  createdBy: Id<"users"> | undefined;
  createdAt: number;
};

/** Read a user's role (used by the panel action's auth check). */
export const getUserRole = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    return (user?.role as string | undefined) ?? "user";
  },
});

/** Read the global settings doc (ShrtFly API key). */
export const getShortenerSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_scope", (q) => q.eq("scope", "global"))
      .first();
    return {
      shortenerApiKey: doc?.shortenerApiKey ?? "",
      shortenerAdType: doc?.shortenerAdType ?? 1,
    };
  },
});

/** Insert a short-link row. */
export const insertShortLinkRow = internalMutation({
  args: {
    alias: v.string(),
    originalUrl: v.string(),
    shortUrl: v.string(),
    statsUrl: v.optional(v.string()),
    adType: v.number(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const record = {
      alias: args.alias,
      originalUrl: args.originalUrl,
      shortUrl: args.shortUrl,
      statsUrl: args.statsUrl,
      adType: args.adType,
      clicks: 0,
      createdBy: args.userId,
      createdAt: Date.now(),
    };
    const id = await ctx.db.insert("shortLinks", record);
    return { _id: id, ...record };
  },
});

/**
 * Create a short link via ShrtFly (internal action — performs the fetch).
 * Used by the panel action below and by POST /api/shorten in http.ts.
 */
export const createShortLinkByKey = internalAction({
  args: {
    url: v.string(),
    alias: v.optional(v.string()),
    adType: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<ShortLinkRecord> => {
    const longUrl = args.url.trim();
    if (!/^https?:\/\/.+\..+/.test(longUrl)) {
      throw new Error("Please enter a valid URL (must start with http:// or https://)");
    }
    const settings = await ctx.runQuery(internal.shortener.getShortenerSettings, {});
    // Owner's ShrtFly key as fallback so the shortener works out of the box.
    const apiKey = settings.shortenerApiKey || "ea3e5b3e3dcd0019ac9f395f2d8e4062";
    if (!apiKey) {
      throw new Error("No ShrtFly API key configured — set it in Settings > Shortener");
    }
    const adType = args.adType === 2 ? 2 : 1;
    const alias = args.alias?.trim().slice(0, 64) || "";
    const params = new URLSearchParams({
      api: apiKey,
      url: longUrl,
      type: String(adType),
      format: "json",
    });
    if (alias) params.set("alias", alias);
    let res: Response;
    try {
      res = await fetch(`https://shrtfly.com/api?${params.toString()}`);
    } catch {
      throw new Error("Could not reach shrtfly.com — check your network");
    }
    const data = (await res.json()) as
      | {
          status: "success";
          result: { original_url: string; shorten_url: string; stats_url?: string };
        }
      | { status: "error"; result: string };
    if (data.status === "error") {
      throw new Error(String(data.result ?? "Shortener API error"));
    }
    const shortUrl = data.result.shorten_url;
    return await ctx.runMutation(internal.shortener.insertShortLinkRow, {
      alias: alias || shortUrl.split("/").pop() || crypto.randomUUID(),
      originalUrl: longUrl,
      shortUrl,
      statsUrl: data.result.stats_url,
      adType,
      userId: args.userId,
    });
  },
});

/** Panel entry point: verifies the caller is owner/admin, then shortens. */
export const createShortLink = action({
  args: {
    url: v.string(),
    alias: v.optional(v.string()),
    adType: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ShortLinkRecord> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const role = await ctx.runQuery(internal.shortener.getUserRole, { userId });
    if (role !== "owner" && role !== "admin") {
      throw new Error(`Forbidden — your role is "${role}" but this requires: owner or admin`);
    }
    return await ctx.runAction(internal.shortener.createShortLinkByKey, {
      url: args.url,
      alias: args.alias,
      adType: args.adType,
      userId,
    });
  },
});

/** Look up a short link by alias (used by the /s/:alias redirect). */
export const getShortLinkByAlias = internalQuery({
  args: { alias: v.string() },
  handler: async (ctx, { alias }) =>
    await ctx.db
      .query("shortLinks")
      .withIndex("by_alias", (q) => q.eq("alias", alias))
      .first(),
});

/** Count a click when /s/:alias is opened. */
export const clickShortLink = internalMutation({
  args: { id: v.id("shortLinks") },
  handler: async (ctx, { id }) => {
    const link = await ctx.db.get(id);
    if (link !== null) {
      await ctx.db.patch(id, { clicks: link.clicks + 1 });
    }
  },
});

/** Upsert a device registration (called from POST /api/device in http.ts). */
export const recordDevice = internalMutation({
  args: {
    deviceId: v.string(),
    key: v.optional(v.string()),
    ip: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = args.deviceId.slice(0, 200);
    const existing = await ctx.db
      .query("devices")
      .withIndex("by_device", (q) => q.eq("deviceId", id))
      .first();

    // Resolve the license key when one is provided.
    let keyId: Id<"connectKeys"> | undefined = undefined;
    if (args.key) {
      const keyDoc = await ctx.db
        .query("connectKeys")
        .withIndex("by_key", (q) => q.eq("key", args.key as string))
        .first();
      if (keyDoc) keyId = keyDoc._id;
    }

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastIp: args.ip?.slice(0, 64) || existing.lastIp,
        lastSeen: now,
        hits: existing.hits + 1,
        keyId: keyId ?? existing.keyId,
      });
      return { registered: true, hits: existing.hits + 1, deviceId: id };
    }
    await ctx.db.insert("devices", {
      deviceId: id,
      keyId,
      lastIp: args.ip?.slice(0, 64),
      lastSeen: now,
      firstSeen: now,
      hits: 1,
    });
    return { registered: true, hits: 1, deviceId: id };
  },
});
