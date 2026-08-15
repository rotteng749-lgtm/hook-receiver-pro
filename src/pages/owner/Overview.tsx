import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/panel/PageHeader";
import { StatCard } from "@/components/panel/StatCard";
import { api } from "@/convex/_generated/api";
import { formatRelative } from "@/lib/format";
import { useQuery } from "convex/react";
import {
  Activity,
  Coins,
  KeyRound,
  Loader2,
  Server,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router";

export default function OwnerOverview() {
  const navigate = useNavigate();
  const stats = useQuery(api.nameserver.overviewStats);
  const connections = useQuery(api.nameserver.listConnections);

  if (stats === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const recent = (connections ?? []).slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Owner overview"
        description="Full control of every server, key, member and setting."
        actions={
          <Button className="cursor-pointer" onClick={() => navigate("/owner/settings")}>
            <Settings className="size-4" />
            Settings
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Server} label="Servers" value={stats.serverCount} hint="active nameservers" />
        <StatCard icon={KeyRound} label="Keys" value={stats.keyCount} hint={`${stats.activeKeyCount} active`} />
        <StatCard icon={Activity} label="Connects" value={stats.connectCount} hint={`${stats.successCount} successful`} />
        <StatCard icon={Users} label="Members" value={stats.memberCount} hint="accounts on the panel" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard icon={Wallet} label="Your balance" value={stats.balance.toLocaleString()} hint="deducted per generated key" />
        <StatCard icon={Coins} label="Total balances" value={stats.totalBalance.toLocaleString()} hint="across all members" />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Latest connections</h2>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer text-muted-foreground"
            onClick={() => navigate("/owner/connections")}
          >
            View all
          </Button>
        </div>

        {recent.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Activity className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No connect attempts yet — create a server, generate a key, and
                hit <code className="rounded bg-muted px-1 py-0.5">/connect</code>.
              </p>
              <Button className="cursor-pointer" onClick={() => navigate("/owner/servers")}>
                <Server className="size-4" />
                Create a server
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {recent.map((conn) => (
                <li key={conn._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {conn.serverName}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {conn.key}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {conn.ip} · {formatRelative(conn._creationTime)}
                    </p>
                  </div>
                  {conn.ok ? (
                    <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600/90">
                      connected
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-white">
                      {conn.reason ?? "failed"}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
