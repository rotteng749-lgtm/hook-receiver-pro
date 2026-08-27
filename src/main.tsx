import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRole } from "@/components/RequireRole";
import { BootstrapRole } from "@/components/BootstrapRole";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ThemeProvider } from "next-themes";
import { applyStoredAccent } from "@/lib/theme";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import CustomCursor from "@/components/CustomCursor";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const UserHome = lazy(() => import("./pages/UserHome.tsx"));
const OwnerPanel = lazy(() => import("./pages/owner/OwnerPanel.tsx"));
const OwnerOverview = lazy(() => import("./pages/owner/Overview.tsx"));
const OwnerKeys = lazy(() => import("./pages/owner/KeysPage.tsx"));
const OwnerMembers = lazy(() => import("./pages/owner/Members.tsx"));
const OwnerSettings = lazy(() => import("./pages/owner/Settings.tsx"));
const OwnerTelegram = lazy(() => import("./pages/owner/Telegram.tsx"));
const OwnerEndpoints = lazy(() => import("./pages/owner/CustomEndpoints.tsx"));
const AdminPanel = lazy(() => import("./pages/admin/AdminPanel.tsx"));
const AdminOverview = lazy(() => import("./pages/admin/Overview.tsx"));
const AdminKeys = lazy(() => import("./pages/admin/Keys.tsx"));
const Servers = lazy(() => import("./pages/Servers.tsx"));
const Connections = lazy(() => import("./pages/Connections.tsx"));
const ApiTokens = lazy(() => import("./pages/ApiTokens.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const ApiProxy = lazy(() => import("./pages/ApiProxy.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

// Restore the stored accent before first paint so it survives reloads.
applyStoredAccent();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <ConvexAuthProvider client={convex}>
          <BootstrapRole />
          <CustomCursor />
          <BrowserRouter>
            <RouteSyncer />
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<AuthPage />} />

                {/* Owner panel — full control */}
                <Route
                  path="/owner"
                  element={
                    <RequireAuth>
                      <RequireRole roles={["owner"]}>
                        <OwnerPanel />
                      </RequireRole>
                    </RequireAuth>
                  }
                >
                  <Route index element={<OwnerOverview />} />
                  <Route path="servers" element={<Servers />} />
                  <Route path="keys" element={<OwnerKeys />} />
                  <Route path="connections" element={<Connections />} />

                  <Route path="endpoints" element={<OwnerEndpoints />} />
                  <Route path="members" element={<OwnerMembers />} />
                  <Route path="api" element={<ApiTokens />} />
                  <Route path="telegram" element={<OwnerTelegram />} />
                  <Route path="settings" element={<OwnerSettings />} />
                </Route>

                {/* Admin panel — create servers, generate keys (balance) */}
                <Route
                  path="/admin"
                  element={
                    <RequireAuth>
                      <RequireRole roles={["owner", "admin"]}>
                        <AdminPanel />
                      </RequireRole>
                    </RequireAuth>
                  }
                >
                  <Route index element={<AdminOverview />} />
                  <Route path="servers" element={<Servers />} />
                  <Route path="keys" element={<AdminKeys />} />
                  <Route path="connections" element={<Connections />} />

                  <Route path="endpoints" element={<OwnerEndpoints />} />
                  <Route path="api" element={<ApiTokens />} />
                </Route>

                {/* Regular accounts */}
                <Route
                  path="/dashboard"
                  element={
                    <RequireAuth>
                      <UserHome />
                    </RequireAuth>
                  }
                />

                {/**
                 * API proxy routes — forward to Convex backend so the frontend
                 * domain can serve /connect, /api/*, /health, etc.
                 */}
                <Route path="/connect" element={<ApiProxy />} />
                <Route path="/health" element={<ApiProxy />} />
                <Route path="/api/*" element={<ApiProxy />} />
                <Route path="/telegram/*" element={<ApiProxy />} />
                <Route path="/files/*" element={<ApiProxy />} />
                <Route path="/databases/*" element={<ApiProxy />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster />
        </ConvexAuthProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
