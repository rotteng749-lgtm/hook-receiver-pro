import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CopyButton } from "@/components/panel/CopyButton";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatExpiry, formatRelative, formatUses } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Clock,
  Coins,
  Download,
  Gamepad2,
  Globe,
  History,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type KeyRow = Doc<"connectKeys"> & {
  serverName: string;
  serverCode: string;
  creatorEmail: string;
  canManage: boolean;
};

const GAMES = ["", "MLBB", "FREEFIRE", "PUBG", "CODM", "GENSHIN", "OTHER"];

function KeyStatusBadge({ status }: { status: KeyRow["status"] }) {
  if (status === "active")
    return (
      <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600/90">
        active
      </Badge>
    );
  if (status === "used")
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        used
      </Badge>
    );
  if (status === "revoked")
    return (
      <Badge variant="destructive" className="text-white">
        revoked
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      expired
    </Badge>
  );
}

function GenerateKeyCard({ scope }: { scope: "owner" | "admin" }) {
  const servers = useQuery(api.nameserver.listServers) ?? [];
  const settings = useQuery(api.nameserver.getSettings);
  const stats = useQuery(api.nameserver.overviewStats);
  const debugAuth = useQuery(api.nameserver.debugAuth);
  const generateKey = useMutation(api.nameserver.generateKey);
  const batchGenerateKeys = useMutation(api.nameserver.batchGenerateKeys);

  const [serverId, setServerId] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [note, setNote] = useState("");
  const [uses, setUses] = useState("");
  const [hours, setHours] = useState("");
  const [maxDevices, setMaxDevices] = useState("");
  const [game, setGame] = useState("");
  const [ipWhitelist, setIpWhitelist] = useState("");
  const [ipBlacklist, setIpBlacklist] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchCount, setBatchCount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    key: string;
    cost: number;
    balance: number;
    keys?: { key: string }[];
  } | null>(null);

  const cost = settings?.keyPrice ?? 0;
  const balance = stats?.balance ?? 0;
  const unlimited = scope === "owner" && stats?.unlimited === true;
  const activeServers = servers.filter((s) => s.status === "active");
  const keyFormat =
    settings?.keyFormat || `${settings?.keyPrefix ?? "NS"}-XXXX-XXXX-XXXX-XXXX-XXXX`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverId) {
      toast.error("Pick a server for the key");
      return;
    }
    setBusy(true);
    try {
      const baseArgs = {
        serverId: serverId as Doc<"servers">["_id"],
        note: note || undefined,
        uses: uses === "" ? undefined : Number(uses),
        hours: hours === "" ? undefined : Number(hours),
        maxDevices: maxDevices === "" ? undefined : Number(maxDevices),
        game: game || undefined,
        ipWhitelist: ipWhitelist.split(",").map((s) => s.trim()).filter(Boolean),
        ipBlacklist: ipBlacklist.split(",").map((s) => s.trim()).filter(Boolean),
      };

      if (batchMode) {
        const count = Math.max(1, Math.min(100, Number(batchCount) || 10));
        const res = await batchGenerateKeys({ ...baseArgs, count });
        setResult({ key: res.keys?.map((k) => k.key).join("\n") ?? "", cost: res.cost, balance: res.balance, keys: res.keys });
      } else {
        const res = await generateKey({ ...baseArgs, customKey: customKey.trim() || undefined });
        setResult(res);
      }
      setCustomKey("");
      setNote("");
      setUses("");
      setHours("");
      setMaxDevices("");
      setGame("");
      setIpWhitelist("");
      setIpBlacklist("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate key");
    } finally {
      setBusy(false);
    }
  };

  // Debug: show auth state to diagnose generateKey failures
  const authDebug = debugAuth;
  const showAuthWarn = authDebug && (!authDebug.authenticated || !authDebug.userFound || (authDebug.role !== "owner" && authDebug.role !== "admin"));

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {showAuthWarn && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          ⚠️ Auth issue: {JSON.stringify(authDebug)}
        </div>
      )}
      <Card className="border-border/70">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Generate keys</CardTitle>
              <CardDescription>
                {unlimited
                  ? `Each key costs ${cost} balance — your wallet is unlimited.`
                  : `Each key costs ${cost} balance — you have ${balance} left.`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Batch</Label>
              <Switch checked={batchMode} onCheckedChange={setBatchMode} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="size-3.5" />
            {customKey.trim().length > 0 ? (
              <>Manual key <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{customKey}</code></>
            ) : (
              <>Format: <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{keyFormat}</code></>
            )}
          </p>
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Server</Label>
              <Select value={serverId} onValueChange={setServerId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a server" /></SelectTrigger>
                <SelectContent>
                  {activeServers.map((s) => (
                    <SelectItem key={s._id} value={s._id}>{s.name} · {s.code}</SelectItem>
                  ))}
                  {activeServers.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No active servers.</p>}
                </SelectContent>
              </Select>
            </div>

            {batchMode ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="batch-count">Number of keys to generate</Label>
                <Input id="batch-count" type="number" min={1} max={100} value={batchCount} onChange={(e) => setBatchCount(e.target.value)} placeholder="10" />
              </div>
            ) : (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="key-custom">Custom key <span className="ml-1 font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="key-custom" value={customKey} onChange={(e) => setCustomKey(e.target.value.toUpperCase())} placeholder="e.g. ML_227182973" maxLength={80} className="font-mono" />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="key-game">Game <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Select value={game} onValueChange={setGame}>
                <SelectTrigger className="w-full"><SelectValue placeholder="All games" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All games (no filter)</SelectItem>
                  {GAMES.filter(Boolean).map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">If set, only this game can use the key.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="key-note">Note <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="key-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. client #7" maxLength={160} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="key-uses">Max uses <span className="font-normal text-muted-foreground">(0 = unlimited)</span></Label>
              <Input id="key-uses" type="number" min={0} value={uses} onChange={(e) => setUses(e.target.value)} placeholder={String(settings?.defaultKeyUses ?? 0)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="key-hours">Lifetime (hours) <span className="font-normal text-muted-foreground">(0 = never)</span></Label>
              <Input id="key-hours" type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} placeholder={String(settings?.defaultKeyHours ?? 0)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="key-max-devices">Max devices <span className="font-normal text-muted-foreground">(0 = unlimited)</span></Label>
              <Input id="key-max-devices" type="number" min={0} value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} placeholder="1" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="key-uses2">Placeholder</Label>
              <div />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="key-ip-wl">IP Whitelist <span className="font-normal text-muted-foreground">(comma-separated, empty = any)</span></Label>
              <Input id="key-ip-wl" value={ipWhitelist} onChange={(e) => setIpWhitelist(e.target.value)} placeholder="e.g. 192.168.1.0, 10.0.0.0" />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="key-ip-bl">IP Blacklist <span className="font-normal text-muted-foreground">(comma-separated, empty = none)</span></Label>
              <Input id="key-ip-bl" value={ipBlacklist} onChange={(e) => setIpBlacklist(e.target.value)} placeholder="e.g. 203.0.113.0" />
            </div>

            <div className="flex items-end sm:col-span-2">
              <Button type="submit" disabled={busy || activeServers.length === 0 || (!unlimited && balance < cost)} className="w-full cursor-pointer sm:w-auto">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {batchMode
                  ? `Generate ${batchCount || 10} keys`
                  : unlimited ? "Generate key" : `Generate key — ${cost} balance`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{batchMode ? `${result?.keys?.length ?? 0} keys generated` : "Key generated"}</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-amber-500" />
              Shown once — copy now. Cost: {result?.cost}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
            <code className="min-w-0 flex-1 truncate whitespace-pre-wrap font-mono text-xs">
              {result?.key}
            </code>
            <CopyButton value={result?.key ?? ""} label="Key" />
          </div>
          <p className="text-xs text-muted-foreground">
            Balance: <span className="font-semibold text-foreground">{unlimited ? "∞" : result?.balance}</span>
          </p>
        </DialogContent>
      </Dialog>
      </motion.div>
    </>
  );
}

function KeyHistoryDialog({ keyDoc, open, onClose }: { keyDoc: KeyRow | null; open: boolean; onClose: () => void }) {
  const history = useQuery(
    api.nameserver.keyConnectHistory,
    keyDoc ? { keyId: keyDoc._id, limit: 30 } : "skip",
  );

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" />
            Connect History
          </DialogTitle>
          <DialogDescription>
            Last connections for <code className="rounded bg-muted px-1 font-mono text-xs">{keyDoc?.key}</code>
          </DialogDescription>
        </DialogHeader>
        {history === undefined ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : history.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No connections yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Device</th>
                  <th className="px-3 py-2 font-medium">Game</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((c) => (
                  <tr key={c._id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{formatRelative(c._creationTime)}</td>
                    <td className="px-3 py-2 font-mono">{c.ip}</td>
                    <td className="max-w-[120px] px-3 py-2 truncate font-mono">{c.deviceId ?? "—"}</td>
                    <td className="px-3 py-2">{c.game ?? "—"}</td>
                    <td className="px-3 py-2">
                      {c.ok ? (
                        <Badge className="bg-emerald-600/90 text-white text-[10px]">OK</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">{c.reason ?? "fail"}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export default function KeysPanel({ scope }: { scope: "owner" | "admin" }) {
  const keys = useQuery(api.nameserver.listKeys);
  const stats = useQuery(api.nameserver.overviewStats);
  const exportKeys = useQuery(api.nameserver.exportKeys);
  const revokeKey = useMutation(api.nameserver.revokeKey);
  const deleteKey = useMutation(api.nameserver.deleteKey);
  const renewKey = useMutation(api.nameserver.renewKey);
  const resetKeyDevice = useMutation(api.nameserver.resetKeyDevice);
  const updateKeyDevices = useMutation(api.nameserver.updateKeyDevices);
  const balance = stats?.balance ?? 0;
  const [editKey, setEditKey] = useState<KeyRow | null>(null);
  const [editMaxDevices, setEditMaxDevices] = useState("1");
  const [editBusy, setEditBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState<KeyRow | null>(null);

  const openEditDevices = (key: KeyRow) => {
    setEditKey(key);
    setEditMaxDevices(String(key.maxDevices ?? 1));
  };

  const saveDevices = async () => {
    if (!editKey) return;
    setEditBusy(true);
    try {
      const value = Math.max(0, Math.round(Number(editMaxDevices) || 0));
      await updateKeyDevices({ id: editKey._id, maxDevices: value });
      toast.success(value === 0 ? "Device limit set to unlimited" : `Device limit set to ${value}`);
      setEditKey(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update key");
    } finally {
      setEditBusy(false);
    }
  };

  const revoke = async (key: KeyRow) => {
    try {
      await revokeKey({ id: key._id });
      toast.success("Key revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const renew = async (key: KeyRow, days: number) => {
    try {
      const res = await renewKey({ id: key._id, days });
      toast.success(`Key renewed +${days} days`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const remove = async (key: KeyRow) => {
    try {
      await deleteKey({ id: key._id });
      toast.success("Key deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const reset = async (key: KeyRow) => {
    try {
      const res = await resetKeyDevice({ id: key._id });
      toast.success(res.hadDevice ? "Device unbound" : "Key was not bound");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const exportCSV = () => {
    if (!exportKeys || exportKeys.length === 0) {
      toast.error("No keys to export");
      return;
    }
    const headers = ["Key", "Status", "Server", "Game", "MaxDevices", "BoundDevices", "Uses", "MaxUses", "Expires", "Note", "Whitelist", "Blacklist", "CreatedAt"];
    const rows = exportKeys.map((k) => [k.key, k.status, k.server, k.game, String(k.maxDevices), String(k.devices), String(k.uses), String(k.maxUses), k.expiresAt, k.note, k.ipWhitelist, k.ipBlacklist, k.createdAt]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keys-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${exportKeys.length} keys`);
  };

  if (keys === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <PageHeader
          title="Keys"
          description={
            scope === "owner"
              ? "Every generated key across all members. Generating one costs balance."
              : "Your keys. Generating one costs balance from your wallet."
          }
        />
      </motion.div>

      <GenerateKeyCard scope={scope} />

      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-between"
        >
          <h2 className="text-base font-semibold tracking-tight">
            {scope === "owner" ? "All keys" : "My keys"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{keys.length} total</span>
          </h2>
          {keys.length > 0 && (
            <Button variant="outline" size="sm" className="cursor-pointer gap-1.5" onClick={exportCSV}>
              <Download className="size-3.5" />
              Export CSV
            </Button>
          )}
        </motion.div>

        {keys.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="border-dashed border-border bg-card/50">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <KeyRound className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No keys yet — generate one above.</p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Server</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Game</th>
                  <th className="px-4 py-3 font-medium">Uses</th>
                  <th className="px-4 py-3 font-medium">Device</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  {scope === "owner" && <th className="px-4 py-3 font-medium">Created by</th>}
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((key) => (
                  <motion.tr
                    key={key._id}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    className="hover:bg-muted/30"
                  >
                    <td className="max-w-[180px] px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <code className="truncate font-mono text-xs">{key.key}</code>
                        <CopyButton value={key.key} label="Key" variant="ghost" size="icon" />
                      </div>
                      {key.note && <p className="mt-0.5 truncate text-xs text-muted-foreground">{key.note}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium">{key.serverName}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{key.serverCode}</p>
                    </td>
                    <td className="px-4 py-3"><KeyStatusBadge status={key.status} /></td>
                    <td className="px-4 py-3">
                      {key.game ? (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Gamepad2 className="size-2.5" />
                          {key.game}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">all</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">{formatUses(key.uses, key.maxUses)}</td>
                    <td className="max-w-[160px] px-4 py-3">
                      {key.deviceId ? (
                        <>
                          <code className="truncate font-mono text-[11px]">{key.deviceId}</code>
                          {(key.devices?.length ?? 1) > 1 && (
                            <span className="ml-1 text-[11px] text-muted-foreground">+{key.devices!.length - 1}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">unbound</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{formatExpiry(key.expiresAt)}</td>
                    {scope === "owner" && (
                      <td className="px-4 py-3 text-xs text-muted-foreground">{key.creatorEmail}</td>
                    )}
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatRelative(key._creationTime)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* History */}
                        <Button variant="ghost" size="icon-sm" className="cursor-pointer text-muted-foreground hover:text-foreground" title="Connect history" onClick={() => setHistoryKey(key)}>
                          <History className="size-4" />
                        </Button>
                        {key.canManage && (
                          <Button variant="ghost" size="icon-sm" className="cursor-pointer text-muted-foreground hover:text-foreground" title="Device limit" onClick={() => openEditDevices(key)}>
                            <Settings2 className="size-4" />
                          </Button>
                        )}
                        {key.canManage && key.deviceId && key.status !== "revoked" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon-sm" className="cursor-pointer text-muted-foreground hover:text-foreground" title="Reset device">
                                <RefreshCw className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reset device binding?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Unbinding lets the key connect from a new device. The usage counter is not affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                                <AlertDialogAction className="cursor-pointer" onClick={() => reset(key)}>Reset</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {key.canManage && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon-sm" className="cursor-pointer text-muted-foreground hover:text-foreground" title="Renew / Extend">
                                <Clock className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Renew key?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Extend this key's expiry. If expired, starts from today.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <div className="flex gap-2 px-6 pb-4">
                                {[7, 30, 90, 365].map((d) => (
                                  <Button key={d} variant="outline" size="sm" className="cursor-pointer" onClick={() => renew(key, d)}>
                                    {d}d
                                  </Button>
                                ))}
                              </div>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="cursor-pointer">Close</AlertDialogCancel>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {key.canManage && key.status !== "revoked" && (
                          <Button variant="ghost" size="icon-sm" className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => revoke(key)} title="Revoke">
                            <XCircle className="size-4" />
                          </Button>
                        )}
                        {key.canManage && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon-sm" className="cursor-pointer text-muted-foreground hover:text-destructive" title="Delete">
                                <Trash2 className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this key?</AlertDialogTitle>
                                <AlertDialogDescription>Permanent — key and history removed.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                                <AlertDialogAction className="cursor-pointer bg-destructive text-white hover:bg-destructive/90" onClick={() => remove(key)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {scope === "admin" && balance === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Coins className="size-3.5" /> Out of balance? Ask the owner to top you up.
          </p>
        )}
      </div>

      {/* Edit device limit dialog */}
      <Dialog open={editKey !== null} onOpenChange={(open) => !open && setEditKey(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Device limit</DialogTitle>
            <DialogDescription className="break-all">
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{editKey?.key}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-max-devices">Max devices</Label>
            <Input id="edit-max-devices" type="number" min={0} value={editMaxDevices} onChange={(e) => setEditMaxDevices(e.target.value)} />
            <p className="text-xs text-muted-foreground">0 = unlimited, 1 = single device, N = mass key.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="cursor-pointer" onClick={() => setEditKey(null)}>Cancel</Button>
            <Button className="cursor-pointer" disabled={editBusy} onClick={saveDevices}>
              {editBusy && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Per-key connect history */}
      <KeyHistoryDialog keyDoc={historyKey} open={historyKey !== null} onClose={() => setHistoryKey(null)} />
    </div>
  );
}
