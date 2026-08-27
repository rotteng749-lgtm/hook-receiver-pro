import { useEffect } from "react";

/**
 * API Proxy Route — catches /connect, /api/*, /health, /telegram/*, etc.
 * and redirects to the Convex HTTP backend.
 *
 * NOTE: This only works in browsers. For terminal/curl access,
 * the user must set up DNS CNAME routing (see Settings → Custom Domain).
 * In development, the Vite proxy handles this automatically.
 */

const CONVEX_BASE = (import.meta.env.VITE_CONVEX_URL as string)
  .replace(/\.convex\.cloud$/, ".convex.site")
  .replace(/\/$/, "");

export default function ApiProxy() {
  useEffect(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    const target = `${CONVEX_BASE}${path}${search}`;

    // Replace the current page with the Convex response
    window.location.replace(target);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm">Redirecting to API endpoint…</p>
        <p className="text-xs text-muted-foreground/60">
          If not redirected, your API URL is: {CONVEX_BASE}/connect
        </p>
      </div>
    </div>
  );
}
