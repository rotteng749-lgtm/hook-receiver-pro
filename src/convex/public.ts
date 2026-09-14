/**
 * Public (signed-out) entry points for the website.
 *
 *   registerMember — self-service account creation (role: "user").
 *   claimTrialKey  — generate a trial key from the public /getkey page.
 *
 * Turnstile is best-effort: if the widget hasn't loaded or the site is
 * on the test key, we don't block registration. Set TURNSTILE_SECRET_KEY
 * to enforce real verification.
 */
import { createAccount } from "@convex-dev/auth/server";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

function asActionCtx(ctx: MutationCtx): GenericActionCtx<GenericDataModel> {
  return ctx as unknown as GenericActionCtx<GenericDataModel>;
}

async function verifyTurnstile(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  if (token.trim().length === 0) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_SECRET;
  // If still on test secret, accept any non-empty token to avoid blocking
  // users when the widget hasn't loaded or Cloudflare is unreachable.
  // Real enforcement only when a real secret is configured.
  const isTestSecret = secret === TURNSTILE_TEST_SECRET;
  const form = new URLSearchParams({ secret, response: token.trim() });
  if (remoteIp) form.set("remoteip", remoteIp);
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    if (data.success === true) return true;
    // On test secret, be permissive — don't block legit users if verification flakes
    if (isTestSecret) return true;
    return false;
  } catch {
    // Network error: permissive on test secret, strict on real secret
    return isTestSecret ? true : false;
  }
}

/* ------------------------------ registration ------------------------------ */

export const createMemberInternal = internalMutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }): Promise<{ username: string }> => {
    const clean = username.trim().slice(0, 60);
    // Case-insensitive uniqueness check
    const existingExact = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", clean),
      )
      .first();
    if (existingExact) {
      throw new Error(`Username "${clean}" is already taken`);
    }
    // Also check lowercased variant to prevent panxcz / Panxcz duplicates
    const lower = clean.toLowerCase();
    if (lower !== clean) {
      const existingLower = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", lower),
        )
        .first();
      if (existingLower) {
        throw new Error(`Username "${clean}" is already taken (case-insensitive)`);
      }
      // Check capitalized variant too
      const cap = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
      if (cap !== clean && cap !== lower) {
        const existingCap = await ctx.db
          .query("authAccounts")
          .withIndex("providerAndAccountId", (q) =>
            q.eq("provider", "password").eq("providerAccountId", cap),
          )
          .first();
        if (existingCap) {
          throw new Error(`Username "${clean}" is already taken (case-insensitive)`);
        }
      }
    }
    await createAccount(asActionCtx(ctx), {
      provider: "password",
      account: { id: clean, secret: password },
      profile: {
        email: clean,
        name: clean,
        role: "user",
        balance: 0,
      },
    });
    return { username: clean };
  },
});

/**
 * Public self-service registration. The new account is always role "user".
 * Turnstile is optional — if the widget hasn't loaded we still allow signup
 * when on the test secret. Once TURNSTILE_SECRET_KEY is set, empty tokens
 * are rejected.
 */
export const registerMember = action({
  args: {
    username: v.string(),
    password: v.string(),
    turnstileToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ username: string }> => {
    const username = args.username.trim().slice(0, 60);
    if (username.length < 3) {
      throw new Error("Username must be at least 3 characters");
    }
    if (!/^[A-Za-z0-9._@-]+$/.test(username)) {
      throw new Error("Username may only contain letters, numbers, . _ - @");
    }
    if (args.password.length < 4) {
      throw new Error("Password must be at least 4 characters");
    }
    const token = (args.turnstileToken ?? "").trim();
    const secret = process.env.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_SECRET;
    const isTestSecret = secret === TURNSTILE_TEST_SECRET;
    // Only enforce captcha when a real secret is configured
    if (!isTestSecret) {
      if (token.length === 0) {
        throw new Error(
          "Human verification required — please complete the captcha and try again.",
        );
      }
      const ok = await verifyTurnstile(token);
      if (!ok) {
        throw new Error(
          "Human verification failed — please complete the captcha and try again.",
        );
      }
    } else if (token.length > 0) {
      // On test secret, still verify but don't block on failure (permissive)
      await verifyTurnstile(token).catch(() => {});
    }
    return await ctx.runMutation(internal.public.createMemberInternal, {
      username,
      password: args.password,
    });
  },
});

/* ------------------- shortener-gated trial keys (/getkey) ------------------ */

/** A claim must be redeemed within 15 minutes of being created. */
const CLAIM_TTL_MS = 15 * 60 * 1000;

