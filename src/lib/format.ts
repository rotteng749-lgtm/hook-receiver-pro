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
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function formatUses(uses: number, maxUses: number): string {
  if (maxUses === 0) return `${uses} / ∞`;
  return `${uses} / ${maxUses}`;
}
