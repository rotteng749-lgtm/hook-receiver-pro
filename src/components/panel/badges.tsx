import { cn } from "@/lib/utils";

const methodStyles: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  POST: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  PUT: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  PATCH: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  DELETE: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  OPTIONS: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold",
        methodStyles[method] ?? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20",
      )}
    >
      {method}
    </span>
  );
}

export function StatusBadge({ status }: { status: number }) {
  const color =
    status >= 200 && status < 300
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
      : status >= 400
        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20"
        : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold",
        color,
      )}
    >
      {status}
    </span>
  );
}

export function AuthBadge({ authenticated, error }: { authenticated: boolean; error?: string }) {
  if (authenticated) {
    return (
      <span className="inline-flex w-fit items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
        ✓ authed
      </span>
    );
  }
  return (
    <span
      className="inline-flex w-fit items-center rounded-md border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300"
      title={error ?? "rejected"}
    >
      ✕ {error ?? "rejected"}
    </span>
  );
}
