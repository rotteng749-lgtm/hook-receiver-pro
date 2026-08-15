import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { roleHome } from "@/lib/roles";
import logo from "@/assets/logo.svg";
import { useMutation } from "convex/react";
import { ArrowRight, Loader2, Lock, User, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  userRole: string | null | undefined,
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return roleHome(userRole);
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  void redirectAfterAuth;
  const { isLoading: authLoading, isAuthenticated, user, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    user?.role,
  );

  const seedOwner = useMutation(api.nameserver.seedOwner);
  const [seeding, setSeeding] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Make sure the owner account (ADMIN_USERNAME / ADMIN_PASSWORD, defaults
  // Panxcz / Panxxcz) exists before the first login attempt.
  useEffect(() => {
    void seedOwner()
      .catch((err) => console.warn("seedOwner failed:", err))
      .finally(() => setSeeding(false));
  }, [seedOwner]);

  useEffect(() => {
    if (!authLoading && isAuthenticated && user !== undefined) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, user, navigate, redirect]);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("password", {
        username: formData.get("username") as string,
        password: formData.get("password") as string,
        flow: "signIn",
      });
      navigate(redirect);
    } catch (error) {
      console.error("Sign-in error:", error);
      setError("Invalid username or password.");
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        `Failed to sign in as guest: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Auth Content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center justify-center h-full flex-col">
          <Card className="min-w-[350px] pb-0 border shadow-md">
            <CardHeader className="text-center">
              <div className="flex justify-center">
                <img
                  src={logo}
                  alt="Lock Icon"
                  width={64}
                  height={64}
                  className="rounded-lg mb-4 mt-4 cursor-pointer"
                  onClick={() => navigate("/")}
                />
              </div>
              <CardTitle className="text-xl">Sign in to the panel</CardTitle>
              <CardDescription>
                Username &amp; password — no email required
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSignIn}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="username"
                      name="username"
                      placeholder="e.g. Panxcz"
                      autoComplete="username"
                      className="pl-9"
                      disabled={isLoading || seeding}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="pl-9"
                      disabled={isLoading || seeding}
                      required
                    />
                  </div>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  className="w-full cursor-pointer"
                  disabled={isLoading || seeding}
                >
                  {isLoading || seeding ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  {seeding
                    ? "Preparing owner account…"
                    : isLoading
                      ? "Signing in…"
                      : "Sign in"}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full cursor-pointer"
                  onClick={handleGuestLogin}
                  disabled={isLoading}
                >
                  <UserX className="mr-2 h-4 w-4" />
                  Continue as Guest
                </Button>
              </CardContent>
            </form>

            <div className="py-4 px-6 text-xs text-center text-muted-foreground bg-muted border-t rounded-b-lg">
              Secured by{" "}
              <a
                href="https://freebuff.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary transition-colors"
              >
                freebuff.com
              </a>
            </div>
          </Card>

          <p className="mx-auto mt-4 max-w-[350px] text-center text-xs leading-relaxed text-muted-foreground">
            Owner login: username{" "}
            <code className="rounded bg-muted px-1 py-0.5">Panxcz</code> (set
            via <code className="rounded bg-muted px-1 py-0.5">ADMIN_USERNAME</code> /{" "}
            <code className="rounded bg-muted px-1 py-0.5">ADMIN_PASSWORD</code>{" "}
            env vars) — the owner panel is at{" "}
            <code className="rounded bg-muted px-1 py-0.5">/owner</code>. Admins
            are created by the owner in Members.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
