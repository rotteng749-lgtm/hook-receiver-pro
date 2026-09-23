/**
 * Panxcz coins + the public /getkey flow.
 *
 * The old flow required a system API token. It no longer does: the identity is
 * a simple `handle` (Telegram id, @username, or any stable string the user
 * types). On first use the account is created automatically and receives
 * `settings.getkeyWelcomeCoins` coins (default 5 = one free trial key).
 *
 *   tap GetKey  →  pick an available product (e.g. MLBB)
 *               →  startClaim (coins + daily quota checked, ShrtFly short link)
 *               →  pass through the monetized short link
 *               →  /getkey?claim=… auto-redeems  →  key valid 5 hours
 *
 * Every claim costs `settings.getkeyPrice` coins (default 5) and the account
 * can be linked to a Telegram chat (`/link <handle>`), so the bot and the
 * website share one balance.
 *
 * Self-contained module (own settings helpers, own key generator) so Convex's
 * type inference cannot form a circular reference through nameserver.ts.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

/* ------------------------------- defaults ------------------------------- */

const PRICE_DEFAULT = 5; // coins per key
const HOURS_DEFAULT = 5; // key lifetime
const MAX_PER_DAY_DEFAULT = 3;
const WELCOME_DEFAULT = 5; // coins given to a brand-new account
const CLAIM_TTL_MS = 15 * 60 * 1000;

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

/* --------------------------------- types --------------------------------- */

export interface GetkeyProduct {
  id: string;
  name: string;
  code: string;
  description: string;
}

export interface GetkeyInfo {
  enabled: boolean;
  price: number;
  hours: number;
  maxPerDay: number;
  welcomeCoins: number;
  products: GetkeyProduct[];
  botUsername: string;
}

export interface AccountStatus {
  found: boolean;
  handle: string;
  coins: number;
  price: number;
  hours: number;
  usedToday: number;
  maxPerDay: number;
  remaining: number;
  banned: boolean;
  welcomeCoins: number;
}

export type IssueResult =
  | {
      ok: true;
      key: string;
      keyId: Id<"connectKeys">;
      expiresAt: number;
      hours: number;
      coins: number;
      serverName: string;
      serverCode: string;
      used: number;
      maxPerDay: number;
      price: number;
    }
  | {
      ok: false;
      reason:
        | "no_account"
        | "banned"
        | "insufficient_coins"
        | "daily_limit"
        | "no_server"
        | "no_owner";
      used: number;
      maxPerDay: number;
      hours: number;
      price: number;
      balance: number;
    };

/** Human-readable message for a failed issue. */
export function issueErrorMessage(res: Extract<IssueResult, { ok: false }>): string {
  switch (res.reason) {
    case "no_account":
      return "Account not found — start over from the GetKey page.";
    case "banned":
      return "This account is suspended. Contact support.";
    case "insufficient_coins":
      return `Not enough Panxcz coins — a key costs ${res.price} but this account has ${res.balance}. Top up via the bot / support channel.`;
    case "daily_limit":
      return `Daily limit reached — ${res.used}/${res.maxPerDay} keys today. Come back tomorrow.`;
    case "no_server":
      return "No product is available right now — try again later.";
    case "no_owner":
      return "Server not fully configured yet.";
  }
}

/* ------------------------------- helpers --------------------------------- */

async function readSettings(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("settings")
    .withIndex("by_scope", (q) => q.eq("scope", "global"))
    .first();
}

