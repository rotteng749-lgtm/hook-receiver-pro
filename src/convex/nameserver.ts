/**
 * Nameserver (connect server) backend.
 *
 * The panel manages "servers" (nameservers) that clients connect to by
 * presenting a generated key at POST /connect (or GET /connect). Roles:
 *
 *   owner — full control: all settings, every server/key/connection,
 *           member roles and balances.
 *   admin — creates/manages servers (theirs), generates keys. Each
 *           generated key deducts `settings.keyPrice` from their balance.
 *   user  — account holder; sees their profile (balance) only.
 *
 * The public connect endpoint lives in convex/http.ts and calls the
 * internal helpers at the bottom of this file.
 */
import { createAccount, getAuthUserId } from "@convex-dev/auth/server";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type PanelRole = "owner" | "admin" | "user" | "member";

/** createAccount is typed for a bare GenericActionCtx; our generated
 *  MutationCtx is runtime-compatible but TS can't prove the variance. */
function asActionCtx(ctx: MutationCtx): GenericActionCtx<GenericDataModel> {
  return ctx as unknown as GenericActionCtx<GenericDataModel>;
}

export const DEFAULT_SETTINGS = {
  keyPrice: 10,
  defaultKeyUses: 0, // 0 = unlimited
  defaultKeyHours: 0, // 0 = never expires
  maintenance: false,
  downMessage: "",
  keyPrefix: "NS", // keys look like NS-XXXX-XXXX-… (customizable in Settings)
} as const;

/** Look up the single global settings doc (or null when never saved). */
export async function getSettingsDoc(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("settings")
    .withIndex("by_scope", (q) => q.eq("scope", "global"))
    .first();
}

async function getAuthUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("User not found");
  return { userId, user };
}

function roleOf(user: Doc<"users"> | null | undefined): PanelRole {
  return ((user?.role ?? "user") as PanelRole) ?? "user";
}

async function requireRole(ctx: QueryCtx | MutationCtx, roles: PanelRole[]) {
  const { userId, user } = await getAuthUser(ctx);
  if (!roles.includes(roleOf(user))) throw new Error("Forbidden");
  return { userId, user };
}

/* ------------------------------ settings ------------------------------ */

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireRole(ctx, ["owner", "admin"]);
    void user;
    const doc = await getSettingsDoc(ctx);
    return {
      keyPrice: doc?.keyPrice ?? DEFAULT_SETTINGS.keyPrice,
      defaultKeyUses: doc?.defaultKeyUses ?? DEFAULT_SETTINGS.defaultKeyUses,
      defaultKeyHours: doc?.defaultKeyHours ?? DEFAULT_SETTINGS.defaultKeyHours,
      maintenance: doc?.maintenance ?? DEFAULT_SETTINGS.maintenance,
      downMessage: doc?.downMessage ?? DEFAULT_SETTINGS.downMessage,
      keyPrefix: doc?.keyPrefix ?? DEFAULT_SETTINGS.keyPrefix,
    };
  },
});

export const updateSettings = mutation({
  args: {
    keyPrice: v.number(),
    defaultKeyUses: v.number(),
    defaultKeyHours: v.number(),
    maintenance: v.boolean(),
    downMessage: v.optional(v.string()),
    keyPrefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["owner"]);
    // Sanitize the key prefix: A-Z, 0-9, 1-10 chars.
    const rawPrefix = (args.keyPrefix ?? DEFAULT_SETTINGS.keyPrefix)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const keyPrefix = rawPrefix.slice(0, 10) || DEFAULT_SETTINGS.keyPrefix;
    const patch = {
      keyPrice: Math.max(0, Math.round(args.keyPrice)),
      defaultKeyUses: Math.max(0, Math.round(args.defaultKeyUses)),
      defaultKeyHours: Math.max(0, Math.round(args.defaultKeyHours)),
      maintenance: args.maintenance,
      downMessage: args.downMessage?.trim().slice(0, 200) || "",
      keyPrefix,
    };
    const doc = await getSettingsDoc(ctx);
    if (doc) {
      await ctx.db.patch(doc._id, patch);
    } else {
      await ctx.db.insert("settings", { scope: "global", ...patch });
    }
  },
});

