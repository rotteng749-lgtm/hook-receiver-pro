import { getAuthUserId } from "@convex-dev/auth/server";
import { generateRandomString, RandomReader } from "@oslojs/crypto/random";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";

const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const PATH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Generate a cryptographically random, URL-safe secret for a hook.
 * Used both at creation time and when rotating a token.
 */
export function generateToken(length = 32): string {
  const random: RandomReader = {
    read(bytes: Uint8Array) {
      crypto.getRandomValues(bytes);
    },
  };
  return generateRandomString(random, TOKEN_ALPHABET, length);
}

/** All hooks owned by the current user, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("hooks")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();
  },
});

/** Look up a hook by its URL path. Internal — called by the public HTTP action. */
export const getByPath = internalQuery({
  args: { path: v.string() },
  handler: async (ctx, { path }) => {
    const normalized = path.trim().toLowerCase();
    if (normalized.length === 0) return null;
    return await ctx.db
      .query("hooks")
      .withIndex("by_path", (q) => q.eq("path", normalized))
      .first();
  },
});

/** Fetch a single hook, verifying ownership. */
export const get = query({
  args: { id: v.id("hooks") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const hook = await ctx.db.get(id);
    if (userId === null || hook === null || hook.ownerId !== userId) {
      return null;
    }
    return hook;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    path: v.string(),
    methods: v.array(v.string()),
    requireToken: v.boolean(),
    responseStatus: v.number(),
    responseContentType: v.string(),
    responseBody: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const path = args.path.trim().toLowerCase();
    if (path.length < 2 || path.length > 64 || !PATH_PATTERN.test(path)) {
      throw new Error(
        "Path must be 2-64 characters using letters, numbers, dashes or underscores",
      );
    }
    const existing = await ctx.db
      .query("hooks")
      .withIndex("by_path", (q) => q.eq("path", path))
      .first();
    if (existing !== null) {
      throw new Error(`A hook with path "/${path}" already exists`);
    }
    const status = Math.round(args.responseStatus);
    if (status < 100 || status > 599) {
      throw new Error("Response status must be between 100 and 599");
    }
    const id = await ctx.db.insert("hooks", {
      name: args.name.trim() || path,
      path,
      methods: args.methods.length > 0 ? args.methods : ["GET", "POST"],
      token: generateToken(),
      requireToken: args.requireToken,
      enabled: true,
      responseStatus: status,
      responseContentType: args.responseContentType,
      responseBody: args.responseBody,
      ownerId: userId,
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    id: v.id("hooks"),
    patch: v.object({
      name: v.optional(v.string()),
      methods: v.optional(v.array(v.string())),
      requireToken: v.optional(v.boolean()),
      enabled: v.optional(v.boolean()),
      responseStatus: v.optional(v.number()),
      responseContentType: v.optional(v.string()),
      responseBody: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const userId = await getAuthUserId(ctx);
    const hook = await ctx.db.get(id);
    if (userId === null || hook === null || hook.ownerId !== userId) {
      throw new Error("Hook not found");
    }
    if (patch.responseStatus !== undefined) {
      const status = Math.round(patch.responseStatus);
      if (status < 100 || status > 599) {
        throw new Error("Response status must be between 100 and 599");
      }
      patch.responseStatus = status;
    }
    await ctx.db.patch(id, patch);
    return await ctx.db.get(id);
  },
});

/** Regenerate the secret token for a hook. Old tokens stop working. */
export const rotateToken = mutation({
  args: { id: v.id("hooks") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const hook = await ctx.db.get(id);
    if (userId === null || hook === null || hook.ownerId !== userId) {
      throw new Error("Hook not found");
    }
    await ctx.db.patch(id, { token: generateToken() });
    return await ctx.db.get(id);
  },
});

/** Delete a hook and every request logged against it. */
export const remove = mutation({
  args: { id: v.id("hooks") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const hook = await ctx.db.get(id);
    if (userId === null || hook === null || hook.ownerId !== userId) {
      throw new Error("Hook not found");
    }
    const logged = await ctx.db
      .query("requests")
      .withIndex("by_hook", (q) => q.eq("hookId", id))
      .collect();
    for (const request of logged) {
      await ctx.db.delete(request._id);
    }
    await ctx.db.delete(id);
  },
});
