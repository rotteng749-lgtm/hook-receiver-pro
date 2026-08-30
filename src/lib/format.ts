import { formatDistanceToNow, format } from "date-fns";

export function formatRelative(timestamp: number): string {
  return formatDistanceToNow(timestamp, { addSuffix: true });
}

export function formatDateTime(timestamp: number): string {
  return format(timestamp, "MMM d, HH:mm");
}

/** "2h" / "never" / "3 days" style expiry label for a key. */
export function formatExpiry(expiresAt: number): string {
  if (expiresAt === 0) return "never";
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "expired";
  const days = ms / (86400000);
  if (days < 1) {
    const hours = ms / (3600000);
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
    return `${Math.round(hours)}h`;
  }
  if (days < 365) return `${Math.round(days)}d`;
  return `${(days / 365).toFixed(1)}y`;
}

export function formatUses(uses: number, maxUses: number): string {
  if (maxUses === 0) return `${uses} / ∞`;
  return `${uses} / ${maxUses}`;
}