/* ------------------------------ bootstrap ------------------------------ */

/**
 * The very first non-anonymous account to sign up becomes the owner.
 * Idempotent and a no-op once an owner exists. Mounted once per session
 * (BootstrapRole) so the panel always has an owner.
 */
export const bootstrapOwner = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await getAuthUser(ctx);
    if (user.isAnonymous) return; // guests can never claim ownership
    if (roleOf(user) === "owner") return;
    const ownerExists = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "owner"))
      .take(1);
    if (ownerExists.length === 0) {
      await ctx.db.patch(userId, { role: "owner", balance: user.balance ?? 0 });
    }
  },
});

/* --------------------------- owner account --------------------------- */

/**
 * Ensures the fixed owner account exists and is the owner. Credentials come
 * from ADMIN_USERNAME / ADMIN_PASSWORD (defaults: Panxcz / Panxxcz) — the
 * same pair used by the REST /api/login endpoint. Called from the sign-in
 * page on mount so the owner can always log in with username + password,
 * no email needed. Idempotent: if the username already has an account it is
 * promoted to owner (if needed) instead of creating a duplicate.
 */
export const seedOwner = mutation({
  args: {},
  handler: async (ctx) => {
    const username = (process.env.ADMIN_USERNAME ?? "Panxcz").trim();
    const password = process.env.ADMIN_PASSWORD ?? "Panxxcz";
    if (username.length === 0 || password.length === 0) {
      return { created: false, username: "" };
    }
    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", username),
      )
      .first();
    if (existing) {
      const user = await ctx.db.get(existing.userId);
      if (user && user.role !== "owner") {
        await ctx.db.patch(existing.userId, { role: "owner" });
      }
      return { created: false, username };
    }
    await createAccount(asActionCtx(ctx), {
      provider: "password",
      account: { id: username, secret: password },
      profile: { email: username, name: username, role: "owner", balance: 0 },
    });
    return { created: true, username };
  },
});

/** Owner-only: create a member account with username/password. */
export const createMember = mutation({
  args: {
    username: v.string(),
    password: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("user"),
      v.literal("member"),
    ),
    balance: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["owner"]);
    const username = args.username.trim().slice(0, 60);
    if (username.length < 3) {
      throw new Error("Username must be at least 3 characters");
    }
    if (args.password.length < 4) {
      throw new Error("Password must be at least 4 characters");
    }
    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", username),
      )
      .first();
    if (existing) {
      throw new Error(`Username "${username}" is already taken`);
    }
    await createAccount(asActionCtx(ctx), {
      provider: "password",
      account: { id: username, secret: args.password },
      profile: {
        email: username,
        name: username,
        role: args.role,
        balance: Math.max(0, Math.round(args.balance)),
      },
    });
    return { username };
  },
});

/* ------------------------------ servers ------------------------------ */

const CODE_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

export const listServers = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireRole(ctx, ["owner", "admin"]);
    const servers = await ctx.db.query("servers").order("desc").collect();
    const creatorIds = new Set(servers.map((s) => s.createdBy));
    const creators = new Map<Id<"users">, Doc<"users">>();
    for (const id of creatorIds) {
      const u = await ctx.db.get(id);
      if (u) creators.set(id, u);
    }
    return servers.map((s) => ({
      ...s,
      creatorEmail:
        creators.get(s.createdBy)?.email ??
        creators.get(s.createdBy)?.name ??
        "unknown",
      canManage: roleOf(user) === "owner" || s.createdBy === user._id,
    }));
  },
});

export const createServer = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, ["owner", "admin"]);
    const name = args.name.trim().slice(0, 80);
    const code = args.code.trim().toLowerCase().slice(0, 32);
    if (name.length === 0) throw new Error("Server name is required");
    if (!CODE_RE.test(code)) {
      throw new Error(
        "Code must be 2–32 chars: lowercase letters, numbers and dashes",
      );
    }
    const existing = await ctx.db
      .query("servers")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (existing) throw new Error(`A server with code "${code}" already exists`);
    return await ctx.db.insert("servers", {
      name,
      code,
      description: args.description?.trim() || undefined,
      status: "active",
      createdBy: userId,
    });
  },
});

