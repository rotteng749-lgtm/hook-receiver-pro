import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

const MAX_RESULTS = 200;

/**
 * Recent requests for the signed-in user, newest first. Pass an optional
 * hookId to scope the list to a single hook.
 */
export const listForOwner = query({
  args: { hookId: v.optional(v.id("hooks")) },
  handler: async (ctx, { hookId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(MAX_RESULTS);
    if (hookId === undefined) return requests;
    return requests.filter((r) => r.hookId === hookId);
  },
});

/** Total number of logged requests for the signed-in user (capped at 1000). */
export const countForOwner = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0;
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .take(1000);
    return requests.length;
  },
});

/** Called from the webhook HTTP action to persist a captured request. */
export const insertLog = internalMutation({
  args: {
    hookId: v.id("hooks"),
    ownerId: v.id("users"),
    method: v.string(),
    url: v.string(),
    headers: v.optional(v.record(v.string(), v.string())),
    query: v.optional(v.record(v.string(), v.string())),
    body: v.optional(v.string()),
    bodyType: v.optional(v.string()),
    ip: v.optional(v.string()),
    status: v.number(),
    authenticated: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("requests", args);
  },
});

/** Delete all logged requests for one of the current user's hooks. */
export const clearForHook = mutation({
  args: { hookId: v.id("hooks") },
  handler: async (ctx, { hookId }) => {
    const userId = await getAuthUserId(ctx);
    const hook = await ctx.db.get(hookId);
    if (userId === null || hook === null || hook.ownerId !== userId) {
      throw new Error("Hook not found");
    }
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_hook", (q) => q.eq("hookId", hookId))
      .collect();
    for (const request of requests) {
      await ctx.db.delete(request._id);
    }
  },
});

/** Delete all logged requests for the current user. */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .take(MAX_RESULTS);
    for (const request of requests) {
      await ctx.db.delete(request._id);
    }
  },
});
