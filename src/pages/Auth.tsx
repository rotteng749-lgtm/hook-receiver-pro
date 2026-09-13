import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
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
import { useAction, useMutation } from "convex/react";
import { ArrowRight, Loader2, Lock, User, ExternalLink } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Turnstile } from "@/components/Turnstile";

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
  const mode = searchParams.get("mode");
  const isRegister = mode === "register";

  const seedOwner = useMutation(api.nameserver.seedOwner);
  const registerMember = useAction(api.public.registerMember);
  // Seeding is best-effort and must NEVER block signing in: if the owner
  // account already exists (or the mutation is slow) the form stays usable.
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");

  const seedRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    const promise = seedOwner().catch((err) => {
      console.warn("seedOwner failed:", err);
    });
    seedRef.current = promise;
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
      // Give the seeded owner account a moment to exist (worst case 2.5s) so
      // the very first sign-in after a cold start doesn't fail.
      if (seedRef.current) {
        await Promise.race([
          seedRef.current.catch(() => undefined),
          new Promise((resolve) => window.setTimeout(resolve, 2500)),
        ]);
      }
      const formData = new FormData(event.currentTarget);
      await signIn("password", {
        username: formData.get("username") as string,
        password: formData.get("password") as string,
        flow: "signIn",
      });
      navigate(redirect);
    } catch {
      setError("Invalid username or password.");
      setIsLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const username = (formData.get("username") as string).trim();
      const password = formData.get("password") as string;
      const confirmPassword = formData.get("confirmPassword") as string;

      if (username.length < 3) {
        setError("Username must be at least 3 characters.");
        setIsLoading(false);
        return;
      }
      if (password.length < 4) {
        setError("Password must be at least 4 characters.");
        setIsLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        setIsLoading(false);
        return;
      }

      if (captchaToken.length === 0) {
        setError("Please complete the human check first.");
        setIsLoading(false);
        return;
      }

      await registerMember({
        username,
        password,
        turnstileToken: captchaToken,
      });

      // Auto sign-in after registration
      await signIn("password", {
        username,
        password,
        flow: "signIn",
      });
      navigate(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
      setCaptchaToken("");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_70%_50%_at_50%_-15%,oklch(0.46_0.1_178/0.12),transparent)]" />

      <div className="flex-1 flex items-center justify-center relative">
        <div className="flex items-center justify-center h-full flex-col w-full max-w-md px-4">
          <Card className="w-full border shadow-lg overflow-hidden">
            <CardHeader className="text-center pb-2">
              <div className="flex justify-center">
                <img
                  src={logo}
                  alt="Logo"
                  width={56}
                  height={56}
                  className="rounded-xl mb-3 cursor-pointer"
                  onClick={() => navigate("/")}
                />
              </div>
              <CardTitle className="text-xl font-bold">
                {isRegister ? "Create Account" : "Sign in to your account"}
              </CardTitle>
              <CardDescription>
                {isRegister
                  ? "Join the platform — create an account below"
                  : "Sign in with your username & password"}
              </CardDescription>
            </CardHeader>

            {/* Tabs */}
            <div className="flex border-b border-border/70">
              <button
                type="button"
                onClick={() => navigate(isRegister ? "/auth" : "/auth?mode=register", { replace: true })}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  !isRegister
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => navigate(isRegister ? "/auth?mode=register" : "/auth?mode=register", { replace: true })}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  isRegister
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Register
              </button>
            </div>

            <form onSubmit={isRegister ? handleRegister : handleSignIn}>
              <CardContent className="space-y-4 pt-5">
                <div className="space-y-2">
                  <Label htmlFor="auth-username" className="text-sm font-medium">
                    Username
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="auth-username"
                      name="username"
                      placeholder="Enter your username"
                      autoComplete="username"
                      className="pl-10 h-11"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auth-password" className="text-sm font-medium">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="auth-password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      autoComplete={isRegister ? "new-password" : "current-password"}
                      className="pl-10 h-11"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                {isRegister && (
                  <div className="space-y-2">
                    <Label htmlFor="auth-confirm" className="text-sm font-medium">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="auth-confirm"
                        name="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className="pl-10 h-11"
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>
                )}

                {isRegister && (
                  <div className="flex flex-col items-center gap-2">
                    <Turnstile onToken={setCaptchaToken} theme="dark" />
                    <p className="text-xs text-muted-foreground">
                      Cloudflare human check — stops bot registrations.
                    </p>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 cursor-pointer font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  {isLoading
                    ? isRegister ? "Creating account…" : "Signing in…"
                    : isRegister ? "Create Account" : "Sign In"}
                </Button>
              </CardContent>
            </form>

            <div className="border-t border-border/70 bg-muted/50 px-6 py-3 text-center text-xs text-muted-foreground">
              <div className="flex items-center justify-center gap-3">
                <a
                  href="https://t.me/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors flex items-center gap-1"
                >
                  Support Channel <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </Card>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            (c) {new Date().getFullYear()} Panxcz — Secured by{" "}
            <a
              href="https://freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary transition-colors"
            >
              freebuff.com
            </a>
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