export const updateServer = mutation({
  args: {
    id: v.id("servers"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("off"))),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRole(ctx, ["owner", "admin"]);
    const server = await ctx.db.get(args.id);
    if (server === null) throw new Error("Server not found");
    if (roleOf(user) !== "owner" && server.createdBy !== user._id) {
      throw new Error("Forbidden");
    }
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const name = args.name.trim().slice(0, 80);
      if (name.length === 0) throw new Error("Server name cannot be empty");
      patch.name = name;
    }
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.id, patch);
  },
});

export const deleteServer = mutation({
  args: { id: v.id("servers") },
  handler: async (ctx, { id }) => {
    const { user } = await requireRole(ctx, ["owner", "admin"]);
    const server = await ctx.db.get(id);
    if (server === null) throw new Error("Server not found");
    if (roleOf(user) !== "owner" && server.createdBy !== user._id) {
      throw new Error("Forbidden");
    }
    // Cascade: remove the server's keys and their connection log.
    const keys = await ctx.db
      .query("connectKeys")
      .withIndex("by_server", (q) => q.eq("serverId", id))
      .collect();
    for (const k of keys) {
      const conns = await ctx.db
        .query("connections")
        .withIndex("by_key", (q) => q.eq("keyId", k._id))
        .collect();
      for (const c of conns) await ctx.db.delete(c._id);
      await ctx.db.delete(k._id);
    }
    const conns = await ctx.db
      .query("connections")
      .withIndex("by_server", (q) => q.eq("serverId", id))
      .collect();
    for (const c of conns) await ctx.db.delete(c._id);
    await ctx.db.delete(id);
  },
});

/* ------------------------------ keys ------------------------------ */

const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
function generateKeyValue(prefix: string): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += KEY_ALPHABET[b % KEY_ALPHABET.length];
  return `${prefix}-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}`;
}

export const generateKey = mutation({
  args: {
    serverId: v.id("servers"),
    note: v.optional(v.string()),
    uses: v.optional(v.number()),
    hours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireRole(ctx, ["owner", "admin"]);
    const server = await ctx.db.get(args.serverId);
    if (server === null) throw new Error("Server not found");
    if (server.status !== "active") throw new Error("Server is offline");

    const settings = await getSettingsDoc(ctx);
    const maxUses = Math.max(
      0,
      Math.round(args.uses ?? settings?.defaultKeyUses ?? DEFAULT_SETTINGS.defaultKeyUses),
    );
    const hours = Math.max(
      0,
      Math.round(args.hours ?? settings?.defaultKeyHours ?? DEFAULT_SETTINGS.defaultKeyHours),
    );
    const cost = settings?.keyPrice ?? DEFAULT_SETTINGS.keyPrice;
    const prefix = settings?.keyPrefix ?? DEFAULT_SETTINGS.keyPrefix;
    const isOwner = roleOf(user) === "owner";
    const balance = user.balance ?? 0;
    // The owner's wallet is unlimited — no check, nothing is deducted.
    if (!isOwner && balance < cost) {
      throw new Error(
        `Insufficient balance — this key costs ${cost}, your balance is ${balance}`,
      );
    }

    let key = generateKeyValue(prefix);
    for (let i = 0; i < 5; i++) {
      const dup = await ctx.db
        .query("connectKeys")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (dup === null) break;
      key = generateKeyValue(prefix);
    }

    const id = await ctx.db.insert("connectKeys", {
      key,
      serverId: server._id,
      createdBy: userId,
      status: "active",
      maxUses,
      uses: 0,
      expiresAt: hours > 0 ? Date.now() + hours * 60 * 60 * 1000 : 0,
      cost,
      note: args.note?.trim().slice(0, 160) || undefined,
    });
    if (!isOwner) {
      await ctx.db.patch(userId, { balance: balance - cost });
    }
    return { id, key, cost, balance: isOwner ? balance : balance - cost };
  },
});

