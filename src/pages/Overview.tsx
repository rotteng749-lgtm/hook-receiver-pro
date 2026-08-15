import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/panel/PageHeader";
import { RequestTable } from "@/components/panel/RequestTable";
import { StatCard } from "@/components/panel/StatCard";
import { api } from "@/convex/_generated/api";
import { getCurlExample, getHookUrl } from "@/lib/webhook";
import { useQuery } from "convex/react";
import { CopyButton } from "@/components/panel/CopyButton";
import { Inbox, Plus, TerminalSquare, Webhook, Zap } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";

export default function Overview() {
  const navigate = useNavigate();
  const hooks = useQuery(api.hooks.list) ?? [];
  const requests = useQuery(api.requests.listForOwner, {}) ?? [];
  const totalRequests = useQuery(api.requests.countForOwner, {}) ?? 0;

  const hookPathById = useMemo(() => {
    const map = new Map<string, string>();
    for (const hook of hooks) map.set(hook._id, hook.path);
    return map;
  }, [hooks]);

  const recent24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return requests.filter((request) => request._creationTime >= cutoff).length;
  }, [requests]);

  const activeHooks = hooks.filter((hook) => hook.enabled).length;
  const firstHook = hooks[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="See how your hooks are performing at a glance."
        actions={
          <Button className="cursor-pointer" onClick={() => navigate("/dashboard/hooks?new=1")}>
            <Plus className="size-4" />
            New hook
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Webhook} label="Hooks" value={hooks.length} hint={`${activeHooks} active`} />
        <StatCard icon={Inbox} label="Total requests" value={totalRequests} hint="all time" />
        <StatCard icon={Zap} label="Requests (24h)" value={recent24h} hint="from captured history" />
        <StatCard
          icon={TerminalSquare}
          label="Last hit"
          value={requests[0] ? new Date(requests[0]._creationTime).toLocaleTimeString() : "—"}
          hint={requests[0] ? requests[0].method : "no traffic yet"}
        />
      </div>

      {firstHook && (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Quick start — {firstHook.name}</CardTitle>
            <CardDescription>
              Point your script at this URL. The token is sent automatically via the header.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[13px]">
                {getHookUrl(firstHook.path)}
              </code>
              <CopyButton value={getHookUrl(firstHook.path)} label="Hook URL" />
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-zinc-950 p-4 font-mono text-[12.5px] leading-relaxed text-zinc-300">
              {getCurlExample(firstHook.path, firstHook.token)}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => navigate(`/dashboard/hooks/${firstHook._id}`)}
            >
              Open hook settings
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Recent requests</h2>
          {requests.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer text-muted-foreground"
              onClick={() => navigate("/dashboard/requests")}
            >
              View all
            </Button>
          )}
        </div>
        <RequestTable
          requests={requests.slice(0, 6)}
          getHookPath={(hookId) => hookPathById.get(hookId) ?? null}
        />
      </div>
    </div>
  );
}