/** Normalize a handle: lowercase, no spaces, no leading @. */
function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^@/, "")
    .slice(0, 64);
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Find an account by handle, Telegram id, or Telegram @username. */
async function findAccount(
  ctx: QueryCtx | MutationCtx,
  handle: string,
): Promise<Doc<"getkeyAccounts"> | null> {
  const h = normalizeHandle(handle);
  if (h.length === 0) return null;
  const direct = await ctx.db
    .query("getkeyAccounts")
    .withIndex("by_handle", (q) => q.eq("handle", h))
    .first();
  if (direct) return direct;
  if (/^\d{5,}$/.test(h)) {
    const byTg = await ctx.db
      .query("getkeyAccounts")
      .withIndex("by_telegram", (q) => q.eq("telegramId", h))
      .first();
    if (byTg) return byTg;
  }
  const all = await ctx.db.query("getkeyAccounts").take(500);
  return (
    all.find((a) => (a.telegramUsername ?? "").toLowerCase() === h) ?? null
  );
}

/** Servers published as products on the public GetKey page. */
async function listProducts(
  ctx: QueryCtx | MutationCtx,
): Promise<GetkeyProduct[]> {
  const servers = await ctx.db.query("servers").collect();
  const active = servers.filter((s) => s.status === "active");
  const listed = active.filter((s) => s.publicGetkey !== false);
  const chosen = listed.length > 0 ? listed : active.slice(0, 1);
  return chosen.map((s) => ({
    id: String(s._id),
    name: s.name,
    code: s.code,
    description: s.description ?? "",
  }));
}

/** Pick the server a trial key is minted on. */
async function pickServer(
  ctx: MutationCtx,
  preferredId: Id<"servers"> | undefined,
  settings: Doc<"settings"> | null,
): Promise<Doc<"servers"> | null> {
  if (preferredId) {
    const doc = await ctx.db.get(preferredId);
    if (doc && doc.status === "active") return doc;
  }
  if (settings?.getkeyServerId) {
    const doc = await ctx.db.get(settings.getkeyServerId);
    if (doc && doc.status === "active") return doc;
  }
  const listed = await ctx.db
    .query("servers")
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "active"),
        q.neq(q.field("publicGetkey"), false),
      ),
    )
    .first();
  if (listed) return listed;
  return await ctx.db
    .query("servers")
    .filter((q) => q.eq(q.field("status"), "active"))
    .first();
}

function generateKeyValue(prefix: string, format = ""): string {
  const alnum = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const digits = "0123456789";
  const pick = (source: string) =>
    source[Math.floor(Math.random() * source.length)];
  if (format.trim().length > 0) {
    return format
      .split("")
      .map((ch) => {
        if (ch === "X") return pick(alnum);
        if (ch === "#") return pick(digits);
        return ch;
      })
      .join("");
  }
  const groups = Array.from({ length: 5 }, () =>
    Array.from({ length: 4 }, () => pick(alnum)).join(""),
  );
  return `${prefix}-${groups.join("-")}`;
}

async function verifyTurnstile(token: string): Promise<boolean> {
  if (token.trim().length === 0) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_SECRET;
  const isTestSecret = secret === TURNSTILE_TEST_SECRET;
  const form = new URLSearchParams({ secret, response: token.trim() });
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    if (data.success === true) return true;
    return isTestSecret;
  } catch {
    // Network error: permissive on the test secret, strict on a real one.
    return isTestSecret;
  }
}

/** Owner/admin guard for the panel-side endpoints. */
async function requirePanelRole(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  const role = (user?.role ?? "user") as string;
  if (role !== "owner" && role !== "admin") {
    throw new Error(`Forbidden — your role is "${role}" but this requires: owner or admin`);
  }
  return userId;
}

/* ------------------------------ public info ------------------------------ */

/** Everything the public /getkey page needs to render. */
export const info = query({
  args: {},
  handler: async (ctx): Promise<GetkeyInfo> => {
    const doc = await readSettings(ctx);
    const products = await listProducts(ctx);
    return {
      enabled: doc?.getkeyWeb !== false,
      price: doc?.getkeyPrice ?? PRICE_DEFAULT,
      hours: doc?.getkeyHours ?? HOURS_DEFAULT,
      maxPerDay: doc?.getkeyMaxPerDay ?? MAX_PER_DAY_DEFAULT,
      welcomeCoins: doc?.getkeyWelcomeCoins ?? WELCOME_DEFAULT,
      products,
      botUsername: doc?.telegramBotUsername ?? "",
    };
  },
});

