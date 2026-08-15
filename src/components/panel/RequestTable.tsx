import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatTime, previewBody } from "@/lib/webhook";
import { History } from "lucide-react";
import { useState } from "react";
import { AuthBadge, MethodBadge, StatusBadge } from "./badges";
import { RequestDetailDialog } from "./RequestDetailDialog";

export function RequestTable({
  requests,
  getHookPath,
  loading = false,
}: {
  requests: Doc<"requests">[];
  getHookPath?: (hookId: string) => string | null;
  loading?: boolean;
}) {
  const [selected, setSelected] = useState<Doc<"requests"> | null>(null);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-border">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <Empty className="rounded-xl border border-border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>No requests yet</EmptyTitle>
          <EmptyDescription>
            Point a script at one of your hook URLs and the request will show up
            here instantly.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-24">Method</TableHead>
              {getHookPath && <TableHead>Hook</TableHead>}
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-28">Auth</TableHead>
              <TableHead className="w-full min-w-40">Body</TableHead>
              <TableHead className="w-40 text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow
                key={request._id}
                className="cursor-pointer"
                onClick={() => setSelected(request)}
              >
                <TableCell>
                  <MethodBadge method={request.method} />
                </TableCell>
                {getHookPath && (
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">
                      /{getHookPath(request.hookId) ?? "?"}
                    </span>
                  </TableCell>
                )}
                <TableCell>
                  <StatusBadge status={request.status} />
                </TableCell>
                <TableCell>
                  <AuthBadge authenticated={request.authenticated} error={request.error} />
                </TableCell>
                <TableCell className="max-w-56 truncate font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {previewBody(request.body, request.bodyType)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(request._creationTime)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <RequestDetailDialog request={selected} onClose={() => setSelected(null)} />
    </>
  );
}
