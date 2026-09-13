import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/panel/CopyButton";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Clock,
  KeyRound,
  Loader2,
  RotateCcw,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";

const CONVEX_SITE =
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.replace(
    /\.convex\.cloud$/,
    ".convex.site",
  ) ?? "https://your-deployment.convex.site";

const stagger = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: "easeOut" as const },
  }),
};

export default function GetKeyPage() {
  const usage = useQuery(api.nameserver.listGetkeyUsage);
  const mintTrialKey = useMutation(api.nameserver.mintTrialKey);
  const resetUsage = useMutation(api.nameserver.resetGetkeyUsage);

  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ key: string; expiresAt: number } | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  const endpoint = `${CONVEX_SITE}/getkey`;

  if (usage === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalToday = usage.rows.reduce((sum, r) => sum + r.count, 0);

  const handleMint = async () => {
    setBusy(true);
    try {
      const res = await mintTrialKey({});
      setIssued({ key: res.key, expiresAt: res.expiresAt });
      toast.success(`Trial key issued on ${res.serverName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not issue a trial key");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (id?: string) => {
    setResetting(id ?? "all");
    try {
      const res = await resetUsage(id ? { id: id as never } : {});
      toast.success(`Cleared ${res.deleted} usage record(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset usage");
    } finally {
      setResetting(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="GetKey"
        description="Token-based trial keys — 5 hours, a capped number per day, no account needed."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => handleReset()}
              disabled={resetting === "all" || usage.rows.length === 0}
            >
              {resetting === "all" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Reset today
            </Button>
            <Button onClick={handleMint} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Issue trial key
            </Button>
          </>
        }
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {[
          {
            icon: Clock,
            label: "Key lifetime",
            value: `${usage.hours}h`,
            hint: "set in Settings → GetKey",
          },
          {
            icon: Zap,
            label: "Max per day / token",
            value: String(usage.maxPerDay),
            hint: "counted per API token",
          },
          {
            icon: KeyRound,
            label: "Issued today",
            value: String(totalToday),
            hint: `${usage.rows.length} token(s) used`,
          },
          {
            icon: Sparkles,
            label: "Coin price",
            value: String(usage.price),
            hint: "logged per issued key",
          },
        ].map((stat, i) => (
          <motion.div key={stat.label} custom={i} variants={stagger}>
            <Card className="h-full">
              <CardContent className="flex items-start gap-3 pt-6">
                <div className="rounded-lg border border-border/70 bg-muted/40 p-2">
                  <stat.icon className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-semibold tracking-tight">{stat.value}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">{stat.hint}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {issued && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">Trial key issued</CardTitle>
              <CardDescription>
                Expires {new Date(issued.expiresAt).toLocaleString()} — 1 device, unlimited
                connects until then.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-border/70 bg-background/70 px-3 py-2 font-mono text-sm">
                  {issued.key}
                </code>
                <CopyButton value={issued.key} label="Key" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How clients get a trial key</CardTitle>
          <CardDescription>
            The user's app sends its API token — the server issues a fresh trial key and
            enforces the daily cap per token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">POST — issue a key</Label>
            <div className="flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded-lg border border-border/70 bg-background/70 p-3 text-xs leading-relaxed">
                <code>{`curl -X POST ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -d '{"token":"YOUR_API_TOKEN"}'`}</code>
              </pre>
              <CopyButton
                value={`curl -X POST ${endpoint} -H 'Content-Type: application/json' -d '{"token":"YOUR_API_TOKEN"}'`}
                label="Command"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              GET — check the remaining quota
            </Label>
            <div className="flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded-lg border border-border/70 bg-background/70 p-3 text-xs leading-relaxed">
                <code>{`${endpoint}?token=YOUR_API_TOKEN`}</code>
              </pre>
              <CopyButton value={`${endpoint}?token=YOUR_API_TOKEN`} label="URL" />
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
            Success returns{" "}
            <code className="font-mono text-foreground">
              {`{ ok, key, hours, expiresAt, usedToday, maxPerDay, remaining }`}
            </code>
            . When the cap is hit it returns HTTP 429 with{" "}
            <code className="font-mono text-foreground">daily limit reached</code>.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Today's usage</CardTitle>
              <CardDescription>{usage.day} · UTC</CardDescription>
            </div>
            <Badge variant="outline" className="gap-1 font-normal">
              <Terminal className="size-3" />
              {usage.rows.length} token(s)
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {usage.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 py-10 text-center">
              <KeyRound className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No trial keys issued today.
              </p>
              <p className="max-w-sm text-xs text-muted-foreground/80">
                Create an API token on the API page, then call the endpoint above to test the
                full flow.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {usage.rows.map((row) => (
                <div
                  key={row._id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.tokenLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.count}/{usage.maxPerDay} used · {row.remaining} left ·{" "}
                      {row.spentCoins} coins
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={row.remaining > 0 ? "secondary" : "destructive"}
                      className="font-normal"
                    >
                      {row.remaining > 0 ? "active" : "capped"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleReset(row._id)}
                      disabled={resetting === row._id}
                    >
                      {resetting === row._id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                      Reset
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