/**
 * Balance + quota for a handle. Never creates the account — the page shows the
 * welcome bonus when `found` is false.
 */
export const accountStatus = action({
  args: { handle: v.string() },
  handler: async (ctx, args): Promise<AccountStatus> => {
    const doc = await ctx.runQuery(internal.getkey.settingsInternal, {});
    const price = doc?.getkeyPrice ?? PRICE_DEFAULT;
    const hours = doc?.getkeyHours ?? HOURS_DEFAULT;
    const maxPerDay = doc?.getkeyMaxPerDay ?? MAX_PER_DAY_DEFAULT;
    const welcomeCoins = doc?.getkeyWelcomeCoins ?? WELCOME_DEFAULT;
    const handle = normalizeHandle(args.handle);
    const base = {
      handle,
      price,
      hours,
      maxPerDay,
      welcomeCoins,
      remaining: maxPerDay,
      usedToday: 0,
    };
    if (handle.length < 3) {
      return { ...base, found: false, coins: 0, banned: false };
    }
    const account = await ctx.runQuery(internal.getkey.accountByHandleInternal, {
      handle,
    });
    if (account === null) {
      return { ...base, found: false, coins: 0, banned: false };
    }
    const today = utcDay();
    const used = account.day === today ? (account.dayCount ?? 0) : 0;
    return {
      ...base,
      found: true,
      coins: account.coins ?? 0,
      banned: account.banned === true,
      usedToday: used,
      remaining: Math.max(0, maxPerDay - used),
    };
  },
});

/* --------------------------- internal plumbing --------------------------- */

export const settingsInternal = internalQuery({
  args: {},
  handler: async (ctx) => await readSettings(ctx),
});

export const accountByHandleInternal = internalQuery({
  args: { handle: v.string() },
  handler: async (ctx, { handle }): Promise<Doc<"getkeyAccounts"> | null> =>
    await findAccount(ctx, handle),
});

/** Read the account bound to a Telegram chat (for the bot). */
export const accountByTelegramInternal = internalQuery({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }): Promise<Doc<"getkeyAccounts"> | null> => {
    const id = chatId.trim();
    const byTg = await ctx.db
      .query("getkeyAccounts")
      .withIndex("by_telegram", (q) => q.eq("telegramId", id))
      .first();
    if (byTg) return byTg;
    return await findAccount(ctx, id);
  },
});

