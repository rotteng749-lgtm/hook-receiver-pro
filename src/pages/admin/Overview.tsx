import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/panel/PageHeader";
import { StatCard } from "@/components/panel/StatCard";
import { api } from "@/convex/_generated/api";
import { formatExpiry } from "@/lib/format";
import { useQuery } from "convex/react";
import {
  Activity,
  Coins,
  KeyRound,
  Loader2,
  Plus,
  Server,
} from "lucide-react";
import { useNavigate } from "react-router";

export default function AdminOverview() {
  const navigate = useNavigate();
  const stats = useQuery(api.nameserver.overviewStats);
  const keys = useQuery(api.nameserver.listKeys);

  if (stats === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const recent = (keys ?? []).slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Your wallet and your keys. Generate keys, hand them to clients, watch them connect."
        actions={
          <Button className="cursor-pointer" onClick={() => navigate("/admin/keys")}>
            <Plus className="size-4" />
            Generate key
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Coins} label="My balance" value={stats.balance.toLocaleString()} hint="per key: see settings" />
        <StatCard icon={KeyRound} label="My keys" value={stats.keyCount} hint={`${stats.activeKeyCount} active`} />
        <StatCard icon={Activity} label="My connects" value={stats.connectCount} hint={`${stats.successCount} successful`} />
        <StatCard icon={Server} label="Servers" value={stats.serverCount} hint="across the panel" />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">My latest keys</h2>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer text-muted-foreground"
            onClick={() => navigate("/admin/keys")}
          >
            View all
          </Button>
        </div>

        {recent.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <KeyRound className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No keys yet. Generate your first one and share it with a client.
              </p>
              <Button className="cursor-pointer" onClick={() => navigate("/admin/keys")}>
                <Plus className="size-4" />
                Generate key
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {recent.map((key) => (
                <li key={key._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs">{key.key}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {key.serverName} · {key.uses}/{key.maxUses === 0 ? "∞" : key.maxUses} uses ·
                      expires {formatExpiry(key.expiresAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
