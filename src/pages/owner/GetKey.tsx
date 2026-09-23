import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/panel/PageHeader";
import { CopyButton } from "@/components/panel/CopyButton";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  Coins,
  KeyRound,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
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
  const info = useQuery(api.getkey.info);
  const accounts = useQuery(api.getkey.listAccounts);
  const grantCoins = useMutation(api.getkey.grantCoins);
  const setAccountBanned = useMutation(api.getkey.setAccountBanned);
  const resetAccountDaily = useMutation(api.getkey.resetAccountDaily);
  const deleteAccount = useMutation(api.getkey.deleteAccount);

  const [query, setQuery] = useState("");
  const [grantAmount, setGrantAmount] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const rows = accounts ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (a) =>
        a.handle.includes(q) ||
        (a.telegramUsername ?? "").toLowerCase().includes(q) ||
        (a.telegramId ?? "").includes(q) ||
        (a.lastKey ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const totalCoins = rows.reduce((sum, a) => sum + a.coins, 0);
  const claimsToday = rows.reduce((sum, a) => sum + a.usedToday, 0);

  const run = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const grant = (id: string, sign: 1 | -1) => {
    const raw = grantAmount[id];
    const amount = Math.abs(Number(raw ?? ""));
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error("Enter an amount first");
      return;
    }
    void run(
      id,
      () => grantCoins({ id: id as never, amount: amount * sign }),
      `${sign > 0 ? "Added" : "Removed"} ${amount} coins`,
    );
  };

  if (info === undefined || accounts === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="GetKey"
        description="Panxcz coin accounts — the public /getkey page spends coins (5 per 5-hour key) and links to the Telegram bot."
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {[
          {
            icon: Users,
            label: "Coin accounts",
            value: String(rows.length),
            hint: "auto-created on first claim",
          },
          {
            icon: Coins,
            label: "Coins outstanding",
            value: String(totalCoins),
            hint: "sum of all balances",
          },
          {
            icon: KeyRound,
            label: "Keys claimed today",
            value: String(claimsToday),
            hint: `max ${info.maxPerDay} per account/day`,
          },
          {
            icon: ShieldCheck,
            label: "Price / lifetime",
            value: `${info.price} / ${info.hours}h`,
            hint: `new accounts get ${info.welcomeCoins} coins`,
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
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                    {stat.hint}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Coin accounts</CardTitle>
              <CardDescription>
                Top up after payment (Telegram / support channel). Users link their
                account with <code className="font-mono">/link &lt;handle&gt;</code>{" "}
                in the bot.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search handle, @username, key…"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 py-10 text-center">
              <Coins className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No coin accounts yet.
              </p>
              <p className="max-w-sm text-xs text-muted-foreground/80">
                They appear automatically the first time someone claims a key on{" "}
                <code className="font-mono">/getkey</code> or starts the bot.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map((a) => (
                <div
                  key={a._id}
                  className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-mono text-sm font-medium">
                        {a.displayHandle || a.handle}
                      </p>
                      {a.banned ? (
                        <Badge variant="destructive" className="font-normal">
                          banned
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="font-normal">
                          {a.coins} coins
                        </Badge>
                      )}
                      {a.telegramId && (
                        <Badge variant="outline" className="font-normal">
                          TG {a.telegramUsername ? `@${a.telegramUsername}` : a.telegramId}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.totalClaims} keys issued · {a.totalSpent} coins spent ·{" "}
                      {a.usedToday} today
                    </p>
                    {a.lastKey && (
                      <p className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                        {a.lastKey}
                        <CopyButton value={a.lastKey} label="Key" variant="ghost" size="icon" />
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={grantAmount[a._id] ?? ""}
                      onChange={(e) =>
                        setGrantAmount((m) => ({ ...m, [a._id]: e.target.value }))
                      }
                      placeholder="coins"
                      inputMode="numeric"
                      className="w-20"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="cursor-pointer"
                      disabled={busy === a._id}
                      onClick={() => grant(a._id, 1)}
                    >
                      <Plus className="size-3.5" />
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="cursor-pointer"
                      disabled={busy === a._id}
                      onClick={() => grant(a._id, -1)}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="cursor-pointer"
                      disabled={busy === a._id}
                      title="Clear today's counter"
                      onClick={() =>
                        void run(
                          a._id,
                          () => resetAccountDaily({ id: a._id as never }),
                          "Daily counter cleared",
                        )
                      }
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`cursor-pointer ${a.banned ? "text-emerald-500" : "text-destructive"}`}
                      disabled={busy === a._id}
                      title={a.banned ? "Re-enable account" : "Suspend account"}
                      onClick={() =>
                        void run(
                          a._id,
                          () =>
                            setAccountBanned({
                              id: a._id as never,
                              banned: !a.banned,
                            }),
                          a.banned ? "Account re-enabled" : "Account suspended",
                        )
                      }
                    >
                      {busy === a._id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Ban className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="cursor-pointer text-muted-foreground hover:text-destructive"
                      disabled={busy === a._id}
                      title="Delete account"
                      onClick={() =>
                        void run(
                          a._id,
                          () => deleteAccount({ id: a._id as never }),
                          "Account deleted",
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How the claim flow works</CardTitle>
          <CardDescription>
            No system token needed — identity is the user&apos;s handle, coins pay
            for keys, and the shortener is the gate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="space-y-2 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1.</span> User opens{" "}
              <code className="font-mono">/getkey</code>, enters their Telegram ID or
              handle → the account is created with{" "}
              <span className="font-medium text-foreground">
                {info.welcomeCoins} welcome coins
              </span>
              .
            </li>
            <li>
              <span className="font-medium text-foreground">2.</span> They pick an
              available product (manage the list in{" "}
              <span className="font-medium text-foreground">Servers → Show on GetKey</span>
              ) and pass a human check.
            </li>
            <li>
              <span className="font-medium text-foreground">3.</span> Their claim goes
              through your ShrtFly short link, then the key is issued and{" "}
              <span className="font-medium text-foreground">
                {info.price} coins
              </span>{" "}
              are deducted (max {info.maxPerDay}/day).
            </li>
          </ol>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Bot — link a web account
            </Label>
            <pre className="overflow-x-auto rounded-lg border border-border/70 bg-background/70 p-3 text-xs leading-relaxed">
              <code>{`/start          → your Telegram ID + coin balance
/link panxcz    → bind this chat to the "panxcz" account
/getkey         → spend ${info.price} coins, get a ${info.hours}h key right in Telegram`}</code>
            </pre>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Terminal className="size-3.5" />
              API — still available for apps (token + coins)
            </Label>
            <div className="flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded-lg border border-border/70 bg-background/70 p-3 text-xs leading-relaxed">
                <code>{`curl -X POST ${CONVEX_SITE}/getkey \\
  -H 'Content-Type: application/json' \\
  -d '{"token":"YOUR_API_TOKEN"}'`}</code>
              </pre>
              <CopyButton
                value={`curl -X POST ${CONVEX_SITE}/getkey -H 'Content-Type: application/json' -d '{"token":"YOUR_API_TOKEN"}'`}
                label="Command"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
