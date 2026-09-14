// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

// Username + password login only (no email, no guest accounts). The Password
// provider's account identifier is the username: the profile maps `username`
// → the account's "email" slot, so sign in with
// `signIn("password", { username, password, flow: "signIn" })`.
const passwordProvider = Password({
  profile: (params) => ({
    email: typeof params.username === "string" ? params.username : "",
    name: typeof params.username === "string" ? params.username : "",
  }),
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [passwordProvider],
  // Library default is 10 failed sign-ins per hour per account, and every
  // failure (wrong password / unknown user / rate-limited) surfaces to the
  // browser as the same opaque "Server Error Called by client". That locked
  // the owner out after a handful of typos. Raise the ceiling — the counter
  // still resets automatically on every successful sign-in.
  signIn: { maxFailedAttempsPerHour: 50 },
});
