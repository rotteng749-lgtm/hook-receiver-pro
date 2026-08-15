/**
 * The public webhook endpoints are served by Convex at
 * https://<deployment>.convex.site — a different host from the admin app.
 * Derive it from VITE_CONVEX_URL, or override it with VITE_WEBHOOK_BASE_URL.
 */
export function getWebhookBaseUrl(): string {
  const override = import.meta.env.VITE_WEBHOOK_BASE_URL as string | undefined;
  if (override) return override.replace(/\/+$/, "");
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (convexUrl) return convexUrl.replace(/\.convex\.cloud$/, ".convex.site");
  return "https://hooks.example.com";
}

/** Full public URL for a hook, e.g. https://<site>.convex.site/api/hook/<path> */
export function getHookUrl(path: string): string {
  return `${getWebhookBaseUrl()}/api/hook/${encodeURIComponent(path)}`;
}

/** curl example callers can copy for a given hook. */
export function getCurlExample(path: string, token: string): string {
  const base = getWebhookBaseUrl();
  return [
    `curl -X POST "${base}/api/hook/${path}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "x-hook-token: ${token}" \\`,
    `  -d '{"event":"hello","data":1}'`,
  ].join("\n");
}

/** Short, human-friendly timestamp for the request tables. */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (sameDay) return `Today ${time}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + ` ${time}`;
}

/** One-line preview of a logged request body. */
export function previewBody(body?: string, bodyType?: string): string {
  if (!body) return bodyType === "none" || !bodyType ? "—" : "(empty body)";
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? flat.slice(0, 60) + "…" : flat;
}