/** Read the account a bot user owns (linked chat first, else the chat handle). */
export const getOrCreateAccountInternal = internalMutation({
  args: {
    handle: v.string(),
    telegramId: v.optional(v.string()),
    telegramUsername: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"getkeyAccounts">> => {
    const settings = await readSettings(ctx);
    const welcome = settings?.getkeyWelcomeCoins ?? WELCOME_DEFAULT;
    const h = normalizeHandle(args.handle);
    if (h.length < 3) {
      throw new Error("Handle must be at least 3 characters");
    }
    const now = Date.now();
    const existing = await findAccount(ctx, h);
    if (existing) {
      const patch: Partial<Doc<"getkeyAccounts">> = { lastSeen: now };
      if (args.telegramId && !existing.telegramId) patch.telegramId = args.telegramId;
      if (args.telegramUsername) patch.telegramUsername = args.telegramUsername;
      await ctx.db.patch(existing._id, patch);
      const fresh = await ctx.db.get(existing._id);
      return fresh ?? existing;
    }
    const id = await ctx.db.insert("getkeyAccounts", {
      handle: h,
      displayHandle: args.handle.trim().slice(0, 64),
      telegramId: args.telegramId,
      telegramUsername: args.telegramUsername,
      coins: welcome,
      totalClaims: 0,
      totalSpent: 0,
      banned: false,
      createdAt: now,
      lastSeen: now,
    });
    const created = await ctx.db.get(id);
    if (created === null) throw new Error("Could not create the account");
    return created;
  },
});

/** Bind a Telegram chat to a web handle (`/link <handle>`). */
export const linkTelegramInternal = internalMutation({
  args: {
    handle: v.string(),
    chatId: v.string(),
    telegramUsername: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ linked: boolean; handle: string; coins: number } | null> => {
    const account = await findAccount(ctx, args.handle);
    if (account === null) return null;
    await ctx.db.patch(account._id, {
      telegramId: args.chatId.trim(),
      telegramUsername: args.telegramUsername ?? account.telegramUsername,
      lastSeen: Date.now(),
    });
    return { linked: true, handle: account.handle, coins: account.coins ?? 0 };
  },
});

/** Create the claim row for the shortener gate. */
export const createClaimInternal = internalMutation({
  args: {
    token: v.string(),
    handle: v.string(),
    accountId: v.id("getkeyAccounts"),
    serverId: v.optional(v.id("servers")),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("keyClaims", {
      token: args.token,
      tokenHash: `account:${args.handle}`,
      handle: args.handle,
      accountId: args.accountId,
      serverId: args.serverId,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
      redeemed: false,
    });
    return true;
  },
});

/**
 * Mint a trial key for a coin account. Atomic: the daily cap, the coin
 * deduction and the key insert all happen in one transaction.
 */
export const issueForKey = internalMutation({
  args: {
    handle: v.string(),
    serverId: v.optional(v.id("servers")),
  },
  handler: async (ctx, args): Promise<IssueResult> => {
    const settings = await readSettings(ctx);
    const hours = settings?.getkeyHours ?? HOURS_DEFAULT;
    const maxPerDay = settings?.getkeyMaxPerDay ?? MAX_PER_DAY_DEFAULT;
    const price = settings?.getkeyPrice ?? PRICE_DEFAULT;
    const prefix = settings?.keyPrefix ?? "NS";
    const keyFormat = settings?.keyFormat ?? "";
    const today = utcDay();

    const account = await findAccount(ctx, args.handle);
    if (account === null) {
      return { ok: false, reason: "no_account", used: 0, maxPerDay, hours, price, balance: 0 };
    }
    if (account.banned === true) {
      return {
        ok: false,
        reason: "banned",
        used: 0,
        maxPerDay,
        hours,
        price,
        balance: account.coins ?? 0,
      };
    }
    const balance = account.coins ?? 0;
    if (balance < price) {
      return { ok: false, reason: "insufficient_coins", used: 0, maxPerDay, hours, price, balance };
    }
    const usedToday = account.day === today ? (account.dayCount ?? 0) : 0;
    if (usedToday >= maxPerDay) {
      return {
        ok: false,
        reason: "daily_limit",
        used: usedToday,
        maxPerDay,
        hours,
        price,
        balance,
      };
    }

    const server = await pickServer(ctx, args.serverId, settings);
    if (server === null) {
      return { ok: false, reason: "no_server", used: usedToday, maxPerDay, hours, price, balance };
    }

    const owner = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();
    if (owner === null) {
      return { ok: false, reason: "no_owner", used: usedToday, maxPerDay, hours, price, balance };
    }

    let key = generateKeyValue(prefix, keyFormat);
    for (let i = 0; i < 5; i++) {
      const dup = await ctx.db
        .query("connectKeys")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (dup === null) break;
      key = generateKeyValue(prefix, keyFormat);
    }

    const expiresAt = Date.now() + hours * 60 * 60 * 1000;
    const keyId = await ctx.db.insert("connectKeys", {
      key,
      serverId: server._id,
      createdBy: owner._id,
      status: "active",
      maxUses: 0,
      uses: 0,
      expiresAt,
      cost: price,
      note: `getkey:${account.handle}`,
      maxDevices: 1,
    });

    await ctx.db.patch(account._id, {
      coins: balance - price,
      totalClaims: (account.totalClaims ?? 0) + 1,
      totalSpent: (account.totalSpent ?? 0) + price,
      day: today,
      dayCount: usedToday + 1,
      lastKey: key,
      lastKeyExpiresAt: expiresAt,
      lastSeen: Date.now(),
    });

    return {
      ok: true,
      key,
      keyId,
      expiresAt,
      hours,
      coins: balance - price,
      serverName: server.name,
      serverCode: server.code,
      used: usedToday + 1,
      maxPerDay,
      price,
    };
  },
});

/* ------------------------- public claim flow (web) ------------------------ */

/**
 * Step 1: validate the account (auto-created with welcome coins), check coins
 * and quota, then hand back a ShrtFly short link wrapping the continue URL.
 * The key itself is NOT issued here.
 */
export const startClaim = action({
  args: {
    turnstileToken: v.optional(v.string()),
    handle: v.string(),
    serverId: v.optional(v.string()),
    origin: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ claimToken: string; shortUrl: string; expiresAt: number; handle: string }> => {
    const captcha = (args.turnstileToken ?? "").trim();
    const secret = process.env.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_SECRET;
    if (secret !== TURNSTILE_TEST_SECRET) {
      if (!(await verifyTurnstile(captcha))) {
        throw new Error(
          "Human verification failed — please complete the captcha and try again.",
        );
      }
    } else if (captcha.length > 0) {
      await verifyTurnstile(captcha).catch(() => {});
    }

    const handle = normalizeHandle(args.handle);
    if (handle.length < 3) {
      throw new Error(
        "Enter your Telegram ID or a handle of at least 3 characters.",
      );
    }

    const settings = await ctx.runQuery(internal.getkey.settingsInternal, {});
    const info = {
      enabled: settings?.getkeyWeb !== false,
      price: settings?.getkeyPrice ?? PRICE_DEFAULT,
      hours: settings?.getkeyHours ?? HOURS_DEFAULT,
      maxPerDay: settings?.getkeyMaxPerDay ?? MAX_PER_DAY_DEFAULT,
    };
    if (!info.enabled) {
      throw new Error("The free key page is currently disabled.");
    }

    // Resolve the chosen product (server) up-front so a stale id can't slip in.
    let serverId: Id<"servers"> | undefined = undefined;
    if (args.serverId && args.serverId.trim().length > 0) {
      const normalized = await ctx.runQuery(internal.getkey.resolveServerInternal, {
        serverId: args.serverId.trim(),
      });
      if (normalized === null) {
        throw new Error("That product is not available right now — pick another one.");
      }
      serverId = normalized;
    } else {
      const products = await ctx.runQuery(internal.getkey.listProductsInternal, {});
      if (products.length === 0) {
        throw new Error("No product is available right now — try again later.");
      }
      serverId = products[0].id as Id<"servers">;
    }

    // Auto-create the account (welcome coins) and read its state.
    const account = await ctx.runMutation(internal.getkey.getOrCreateAccountInternal, {
      handle,
    });
    if (account.banned === true) {
      throw new Error("This account is suspended — contact support.");
    }
    const coins = account.coins ?? 0;
    if (coins < info.price) {
      throw new Error(
        `Not enough Panxcz coins — a key costs ${info.price} but this account has ${coins}. Top up via the bot / support channel.`,
      );
    }
    const today = utcDay();
    const usedToday = account.day === today ? (account.dayCount ?? 0) : 0;
    if (usedToday >= info.maxPerDay) {
      throw new Error(
        `Daily limit reached — ${usedToday}/${info.maxPerDay} keys today. Come back tomorrow.`,
      );
    }

    let origin: string;
    try {
      origin = new URL(args.origin).origin;
      if (!origin.startsWith("http")) throw new Error("bad origin");
    } catch {
      throw new Error("Invalid page origin.");
    }

    const claimToken = (
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "")
    ).slice(0, 64);
    const expiresAt = Date.now() + CLAIM_TTL_MS;
    await ctx.runMutation(internal.getkey.createClaimInternal, {
      token: claimToken,
      handle,
      accountId: account._id,
      serverId,
      expiresAt,
    });

    // Wrap the continue URL in the owner's ShrtFly short link. If ShrtFly is
    // down we fall back to the direct URL so the flow never hard-fails.
    const continueUrl = `${origin}/getkey?claim=${claimToken}&h=${encodeURIComponent(handle)}`;
    let shortUrl = continueUrl;
    const apiKey = settings?.shortenerApiKey || "ea3e5b3e3dcd0019ac9f395f2d8e4062";
    const params = new URLSearchParams({
      api: apiKey,
      url: continueUrl,
      type: String(settings?.shortenerAdType === 2 ? 2 : 1),
      format: "json",
    });
    try {
      const res = await fetch(`https://shrtfly.com/api?${params.toString()}`);
      const data = (await res.json()) as {
        status?: string;
        result?: { shorten_url?: string } | string;
      };
      if (
        data?.status === "success" &&
        typeof data.result === "object" &&
        typeof data.result?.shorten_url === "string"
      ) {
        shortUrl = data.result.shorten_url;
      }
    } catch {
      // keep the direct continue URL
    }

    return { claimToken, shortUrl, expiresAt, handle };
  },
});

