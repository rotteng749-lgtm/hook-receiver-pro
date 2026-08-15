import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/panel/PageHeader";
import { RequestTable } from "@/components/panel/RequestTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function Requests() {
  const hooks = useQuery(api.hooks.list);
  const [filter, setFilter] = useState<string>("all");
  const hookId: Id<"hooks"> | undefined =
    filter === "all" ? undefined : (filter as Id<"hooks">);
  const requests = useQuery(api.requests.listForOwner, { hookId });
  const clearAll = useMutation(api.requests.clearAll);
  const [busy, setBusy] = useState(false);

  const hookPathById = useMemo(() => {
    const map = new Map<string, string>();
    for (const hook of hooks ?? []) map.set(hook._id, hook.path);
    return map;
  }, [hooks]);

  const handleClearAll = async () => {
    setBusy(true);
    try {
      await clearAll();
      toast("All request history cleared");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to clear history");
    } finally {
      setBusy(false);
    }
  };

  if (requests === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        description="Every hit on your hooks — method, headers, query, and body."
        actions={
          (requests?.length ?? 0) > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="cursor-pointer text-muted-foreground">
                  <Trash2 className="size-4" />
                  Clear all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all request history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes every captured request. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                  <AlertDialogAction className="cursor-pointer" onClick={handleClearAll} disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    Clear all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : undefined
        }
      />

      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-56" aria-label="Filter by hook">
            <SelectValue placeholder="All hooks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All hooks</SelectItem>
            {(hooks ?? []).map((hook) => (
              <SelectItem key={hook._id} value={hook._id}>
                /{hook.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {requests.length} request{requests.length === 1 ? "" : "s"}
        </p>
      </div>

      <RequestTable
        requests={requests}
        getHookPath={(hookId) => hookPathById.get(hookId) ?? null}
      />
    </div>
  );
}
