import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { Coins, LogOut, Menu, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { cn } from "@/lib/utils";

export interface PanelNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

function SidebarContent({
  navItems,
  balance,
  unlimited,
  roleLabel,
  onNavigate,
}: {
  navItems: PanelNavItem[];
  balance?: number | null;
  unlimited?: boolean;
  roleLabel: string;
  onNavigate?: () => void;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const initials =
    user?.name?.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() ??
    user?.email?.slice(0, 2).toUpperCase() ??
    "U";

  return (
    <div className="flex h-full flex-col">
      <NavLink
        to="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-5 pt-6 pb-5"
      >
        <img src={logo} alt="nameserver" width={28} height={28} className="rounded-md" />
        <span className="text-[15px] font-bold tracking-tight">Panxcz</span>
        <span className="ml-auto inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {roleLabel}
        </span>
      </NavLink>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border/70 p-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
            Theme
          </span>
          <ThemeToggle />
        </div>
        {typeof balance === "number" && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2">
            <Coins className="size-4 text-primary" />
            <span className="text-xs text-muted-foreground">Balance</span>
            <span className="ml-auto text-sm font-bold tabular-nums">
              {unlimited ? "∞" : balance.toLocaleString()}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">
              {user?.name ?? "Guest user"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email ?? "anonymous session"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleSignOut}
            className="cursor-pointer text-muted-foreground"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PanelShell({
  navItems,
  balance,
  unlimited,
  roleLabel,
}: {
  navItems: PanelNavItem[];
  balance?: number | null;
  unlimited?: boolean;
  roleLabel: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border/70 bg-sidebar lg:block">
        <SidebarContent
          navItems={navItems}
          balance={balance}
          unlimited={unlimited}
          roleLabel={roleLabel}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-sidebar">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
            <SidebarContent
              navItems={navItems}
              balance={balance}
              unlimited={unlimited}
              roleLabel={roleLabel}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <NavLink to="/" className="flex items-center gap-2">
            <img src={logo} alt="nameserver" width={24} height={24} className="rounded" />
            <span className="text-sm font-bold tracking-tight">Panxcz</span>
          </NavLink>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
