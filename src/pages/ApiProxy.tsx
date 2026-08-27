import { useEffect } from "react";

/**
 * API Proxy Route — catches /connect, /api/*, /health, /telegram/*, etc.
 * and forwards the request to the Convex HTTP backend.
 *
 * This lets the frontend domain (e.g. panxcz.freebuff.app) serve API
 * endpoints that actually live on the Convex site (lovable-dove-890.convex.site).
 */

const CONVEX_BASE = (import.meta.env.VITE_CONVEX_URL as string)
  .replace(/\.convex\.cloud$/, ".convex.site")
  .replace(/\/$/, "");

export default function ApiProxy() {
  useEffect(() => {
    // On mount, forward the current URL to the Convex backend
    const path = window.location.pathname + window.location.search;
    const target = `${CONVEX_BASE}${path}`;

    // Redirect the browser to the Convex backend URL directly.
    // The browser will make the request and show the Convex response.
    window.location.replace(target);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm">Redirecting to API endpoint…</p>
      </div>
    </div>
  );
}
