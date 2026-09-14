/**
 * Map low-level Convex Auth / network errors to clear, honest user-facing
 * messages. Used by both the landing login form and the /auth page so the
 * two never drift apart.
 */
export function describeAuthError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.toLowerCase();
  if (
    m.includes("invalidsecret") ||
    m.includes("invalid secret") ||
    m.includes("invalid username or password") ||
    m.includes("invalidcredentials")
  ) {
    return "Invalid username or password. Double-check what you typed — tap the eye icon to verify.";
  }
  if (m.includes("invalidaccountid")) {
    return "No account found with that username. Create one via Register.";
  }
  if (m.includes("too many") || m.includes("rate limit") || m.includes("429")) {
    return "Too many attempts — please wait a minute and try again.";
  }
  // Convex Auth throws (InvalidAccountId / InvalidSecret / TooManyFailedAttempts)
  // and the browser client only sees an opaque "Server Error Called by client".
  if (m.includes("server error") || m.includes("called by client")) {
    return "Sign-in was rejected by the server. This usually means the password is wrong or there were too many failed attempts — wait a couple of minutes, use the eye icon to double-check, and try again.";
  }
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to fetch")) {
    return "Network error — check your connection and try again.";
  }
  return raw;
}

/**
 * Sign in with exact-username resolution.
 *
 * Convex Auth matches usernames case-sensitively and reports every failure
 * (unknown user, wrong password, rate limit) as the same opaque "Server
 * Error", so guessing casings blind both burns rate-limit attempts and gives
 * useless errors. We first ask the server which casing actually exists (via
 * `api.public.lookupUsername`) and sign in against that exact username.
 * If the lookup itself fails we fall back to the old candidate-guess loop.
 */
export async function attemptSignInWithLookup(
  lookup: (args: {
    username: string;
  }) => Promise<{ found: boolean; exactUsername: string | null }>,
  signInFn: (
    provider: string,
    params: { username: string; password: string; flow: string },
  ) => Promise<unknown>,
  username: string,
  password: string,
): Promise<void> {
  const t = username.trim();
  if (!t) throw new Error("Username is required.");

  let exact: string | null = null;
  try {
    const res = await lookup({ username: t });
    if (res.found && res.exactUsername) exact = res.exactUsername;
  } catch {
    // Lookup is best-effort — fall back to casing candidates below.
  }

  const candidates = exact
    ? [exact]
    : (() => {
        const lower = t.toLowerCase();
        const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
        return [t, lower, cap].filter(
          (v, i, a) => v && a.indexOf(v) === i,
        );
      })();

  let lastErr: unknown = null;
  for (const u of candidates) {
    try {
      await signInFn("password", { username: u, password, flow: "signIn" });
      return;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Network / rate-limit problems: surface immediately instead of
      // hammering the remaining casings.
      if (
        /failed to fetch|networkerror|typeerror|too many|rate limit/i.test(
          msg,
        )
      ) {
        throw e;
      }
    }
  }
  throw lastErr ?? new Error("Invalid username or password.");
}