/** A key that was just issued to a coin account. */
export interface RedeemedKey {
  key: string;
  hours: number;
  expiresAt: number;
  serverName: string;
  serverCode: string;
  usedToday: number;
  maxPerDay: number;
  remaining: number;
  coins: number;
}

/** Step 2: back from the short link — issue the key and spend the coins. */
export const redeemClaim = mutation({
  args: { claimToken: v.string(), handle: v.string() },
  handler: async (ctx, args): Promise<RedeemedKey> => {
    const token = args.claimToken.trim().toLowerCase();
    const claim = await ctx.db
      .query("keyClaims")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!claim || claim.accountId === undefined) {
      throw new Error("Claim not found — start again with the Generate button.");
    }
    if (claim.redeemed === true) {
      throw new Error("This claim was already used — generate a new link.");
    }
    if (Date.now() > claim.expiresAt) {
      throw new Error("Claim expired — generate a new link.");
    }
    const handle = normalizeHandle(args.handle);
    if (claim.handle !== undefined && claim.handle !== handle) {
      throw new Error("This claim belongs to a different account.");
    }

    const res: IssueResult = await ctx.runMutation(
      internal.getkey.issueForKey,
      { handle, serverId: claim.serverId },
    );
    if (!res.ok) throw new Error(issueErrorMessage(res));

    await ctx.db.patch(claim._id, { redeemed: true, key: res.key });
    return {
      key: res.key,
      hours: res.hours,
      expiresAt: res.expiresAt,
      serverName: res.serverName,
      serverCode: res.serverCode,
      usedToday: res.used,
      maxPerDay: res.maxPerDay,
      remaining: Math.max(0, res.maxPerDay - res.used),
      coins: res.coins,
    };
  },
});

