import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { roleHome, type PanelRole } from "@/lib/roles";

export function RequireRole({
  roles,
  children,
}: {
  roles: PanelRole[];
  children: ReactNode;
}) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  const role = (user?.role ?? "user") as PanelRole;
  if (!roles.includes(role)) {
    return <Navigate to={roleHome(role)} replace />;
  }

  return children;
}
