import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatTime } from "@/lib/webhook";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { AuthBadge, MethodBadge, StatusBadge } from "./badges";

function KeyValueList({ data }: { data?: Record<string, string> }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">None</p>;
  }
  return (
    <div className="max-h-48 overflow-y-auto rounded-md border border-border">
      {entries.map(([key, value], i) => (
        <div
          key={key}
          className={`flex flex-col gap-0.5 px-3 py-1.5 text-[13px] sm:flex-row sm:gap-3 ${
            i % 2 === 0 ? "bg-muted/40" : ""
          }`}
        >
          <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">{key}</span>
          <span className="font-mono text-xs break-all">{value}</span>
        </div>
      ))}
    </div>
  );
}

function Copyable({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => undefined);
        toast("Copied to clipboard");
      }}
      className="group inline-flex max-w-full cursor-pointer items-center gap-1.5 font-mono text-xs break-all text-muted-foreground hover:text-foreground"
    >
      {text}
      <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

export function RequestDetailDialog({
  request,
  onClose,
}: {
  request: Doc<"requests"> | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <MethodBadge method={request.method} />
                <span className="font-mono text-sm font-semibold break-all">
                  {request.url}
                </span>
              </DialogTitle>
              <DialogDescription>
                {formatTime(request._creationTime)}
                {request.ip ? ` · from ${request.ip}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={request.status} />
              <AuthBadge authenticated={request.authenticated} error={request.error} />
              {request.bodyType && request.bodyType !== "none" && (
                <Badge variant="secondary" className="font-mono">
                  {request.bodyType}
                </Badge>
              )}
            </div>

            <div className="space-y-4">
              {Object.keys(request.query ?? {}).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Query parameters
                  </p>
                  <KeyValueList data={request.query} />
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Headers
                </p>
                <KeyValueList data={request.headers} />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Body{request.bodyType ? ` · ${request.bodyType}` : ""}
                </p>
                {request.body ? (
                  <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                    <Copyable text={request.body} />
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">No body</p>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