/* ---------------------------- internal queries --------------------------- */

export const listProductsInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<GetkeyProduct[]> => await listProducts(ctx),
});

export const resolveServerInternal = internalQuery({
  args: { serverId: v.string() },
  handler: async (ctx, { serverId }): Promise<Id<"servers"> | null> => {
    const id = ctx.db.normalizeId("servers", serverId);
    if (id === null) return null;
    const doc = await ctx.db.get(id);
    if (doc === null || doc.status !== "active") return null;
    return id;
  },
});

/* ------------------------- owner/admin management ------------------------ */

/** Coin accounts, newest activity first — the panel's top-up list. */
export const listAccounts = query({
  args: {},
  handler: async (ctx) => {
    await requirePanelRole(ctx);
    const rows = await ctx.db.query("getkeyAccounts").order("desc").take(300);
    return rows.map((a) => ({
      _id: a._id,
      handle: a.handle,
      displayHandle: a.displayHandle,
      telegramId: a.telegramId ?? null,
      telegramUsername: a.telegramUsername ?? null,
      coins: a.coins ?? 0,
      totalClaims: a.totalClaims ?? 0,
      totalSpent: a.totalSpent ?? 0,
      banned: a.banned === true,
      usedToday: a.day === utcDay() ? (a.dayCount ?? 0) : 0,
      lastKey: a.lastKey ?? null,
      createdAt: a.createdAt,
      lastSeen: a.lastSeen,
    }));
  },
});

