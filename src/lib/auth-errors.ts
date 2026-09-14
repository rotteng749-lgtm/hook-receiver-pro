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
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to fetch")) {
    return "Network error — check your connection and try again.";
  }
  return raw;
}
