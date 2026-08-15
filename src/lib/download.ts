/**
 * Helpers for the file server UI: building public download URLs, mapping
 * file extensions to Content-Types, and formatting sizes/timestamps.
 */

/** Content-Type mapping — mirrors the server map in src/convex/files.ts. */
export const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".apk": "application/vnd.android.package-archive",
  ".sh": "text/x-shellscript",
  ".dll": "application/octet-stream",
  ".so": "application/octet-stream",
  ".zip": "application/zip",
  ".json": "application/json",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

export function contentTypeFor(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && dot < base.length - 1 ? base.slice(dot).toLowerCase() : "";
  return CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * The public HTTP API (health, login, files, download) is served by Convex at
 * https://<deployment>.convex.site — a different host from the admin app.
 * Derive it from VITE_CONVEX_URL, or override it with VITE_SITE_URL.
 */
export function getSiteBaseUrl(): string {
  const override = import.meta.env.VITE_SITE_URL as string | undefined;
  if (override) return override.replace(/\/+$/, "");
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (convexUrl) return convexUrl.replace(/\.convex\.cloud$/, ".convex.site");
  return "https://files.example.com";
}

/** Public download URL for a file id. */
export function getFileUrl(id: string): string {
  return `${getSiteBaseUrl()}/files/${id}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(timestamp);
}