export const listKeys = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireRole(ctx, ["owner", "admin"]);
    const isOwner = roleOf(user) === "owner";
    const keys = isOwner
      ? await ctx.db.query("connectKeys").order("desc").take(300)
      : await ctx.db
          .query("connectKeys")
          .withIndex("by_creator", (q) => q.eq("createdBy", user._id))
          .order("desc")
          .take(300);

    const serverIds = new Set(keys.map((k) => k.serverId));
    const servers = new Map<Id<"servers">, Doc<"servers">>();
    for (const id of serverIds) {
      const s = await ctx.db.get(id);
      if (s) servers.set(id, s);
    }
    const creatorIds = new Set(keys.map((k) => k.createdBy));
    const creators = new Map<Id<"users">, Doc<"users">>();
    for (const id of creatorIds) {
      const u = await ctx.db.get(id);
      if (u) creators.set(id, u);
    }
    return keys.map((k) => ({
      ...k,
      serverName: servers.get(k.serverId)?.name ?? "deleted server",
      serverCode: servers.get(k.serverId)?.code ?? "",
      creatorEmail:
        creators.get(k.createdBy)?.email ??
        creators.get(k.createdBy)?.name ??
        "unknown",
      canManage: isOwner || k.createdBy === user._id,
    }));
  },
});

export const revokeKey = mutation({
  args: { id: v.id("connectKeys") },
  handler: async (ctx, { id }) => {
    const { user } = await requireRole(ctx, ["owner", "admin"]);
    const key = await ctx.db.get(id);
    if (key === null) throw new Error("Key not found");
    if (roleOf(user) !== "owner" && key.createdBy !== user._id) {
      throw new Error("Forbidden");
    }
    await ctx.db.patch(id, { status: "revoked" });
  },
});

export const deleteKey = mutation({
  args: { id: v.id("connectKeys") },
  handler: async (ctx, { id }) => {
    const { user } = await requireRole(ctx, ["owner", "admin"]);
    const key = await ctx.db.get(id);
    if (key === null) throw new Error("Key not found");
    if (roleOf(user) !== "owner" && key.createdBy !== user._id) {
      throw new Error("Forbidden");
    }
    const conns = await ctx.db
      .query("connections")
      .withIndex("by_key", (q) => q.eq("keyId", id))
      .collect();
    for (const c of conns) await ctx.db.delete(c._id);
    await ctx.db.delete(id);
  },
});

/* ------------------------------ members (owner) ------------------------------ */

export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["owner"]);
    const users = await ctx.db.query("users").take(500);
    return users.map((u) => ({
      _id: u._id,
      name: u.name ?? null,
      email: u.email ?? null,
      isAnonymous: u.isAnonymous ?? false,
      role: roleOf(u),
      balance: u.balance ?? 0,
      createdAt: u._creationTime,
    }));
  },
});

export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("user"),
      v.literal("member"),
    ),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, ["owner"]);
    if (args.userId === userId) throw new Error("You cannot change your own role");
    const target = await ctx.db.get(args.userId);
    if (target === null) throw new Error("User not found");
    await ctx.db.patch(args.userId, {
      role: args.role,
      balance: target.balance ?? 0,
    });
  },
});

export const setBalance = mutation({
  args: { userId: v.id("users"), balance: v.number() },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["owner"]);
    const target = await ctx.db.get(args.userId);
    if (target === null) throw new Error("User not found");
    await ctx.db.patch(args.userId, {
      balance: Math.max(0, Math.round(args.balance)),
    });
  },
});

/* ------------------------------ connections ------------------------------ */

export const listConnections = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireRole(ctx, ["owner", "admin"]);
    let conns: Doc<"connections">[];
    if (roleOf(user) === "owner") {
      conns = await ctx.db.query("connections").order("desc").take(200);
    } else {
      const myKeys = await ctx.db
        .query("connectKeys")
        .withIndex("by_creator", (q) => q.eq("createdBy", user._id))
        .take(300);
      const ids = myKeys.map((k) => k._id);
      if (ids.length === 0) return [];
      conns = await ctx.db
        .query("connections")
        .filter((q) =>
          q.or(...ids.map((id) => q.eq(q.field("keyId"), id))),
        )
        .order("desc")
        .take(200);
    }
    const serverIds = new Set(
      conns
        .map((c) => c.serverId)
        .filter((id): id is Id<"servers"> => id !== undefined),
    );
    const servers = new Map<Id<"servers">, Doc<"servers">>();
    for (const id of serverIds) {
      const s = await ctx.db.get(id);
      if (s) servers.set(id, s);
    }
    return conns.map((c) => ({
      ...c,
      serverName: c.serverId ? (servers.get(c.serverId)?.name ?? "deleted server") : "—",
      serverCode: c.serverId ? (servers.get(c.serverId)?.code ?? "") : "",
    }));
  },
});

