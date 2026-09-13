/**
 * Public (signed-out) entry points for the website.
 *
 * Everything here is callable by anyone, so each function is protected by a
 * Cloudflare Turnstile human check ("I'm human" captcha) plus server-side
 * limits:
 *
 *   registerMember — self-service account creation (role: "user").
 *   claimTrialKey  — generate a trial key from the public /getkey page. The
 *                    daily cap is enforced per browser fingerprint in the
 *                    same `getkeyDaily` table used by the token endpoint.
 *
 * Set TURNSTILE_SECRET_KEY (Keys tab) to activate real protection — the
 * fallback below is Cloudflare's official "always passes" test secret, which
 * only exists so the feature keeps working before the key is configured.
 *
 * NOTE: the exported actions below always carry explicit return types. They
 * call `internal.public.*`, and without the annotation Convex's type
 * inference would recurse through its own module (TS7022).
 */
import { createAccount } from "@convex-dev/auth/server";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Cloudflare's official always-passes test secret (pre-configuration only). */
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

/** createAccount is typed for a bare GenericActionCtx; our generated
 *  MutationCtx is runtime-compatible but TS can't prove the variance. */
function asActionCtx(ctx: MutationCtx): GenericActionCtx<GenericDataModel> {
  return ctx as unknown as GenericActionCtx<GenericDataModel>;
}

/** Verify a Turnstile token with Cloudflare. Fails closed on any error. */
async function verifyTurnstile(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  if (token.trim().length === 0) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_SECRET;
  const form = new URLSearchParams({ secret, response: token.trim() });
  if (remoteIp) form.set("remoteip", remoteIp);
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/* ------------------------------ registration ------------------------------ */

/** Owner-free account creation body (called by the public action below). */
export const createMemberInternal = internalMutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, { username, password }): Promise<{ username: string }> => {
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
      account: { id: username, secret: password },
      profile: {
        email: username,
        name: username,
        role: "user",
        balance: 0,
      },
    });
    return { username };
  },
});

/**
 * Public self-service registration. The new account is always role "user"
 * (no panel access) and signs in right after.
 */
export const registerMember = action({
  args: {
    username: v.string(),
    password: v.string(),
    turnstileToken: v.string(),
  },
  handler: async (ctx, args): Promise<{ username: string }> => {
    if (!(await verifyTurnstile(args.turnstileToken))) {
      throw new Error(
        "Human verification failed — please complete the captcha and try again.",
      );
    }
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
    return await ctx.runMutation(internal.public.createMemberInternal, {
      username,
      password: args.password,
    });
  },
});

/* ------------------------------ web get key ------------------------------ */

/** Turnstile-gated settings snapshot for the public claim action. */
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

/** Public, read-only GetKey limits for the website. */
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

/** Today's remaining quota for a browser fingerprint. */
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

/**
 * Public trial-key claim from the /getkey page. Turnstile-gated and capped
 * per browser fingerprint per UTC day (settings.getkeyMaxPerDay).
 */
export const claimTrialKey = action({
  args: { turnstileToken: v.string(), fingerprint: v.string() },
  handler: async (ctx, args): Promise<WebTrialKey> => {
    if (!(await verifyTurnstile(args.turnstileToken))) {
      throw new Error(
        "Human verification failed — please complete the captcha and try again.",
      );
    }
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