/** Read-only quota check for a fingerprint bucket. */
export const getWebUsageInternal = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_scope", (q) => q.eq("scope", "global"))
      .first();
    const maxPerDay = doc?.getkeyMaxPerDay ?? 3;
    const day = new Date().toISOString().slice(0, 10);
    const usage = await ctx.db
      .query("getkeyDaily")
      .withIndex("by_token_day", (q) =>
        q.eq("tokenHash", tokenHash).eq("day", day),
      )
      .first();
    return { used: usage?.count ?? 0, maxPerDay };
  },
});

/** Persist a new claim row. */
export const createClaimInternal = internalMutation({
  args: { token: v.string(), tokenHash: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("keyClaims", {
      token: args.token,
      tokenHash: args.tokenHash,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });
    return true;
  },
});

/**
 * Step 1 of the gated /getkey flow: verify the human check, create a claim
 * token, wrap the continue URL in a ShrtFly short link (the owner's monetized
 * link) and hand it back. The trial key itself is NOT issued here.
 */
export const startTrialClaim = action({
  args: {
    turnstileToken: v.string(),
    fingerprint: v.string(),
    origin: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ claimToken: string; shortUrl: string; expiresAt: number }> => {
    const token = (args.turnstileToken ?? "").trim();
    const secret = process.env.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_SECRET;
    const isTestSecret = secret === TURNSTILE_TEST_SECRET;
    if (!isTestSecret) {
      if (!(await verifyTurnstile(token))) {
        throw new Error(
          "Human verification failed — please complete the captcha and try again.",
        );
      }
    } else if (token.length > 0) {
      await verifyTurnstile(token).catch(() => {});
    }

    const fingerprint = args.fingerprint.trim().slice(0, 128);
    if (fingerprint.length < 8) {
      throw new Error("Missing browser id — reload the page and try again.");
    }

    let origin: string;
    try {
      origin = new URL(args.origin).origin;
      if (!origin.startsWith("http")) throw new Error("bad origin");
    } catch {
      throw new Error("Invalid page origin.");
    }

    const info = await ctx.runMutation(internal.public.getWebInfoInternal, {});
    if (!info.enabled) {
      throw new Error("The free key page is currently disabled.");
    }

    // Quota is checked up-front so users get a clear message before clicking
    // through the short link (issueGetkey re-checks at redemption).
    const quota = await ctx.runQuery(internal.public.getWebUsageInternal, {
      tokenHash: `web:${fingerprint}`,
    });
    if (quota.used >= quota.maxPerDay) {
      throw new Error(
        `Daily limit reached — ${quota.used}/${quota.maxPerDay} keys today. Come back tomorrow.`,
      );
    }

    const claimToken = (
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "")
    ).slice(0, 64);
    const expiresAt = Date.now() + CLAIM_TTL_MS;

    await ctx.runMutation(internal.public.createClaimInternal, {
      token: claimToken,
      tokenHash: `web:${fingerprint}`,
      expiresAt,
    });

    // Wrap the continue URL in a ShrtFly short link. If ShrtFly is down we
    // fall back to the direct continue URL so the flow never hard-fails.
    const continueUrl = `${origin}/getkey?claim=${claimToken}`;
    let shortUrl = continueUrl;
    const settings = await ctx.runQuery(
      internal.shortener.getShortenerSettings,
      {},
    );
    const apiKey = settings.shortenerApiKey || "ea3e5b3e3dcd0019ac9f395f2d8e4062";
    const params = new URLSearchParams({
      api: apiKey,
      url: continueUrl,
      type: String(settings.shortenerAdType === 2 ? 2 : 1),
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
        typeof data.result.shorten_url === "string"
      ) {
        shortUrl = data.result.shorten_url;
      }
    } catch {
      // keep direct continue URL
    }

    return { claimToken, shortUrl, expiresAt };
  },
});

/**
 * Step 2: after the user returns via the short link (/getkey?claim=…),
 * redeem the claim and finally issue the trial key. Bound to the same
 * browser fingerprint that started the claim.
 */
export const redeemClaim = mutation({
  args: { claimToken: v.string(), fingerprint: v.string() },
  handler: async (ctx, args): Promise<WebTrialKey> => {
    const token = args.claimToken.trim().toLowerCase();
    const claim = await ctx.db
      .query("keyClaims")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!claim) {
      throw new Error("Claim not found — start again with the Generate button.");
    }
    if (claim.redeemed) {
      throw new Error("This claim was already used — generate a new link.");
    }
    if (Date.now() > claim.expiresAt) {
      throw new Error("Claim expired — generate a new link.");
    }
    const expectedHash = `web:${args.fingerprint.trim().slice(0, 128)}`;
    if (claim.tokenHash !== expectedHash) {
      throw new Error(
        "Claim was created in a different browser — generate a new link.",
      );
    }

    const res = await ctx.runMutation(internal.nameserver.issueGetkey, {
      tokenHash: claim.tokenHash,
    });
    if (!res.ok) {
      const messages: Record<string, string> = {
        daily_limit: `Daily limit reached — ${res.used}/${res.maxPerDay} keys today. Come back tomorrow.`,
        no_server: "No active server configured yet.",
        no_owner: "Server not fully configured yet.",
        web_disabled: "The free key page is currently disabled.",
      };
      throw new Error(messages[res.reason] ?? res.reason);
    }

    await ctx.db.patch(claim._id, { redeemed: true, key: res.key });

    return {
      key: res.key,
      hours: res.hours,
      serverName: res.serverName,
      serverCode: res.serverCode,
      expiresAt: res.expiresAt,
      usedToday: res.used,
      maxPerDay: res.maxPerDay,
      remaining: Math.max(0, res.maxPerDay - res.used),
    };
  },
});