/** Owner/admin: add (or remove, negative) coins from an account. */
export const grantCoins = mutation({
  args: { id: v.id("getkeyAccounts"), amount: v.number() },
  handler: async (ctx, { id, amount }) => {
    await requirePanelRole(ctx);
    const account = await ctx.db.get(id);
    if (account === null) throw new Error("Account not found");
    const add = Math.round(amount);
    if (!Number.isFinite(add) || add === 0) {
      throw new Error("Amount must be a non-zero number");
    }
    const coins = Math.max(0, (account.coins ?? 0) + add);
    await ctx.db.patch(id, { coins });
    return { coins, handle: account.handle };
  },
});

/** Coin accounts for the bot's admin panel (no auth — internal only). */
export const listAccountsInternal = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx): Promise<
    {
      id: Id<"getkeyAccounts">;
      handle: string;
      coins: number;
      claims: number;
      banned: boolean;
      telegramId: string | null;
    }[]
  > => {
    const rows = await ctx.db.query("getkeyAccounts").order("desc").take(200);
    return rows.map((a) => ({
      id: a._id,
      handle: a.handle,
      coins: a.coins ?? 0,
      claims: a.totalClaims ?? 0,
      banned: a.banned === true,
      telegramId: a.telegramId ?? null,
    }));
  },
});

/** Credit / debit coins by handle (used by the bot's /addcoins command). */
export const grantCoinsByHandleInternal = internalMutation({
  args: { handle: v.string(), amount: v.number() },
  handler: async (ctx, { handle, amount }) => {
    const account = await findAccount(ctx, handle);
    if (account === null) {
      throw new Error(`No account found for "${handle}"`);
    }
    const add = Math.round(amount);
    if (!Number.isFinite(add) || add === 0) {
      throw new Error("Amount must be a non-zero number");
    }
    const coins = Math.max(0, (account.coins ?? 0) + add);
    await ctx.db.patch(account._id, { coins, lastSeen: Date.now() });
    return { handle: account.handle, coins };
  },
});

/** Owner/admin: suspend or re-enable an account. */
export const setAccountBanned = mutation({
  args: { id: v.id("getkeyAccounts"), banned: v.boolean() },
  handler: async (ctx, { id, banned }) => {
    await requirePanelRole(ctx);
    await ctx.db.patch(id, { banned });
    return { banned };
  },
});

/** Owner/admin: delete a coin account (and its pending claims). */
export const deleteAccount = mutation({
  args: { id: v.id("getkeyAccounts") },
  handler: async (ctx, { id }) => {
    await requirePanelRole(ctx);
    const claims = await ctx.db
      .query("keyClaims")
      .filter((q) => q.eq(q.field("accountId"), id))
      .collect();
    for (const c of claims) await ctx.db.delete(c._id);
    await ctx.db.delete(id);
    return { deleted: true };
  },
});

/** Owner/admin: clear an account's daily counter. */
export const resetAccountDaily = mutation({
  args: { id: v.id("getkeyAccounts") },
  handler: async (ctx, { id }) => {
    await requirePanelRole(ctx);
    await ctx.db.patch(id, { day: undefined, dayCount: 0 });
    return { ok: true };
  },
});
