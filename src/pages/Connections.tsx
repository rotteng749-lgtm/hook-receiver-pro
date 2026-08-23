import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatRelative } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  Eraser,
  Filter,
  Loader2,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type ConnRow = Doc<"connections"> & {
  serverName: string;
  serverCode: string;
};

function reasonLabel(reason?: string): string {
  if (!reason) return "—";
  return reason.replace(/_/g, " ");
}

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2 } },
};

export default function Connections() {
  const { user } = useAuth();
  const connections = useQuery(api.nameserver.listConnections);
  const deleteConnection = useMutation(api.nameserver.deleteConnection);
  const clearConnections = useMutation(api.nameserver.clearConnections);
  const role = user?.role ?? "user";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");

  const filtered = useMemo(() => {
    if (!connections) return [];
    let result = connections;
    if (filter === "success") result = result.filter((c) => c.ok);
    if (filter === "failed") result = result.filter((c) => !c.ok);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.key.toLowerCase().includes(q) ||
          c.ip.toLowerCase().includes(q) ||
          (c.deviceId ?? "").toLowerCase().includes(q) ||
          (c.serverName ?? "").toLowerCase().includes(q) ||
          (c.serverCode ?? "").toLowerCase().includes(q) ||
          (c.reason ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [connections, search, filter]);

  const successCount = connections?.filter((c) => c.ok).length ?? 0;
  const failedCount = connections?.filter((c) => !c.ok).length ?? 0;

  const removeOne = async (id: Doc<"connections">["_id"]) => {
    try {
      await deleteConnection({ id });
      toast.success("Log entry deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete entry");
    }
  };

  const clearAll = async () => {
    try {
      const res = await clearConnections();
      toast.success(
        res.deleted > 0
          ? `Deleted ${res.deleted} log ${res.deleted === 1 ? "entry" : "entries"}`
          : "Nothing to delete",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear log");
    }
  };

  if (connections === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Connections"
        description={
          role === "owner"
            ? "Every /connect attempt across all servers — success or failure."
            : "Every /connect attempt against your keys."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live — updates automatically
            </span>
            {connections.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="cursor-pointer">
                    <Eraser className="size-3.5" />
                    Clear all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear the connect log?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {role === "owner"
                        ? `This deletes all ${connections.length} log entries permanently.`
                        : `This deletes all ${connections.length} log entries tied to your keys permanently.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
                      onClick={clearAll}
                    >
                      Delete all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      {/* Search & filter bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by key, IP, device, server, reason…"
            className="pl-9"
          />
          {search.length > 0 && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XCircle className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="size-3.5 text-muted-foreground" />
          {(["all", "success", "failed"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter(f)}
              className="cursor-pointer text-xs capitalize"
            >
              {f}
              {f === "success" && <span className="ml-1 text-emerald-400">{successCount}</span>}
              {f === "failed" && <span className="ml-1 text-destructive">{failedCount}</span>}
              {f === "all" && <span className="ml-1 text-muted-foreground">{connections.length}</span>}
            </Button>
          ))}
        </div>
      </motion.div>

      {filtered.length === 0 ? (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Activity className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {connections.length === 0
                ? "No connect attempts yet. Share a key and a server code with a client, then watch them land here."
                : "No results match your search. Try a different query."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="overflow-x-auto rounded-xl border border-border bg-card"
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Server</th>
                <th className="px-4 py-3 font-medium">Key</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 font-medium">User agent</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <AnimatePresence mode="popLayout">
              <motion.tbody
                className="divide-y divide-border"
                variants={listVariants}
                initial="hidden"
                animate="visible"
              >
                {filtered.map((conn) => (
                  <motion.tr
                    key={conn._id}
                    variants={itemVariants}
                    exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
                    layout
                    className="hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                      {formatRelative(conn._creationTime)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium">{conn.serverName}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {conn.serverCode}
                      </p>
                    </td>
                    <td className="max-w-[160px] px-4 py-3">
                      <code className="truncate font-mono text-xs">{conn.key}</code>
                    </td>
                    <td className="max-w-[140px] px-4 py-3">
                      {conn.deviceId ? (
                        <code className="truncate font-mono text-[11px] text-muted-foreground">
                          {conn.deviceId}
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {(conn.resource || conn.game) && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                          {conn.resource}
                          {conn.game &&
                            ` · ${conn.game}${conn.version ? ` v${conn.version}` : ""}`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {conn.ip}
                    </td>
                    <td className="px-4 py-3">
                      {conn.ok ? (
                        <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600/90">
                          connected
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-white">
                          {reasonLabel(conn.reason)}
                        </Badge>
                      )}
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <p className="truncate text-xs text-muted-foreground">
                        {conn.userAgent ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="cursor-pointer text-muted-foreground hover:text-destructive"
                              aria-label="Delete log entry"
                              title="Delete this log entry"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this log entry?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the record of this /connect attempt
                                permanently. It does not affect the key or its
                                device binding.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="cursor-pointer">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
                                onClick={() => removeOne(conn._id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </AnimatePresence>
          </table>
        </motion.div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {connections.length} most recent attempts. The connect URL is
        <code className="mx-1 rounded bg-muted px-1 py-0.5">
          POST /connect
        </code>
        on the Convex site of this deployment.
      </p>
    </div>
  );
}