/* ------------------------------ web get key ------------------------------ */

export const getWebInfoInternal = internalMutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ enabled: boolean; hours: number; maxPerDay: number }> => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_scope", (q) => q.eq("scope", "global"))
      .first();
    return {
      enabled: doc?.getkeyWeb !== false,
      hours: doc?.getkeyHours ?? 5,
      maxPerDay: doc?.getkeyMaxPerDay ?? 3,
    };
  },
});

export const getWebGetkeyInfo = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_scope", (q) => q.eq("scope", "global"))
      .first();
    const defaultServer = doc?.getkeyServerId
      ? await ctx.db.get(doc.getkeyServerId)
      : null;
    const activeServer =
      defaultServer ?? (await ctx.db.query("servers").first());
    return {
      enabled: doc?.getkeyWeb !== false,
      hours: doc?.getkeyHours ?? 5,
      maxPerDay: doc?.getkeyMaxPerDay ?? 3,
      serverName: activeServer?.name ?? "main",
    };
  },
});

export const getWebQuota = query({
  args: { fingerprint: v.string() },
  handler: async (ctx, { fingerprint }) => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_scope", (q) => q.eq("scope", "global"))
      .first();
    const maxPerDay = doc?.getkeyMaxPerDay ?? 3;
    const fp = fingerprint.trim().slice(0, 128);
    if (fp.length < 8) return { used: 0, maxPerDay, remaining: maxPerDay };
    const day = new Date().toISOString().slice(0, 10);
    const usage = await ctx.db
      .query("getkeyDaily")
      .withIndex("by_token_day", (q) =>
        q.eq("tokenHash", `web:${fp}`).eq("day", day),
      )
      .first();
    const used = usage?.count ?? 0;
    return { used, maxPerDay, remaining: Math.max(0, maxPerDay - used) };
  },
});

export interface WebTrialKey {
  key: string;
  hours: number;
  serverName: string;
  serverCode: string;
  expiresAt: number;
  usedToday: number;
  maxPerDay: number;
  remaining: number;
}

export const claimTrialKey = action({
  args: { turnstileToken: v.string(), fingerprint: v.string() },
  handler: async (ctx, args): Promise<WebTrialKey> => {
    const token = (args.turnstileToken ?? "").trim();
    const secret = process.env.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_SECRET;
    const isTestSecret = secret === TURNSTILE_TEST_SECRET;
    if (!isTestSecret) {
      if (!(await verifyTurnstile(token))) {
        throw new Error(
          "Human verification failed — please complete the captcha and try again.",
        );
      }
    } else if (token.length > 0) {
      await verifyTurnstile(token).catch(() => {});
    }
    // On test secret, allow empty token (permissive)
    const fingerprint = args.fingerprint.trim().slice(0, 128);
    if (fingerprint.length < 8) {
      throw new Error("Missing browser id — reload the page and try again.");
    }
    const info = await ctx.runMutation(internal.public.getWebInfoInternal, {});
    if (!info.enabled) {
      throw new Error("The free key page is currently disabled.");
    }
    const res = await ctx.runMutation(internal.nameserver.issueGetkey, {
      tokenHash: `web:${fingerprint}`,
    });
    if (!res.ok) {
      const messages: Record<string, string> = {
        daily_limit: `Daily limit reached — ${res.used}/${res.maxPerDay} keys today. Come back tomorrow.`,
        no_server: "No active server configured yet.",
        no_owner: "Server not fully configured yet.",
        web_disabled: "The free key page is currently disabled.",
      };
      throw new Error(messages[res.reason] ?? res.reason);
    }
    return {
      key: res.key,
      hours: res.hours,
      serverName: res.serverName,
      serverCode: res.serverCode,
      expiresAt: res.expiresAt,
      usedToday: res.used,
      maxPerDay: res.maxPerDay,
      remaining: Math.max(0, res.maxPerDay - res.used),
    };
  },
});