/* ------------------------------ stats ------------------------------ */

export const overviewStats = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireRole(ctx, ["owner", "admin"]);
    const isOwner = roleOf(user) === "owner";

    const serverCount = (await ctx.db.query("servers").collect()).length;

    let keys: Doc<"connectKeys">[];
    if (isOwner) keys = await ctx.db.query("connectKeys").take(1000);
    else
      keys = await ctx.db
        .query("connectKeys")
        .withIndex("by_creator", (q) => q.eq("createdBy", user._id))
        .take(1000);

    const myKeyIds = new Set(keys.map((k) => k._id));
    let conns: Doc<"connections">[];
    if (isOwner) conns = await ctx.db.query("connections").take(1000);
    else if (myKeyIds.size > 0)
      conns = await ctx.db
        .query("connections")
        .filter((q) =>
          q.or(...[...myKeyIds].map((id) => q.eq(q.field("keyId"), id))),
        )
        .take(1000);
    else conns = [];

    const members = isOwner ? await ctx.db.query("users").take(500) : [];

    return {
      role: roleOf(user),
      balance: user.balance ?? 0,
      unlimited: isOwner,
      serverCount,
      keyCount: keys.length,
      activeKeyCount: keys.filter((k) => k.status === "active").length,
      connectCount: conns.length,
      successCount: conns.filter((c) => c.ok).length,
      memberCount: members.length,
      totalBalance: members.reduce((sum, m) => sum + (m.balance ?? 0), 0),
      revenue: keys.reduce((sum, k) => sum + k.cost, 0),
    };
  },
});

/* -------------------- internal helpers (http.ts /connect) -------------------- */

export const getServerByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    return await ctx.db
      .query("servers")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
  },
});

export const getKeyByValue = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    return await ctx.db
      .query("connectKeys")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
  },
});

export const getServerById = internalQuery({
  args: { serverId: v.id("servers") },
  handler: async (ctx, { serverId }) => await ctx.db.get(serverId),
});

export const getSettingsInternal = internalQuery({
  args: {},
  handler: async (ctx) => await getSettingsDoc(ctx),
});

/** Log an attempt and (on success) advance the key's usage counter. */
export const recordConnect = internalMutation({
  args: {
    keyId: v.optional(v.id("connectKeys")),
    key: v.string(),
    serverId: v.optional(v.id("servers")),
    ip: v.string(),
    userAgent: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    ok: v.boolean(),
    reason: v.optional(v.string()),
    // Bind the key to this device on the first successful connect.
    bindDevice: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("connections", {
      keyId: args.keyId,
      key: args.key.slice(0, 80),
      serverId: args.serverId,
      ip: args.ip.slice(0, 64),
      userAgent: args.userAgent?.slice(0, 200) || undefined,
      deviceId: args.deviceId?.slice(0, 128) || undefined,
      ok: args.ok,
      reason: args.reason,
    });
    if (args.ok && args.keyId !== undefined) {
      const key = await ctx.db.get(args.keyId);
      if (key !== null) {
        const uses = key.uses + 1;
        const status =
          key.maxUses > 0 && uses >= key.maxUses ? "used" : key.status;
        const patch: {
          uses: number;
          status: Doc<"connectKeys">["status"];
          deviceId?: string;
        } = { uses, status };
        // 1 key = 1 device: bind on first successful connect.
        if (args.bindDevice && key.deviceId === undefined && args.deviceId) {
          patch.deviceId = args.deviceId.slice(0, 128);
        }
        await ctx.db.patch(args.keyId, patch);
      }
    }
  },
});

/* -------------------- internal helpers (telegram bot) -------------------- */

export const listServersInternal = internalQuery({
  args: {},
  handler: async (ctx) =>
    await ctx.db.query("servers").order("desc").take(100),
});

