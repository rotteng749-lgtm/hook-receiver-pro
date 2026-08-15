import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { roleHome } from "@/lib/roles";
import { Coins, KeyRound, Loader2, LogOut } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function UserHome() {
  const { user, isLoading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      const home = roleHome(user.role);
      if (home !== "/dashboard") {
        navigate(home, { replace: true });
      }
    }
  }, [isLoading, user, navigate]);

  if (isLoading || user == null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const role = user.role ?? "user";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4">
        <Card className="border-border/70">
          <CardHeader className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Coins className="size-6" />
            </div>
            <CardTitle className="mt-3 text-xl">Your account</CardTitle>
            <CardDescription>
              {user.email ?? "no email"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Coins className="size-4" />
                Balance
              </span>
              <span className="text-lg font-bold tabular-nums">
                {(user.balance ?? 0).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <KeyRound className="size-4" />
                Role
              </span>
              <Badge variant="secondary">{role}</Badge>
            </div>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              {role === "user" || role === "member"
                ? "Your account has no key-generating rights. If you're supposed to generate keys or manage servers, ask the owner to promote you to admin."
                : "You have panel access — use the sidebar to manage servers and keys."}
            </p>
            <Button
              variant="outline"
              className="w-full cursor-pointer"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
