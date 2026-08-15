// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";

// Username + password login (no email). The Password provider's account
// identifier is the username: the profile maps `username` → the account's
// "email" slot, so sign in with `signIn("password", { username, password, flow: "signIn" })`.
const passwordProvider = Password({
  profile: (params) => ({
    email: typeof params.username === "string" ? params.username : "",
    name: typeof params.username === "string" ? params.username : "",
  }),
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [passwordProvider, Anonymous],
});