export const listKeysInternal = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) =>
    await ctx.db
      .query("connectKeys")
      .order("desc")
      .take(Math.max(1, Math.min(limit, 20))),
});

export const listConnectionsInternal = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) =>
    await ctx.db
      .query("connections")
      .order("desc")
      .take(Math.max(1, Math.min(limit, 20))),
});

/** Owner-level overview numbers (used by the Telegram bot). */
export const ownerStatsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const servers = await ctx.db.query("servers").collect();
    const keys = await ctx.db.query("connectKeys").take(1000);
    const conns = await ctx.db.query("connections").take(1000);
    const members = await ctx.db.query("users").take(500);
    const owner = members.find((m) => m.role === "owner");
    return {
      balance: owner?.balance ?? 0,
      unlimited: true,
      serverCount: servers.length,
      keyCount: keys.length,
      activeKeyCount: keys.filter((k) => k.status === "active").length,
      connectCount: conns.length,
      successCount: conns.filter((c) => c.ok).length,
      memberCount: members.length,
      totalBalance: members.reduce((sum, m) => sum + (m.balance ?? 0), 0),
      revenue: keys.reduce((sum, k) => sum + k.cost, 0),
    };
  },
});

/** Toggle maintenance mode (used by the Telegram bot). */
export const setMaintenanceInternal = internalMutation({
  args: { on: v.boolean(), message: v.optional(v.string()) },
  handler: async (ctx, { on, message }) => {
    const doc = await getSettingsDoc(ctx);
    const downMessage = message?.trim().slice(0, 200) ?? "";
    if (doc) {
      await ctx.db.patch(doc._id, { maintenance: on, downMessage });
    } else {
      await ctx.db.insert("settings", {
        scope: "global",
        keyPrice: DEFAULT_SETTINGS.keyPrice,
        defaultKeyUses: DEFAULT_SETTINGS.defaultKeyUses,
        defaultKeyHours: DEFAULT_SETTINGS.defaultKeyHours,
        maintenance: on,
        downMessage,
      });
    }
  },
});

/**
 * Generate a connect key on behalf of the owner (used by the Telegram bot
 * /genkey command). Deducts the price from the owner's balance.
 */
export const genKeyAsOwner = internalMutation({
  args: {
    serverCode: v.string(),
    uses: v.optional(v.number()),
    hours: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const server = await ctx.db
      .query("servers")
      .withIndex("by_code", (q) => q.eq("code", args.serverCode.toLowerCase()))
      .first();
    if (server === null) throw new Error(`Server "${args.serverCode}" not found`);
    if (server.status !== "active") throw new Error("Server is offline");

    const settings = await getSettingsDoc(ctx);
    const maxUses = Math.max(
      0,
      Math.round(args.uses ?? settings?.defaultKeyUses ?? DEFAULT_SETTINGS.defaultKeyUses),
    );
    const hours = Math.max(
      0,
      Math.round(args.hours ?? settings?.defaultKeyHours ?? DEFAULT_SETTINGS.defaultKeyHours),
    );
    const cost = settings?.keyPrice ?? DEFAULT_SETTINGS.keyPrice;
    const prefix = settings?.keyPrefix ?? DEFAULT_SETTINGS.keyPrefix;

    const owner = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();
    if (owner === null) throw new Error("No owner account configured");
    const balance = owner.balance ?? 0;
    // The owner's wallet is unlimited — no check, nothing is deducted.

    let key = generateKeyValue(prefix);
    for (let i = 0; i < 5; i++) {
      const dup = await ctx.db
        .query("connectKeys")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (dup === null) break;
      key = generateKeyValue(prefix);
    }

    const expiresAt = hours > 0 ? Date.now() + hours * 60 * 60 * 1000 : 0;
    await ctx.db.insert("connectKeys", {
      key,
      serverId: server._id,
      createdBy: owner._id,
      status: "active",
      maxUses,
      uses: 0,
      expiresAt,
      cost,
      note: args.note?.trim().slice(0, 160) || undefined,
    });
    return {
      key,
      cost,
      balance,
      unlimited: true,
      serverName: server.name,
      serverCode: server.code,
      maxUses,
      expiresAt,
    };
  },
});
