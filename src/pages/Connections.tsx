import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatRelative } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { Activity, Loader2 } from "lucide-react";

type ConnRow = Doc<"connections"> & {
  serverName: string;
  serverCode: string;
};

function reasonLabel(reason?: string): string {
  if (!reason) return "—";
  return reason.replace(/_/g, " ");
}

export default function Connections() {
  const { user } = useAuth();
  const connections = useQuery(api.nameserver.listConnections);
  const role = user?.role ?? "user";

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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live — updates automatically
          </span>
        }
      />

      {connections.length === 0 ? (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Activity className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No connect attempts yet. Share a key and a server code with a
              client, then watch them land here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {connections.map((conn) => (
                <tr key={conn._id} className="hover:bg-muted/30">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing the {connections.length} most recent attempts. The connect URL is
        <code className="mx-1 rounded bg-muted px-1 py-0.5">
          POST /connect
        </code>
        on the Convex site of this deployment.
      </p>
    </div>
  );
}
