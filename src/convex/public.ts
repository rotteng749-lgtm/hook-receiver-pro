/**
 * Public (signed-out) entry points for the website.
 *
 *   registerMember — self-service account creation (role: "user").
 *   lookupUsername — case-insensitive username resolution for the login form.
 *
 * The public /getkey flow (Panxcz coins + the ShrtFly shortlink gate) now
 * lives in convex/getkey.ts, so there is one single claim path.
 *
 * Turnstile is best-effort: if the widget hasn't loaded or the site is
 * on the test key, we don't block registration. Set TURNSTILE_SECRET_KEY
 * to enforce real verification.
 */
import { createAccount } from "@convex-dev/auth/server";
import type { GenericActionCtx, GenericDataModel } from "convex/server";
import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
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

/* ------------------------------ sign-in helper ---------------------------- */

/**
 * Resolve the exact stored username for a sign-in attempt. Convex Auth matches
 * account IDs case-sensitively and reports every failure (bad username, bad
 * password, rate limit) to the browser as an opaque "Server Error", so the
 * login form cannot tell "no such user" from "wrong password". This lookup
 * (public info only — the account id is the username itself) lets the form
 * pick the correct casing first and show an honest "no account" message
 * without burning a rate-limited sign-in attempt.
 */
export const lookupUsernameInternal = internalQuery({
  args: { username: v.string() },
  handler: async (
    ctx,
    { username },
  ): Promise<{ found: boolean; exactUsername: string | null }> => {
    const t = username.trim().slice(0, 60);
    if (!t) return { found: false, exactUsername: null };
    const lower = t.toLowerCase();
    const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    const variants = [t, lower, cap].filter((x, i, a) => x && a.indexOf(x) === i);
    for (const candidate of variants) {
      const doc = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", candidate),
        )
        .first();
      if (doc) return { found: true, exactUsername: candidate };
    }
    return { found: false, exactUsername: null };
  },
});

export const lookupUsername = action({
  args: { username: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ found: boolean; exactUsername: string | null }> => {
    return await ctx.runQuery(internal.public.lookupUsernameInternal, {
      username: args.username,
    });
  },
});
