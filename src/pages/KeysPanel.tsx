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
import { CopyButton } from "@/components/panel/CopyButton";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatExpiry, formatRelative, formatUses } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Coins,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";

type KeyRow = Doc<"connectKeys"> & {
  serverName: string;
  serverCode: string;
  creatorEmail: string;
  canManage: boolean;
};

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
  const generateKey = useMutation(api.nameserver.generateKey);

  const [serverId, setServerId] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [note, setNote] = useState("");
  const [uses, setUses] = useState("");
  const [hours, setHours] = useState("");
  const [maxDevices, setMaxDevices] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    key: string;
    cost: number;
    balance: number;
  } | null>(null);

  const cost = settings?.keyPrice ?? 0;
  const balance = stats?.balance ?? 0;
  const unlimited = scope === "owner" && stats?.unlimited === true;
  const activeServers = servers.filter((s) => s.status === "active");
  // Format new keys will be generated in (custom template or classic prefix).
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
      const res = await generateKey({
        serverId: serverId as Doc<"servers">["_id"],
        note: note || undefined,
        uses: uses === "" ? undefined : Number(uses),
        hours: hours === "" ? undefined : Number(hours),
        maxDevices: maxDevices === "" ? undefined : Number(maxDevices),
        customKey: customKey.trim() || undefined,
      });
      setResult(res);
      setCustomKey("");
      setNote("");
      setUses("");
      setHours("");
      setMaxDevices("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Generate a key</CardTitle>
          <CardDescription>
            {unlimited ? (
              <>
                Each key costs{" "}
                <span className="font-semibold text-foreground">{cost}</span> balance
                — your wallet is unlimited, so nothing is deducted. The client
                asks the user to enter this license key at{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">/connect</code>,
                and it binds to the devices that connect (max devices:{" "}
                <span className="font-semibold text-foreground">1</span> by default,
                0 = unlimited).
              </>
            ) : (
              <>
                Each key costs{" "}
                <span className="font-semibold text-foreground">{cost}</span> balance,
                deducted from your wallet ({balance} left). The client asks the
                user to enter this license key at{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">/connect</code>,
                and it binds to the devices that connect (max devices:{" "}
                <span className="font-semibold text-foreground">1</span> by default,
                0 = unlimited).
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="size-3.5" />
            {customKey.trim().length > 0 ? (
              <>
                Manual key{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  {customKey}
                </code>{" "}
                — the configured format is ignored for this key.
              </>
            ) : (
              <>
                New keys use format{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  {keyFormat}
                </code>
                <span className="text-muted-foreground/80">
                  — {scope === "owner" ? "change it in Settings" : "set by the owner in Settings"}
                </span>
              </>
            )}
          </p>
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Server</Label>
              <Select value={serverId} onValueChange={setServerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a server" />
                </SelectTrigger>
                <SelectContent>
                  {activeServers.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name} · {s.code}
                    </SelectItem>
                  ))}
                  {activeServers.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      No active servers — create one first.
                    </p>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="key-custom">
                Custom key (optional)
                <span className="ml-1 font-normal text-muted-foreground">
                  — leave empty to auto-generate
                </span>
              </Label>
              <Input
                id="key-custom"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value.toUpperCase())}
                placeholder="e.g. ML_227182973"
                maxLength={80}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Uppercased automatically and must be unique — type anything
                (letters, digits, dashes, underscores).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-note">Note (optional)</Label>
              <Input
                id="key-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. client #7"
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-uses">
                Max uses{" "}
                <span className="font-normal text-muted-foreground">
                  (default {settings?.defaultKeyUses ?? 0}, 0 = unlimited)
                </span>
              </Label>
              <Input
                id="key-uses"
                type="number"
                min={0}
                value={uses}
                onChange={(e) => setUses(e.target.value)}
                placeholder={String(settings?.defaultKeyUses ?? 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-hours">
                Lifetime (hours){" "}
                <span className="font-normal text-muted-foreground">
                  (default {settings?.defaultKeyHours ?? 0}, 0 = never)
                </span>
              </Label>
              <Input
                id="key-hours"
                type="number"
                min={0}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder={String(settings?.defaultKeyHours ?? 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-max-devices">
                Max devices{" "}
                <span className="font-normal text-muted-foreground">
                  (1 = 1 key 1 device, 0 = unlimited, N = mass key)
                </span>
              </Label>
              <Input
                id="key-max-devices"
                type="number"
                min={0}
                value={maxDevices}
                onChange={(e) => setMaxDevices(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={busy || activeServers.length === 0 || (!unlimited && balance < cost)}
                className="w-full cursor-pointer sm:w-auto"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {unlimited ? "Generate key" : `Generate key — ${cost} balance`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={result !== null} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Key generated</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-amber-500" />
              Shown once — copy it now. Cost: {result?.cost} balance
              {scope === "owner"
                ? " (no deduction — owner wallet is unlimited)."
                : "."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
            <code className="min-w-0 flex-1 truncate font-mono text-sm">
              {result?.key}
            </code>
            <CopyButton value={result?.key ?? ""} label="Key" />
          </div>
          <p className="text-xs text-muted-foreground">
            Remaining balance:{" "}
            <span className="font-semibold text-foreground">
              {unlimited ? "∞ (unlimited)" : result?.balance}
            </span>
          </p>
        </DialogContent>
      </Dialog>
      </motion.div>
    </>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export default function KeysPanel({ scope }: { scope: "owner" | "admin" }) {
  const keys = useQuery(api.nameserver.listKeys);
  const stats = useQuery(api.nameserver.overviewStats);
  const revokeKey = useMutation(api.nameserver.revokeKey);
  const deleteKey = useMutation(api.nameserver.deleteKey);
  const resetKeyDevice = useMutation(api.nameserver.resetKeyDevice);
  const updateKeyDevices = useMutation(api.nameserver.updateKeyDevices);
  const balance = stats?.balance ?? 0;
  const [editKey, setEditKey] = useState<KeyRow | null>(null);
  const [editMaxDevices, setEditMaxDevices] = useState("1");
  const [editBusy, setEditBusy] = useState(false);

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
      toast.success(
        value === 0
          ? "Device limit set to unlimited"
          : `Device limit set to ${value}`,
      );
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
      toast.success("Key revoked — it can no longer connect");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke key");
    }
  };

  const remove = async (key: KeyRow) => {
    try {
      await deleteKey({ id: key._id });
      toast.success("Key deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete key");
    }
  };

  const reset = async (key: KeyRow) => {
    try {
      const res = await resetKeyDevice({ id: key._id });
      toast.success(
        res.hadDevice
          ? "Device unbound — the key will bind to the next device that connects"
          : "Key was not bound to a device",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset device");
    }
  };

  if (keys === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (      <div className="space-y-8">
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
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-base font-semibold tracking-tight"
        >
          {scope === "owner" ? "All keys" : "My keys"}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {keys.length} total
          </span>
        </motion.h2>

        {keys.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="border-dashed border-border bg-card/50">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <KeyRound className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No keys yet — generate one above to get a connect key.
                </p>
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
                  <th className="px-4 py-3 font-medium">Uses</th>
                  <th className="px-4 py-3 font-medium">Device</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  {scope === "owner" && (
                    <th className="px-4 py-3 font-medium">Created by</th>
                  )}
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((key) => (
                  <tr key={key._id} className="hover:bg-muted/30">
                    <td className="max-w-[180px] px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <code className="truncate font-mono text-xs">{key.key}</code>
                        <CopyButton value={key.key} label="Key" variant="ghost" size="icon" />
                      </div>
                      {key.note && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {key.note}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="font-medium">{key.serverName}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {key.serverCode}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <KeyStatusBadge status={key.status} />
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {formatUses(key.uses, key.maxUses)}
                    </td>
                    <td className="max-w-[160px] px-4 py-3">
                      {key.deviceId ? (
                        <>
                          <code className="truncate font-mono text-[11px]">
                            {key.deviceId}
                          </code>
                          {(key.devices?.length ?? 1) > 1 && (
                            <span className="ml-1 text-[11px] text-muted-foreground">
                              +{key.devices!.length - 1}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          unbound — binds on first connect
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{formatExpiry(key.expiresAt)}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">{key.cost}</td>
                    {scope === "owner" && (
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {key.creatorEmail}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatRelative(key._creationTime)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {key.canManage && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="cursor-pointer text-muted-foreground hover:text-foreground"
                            aria-label="Edit max devices"
                            title="Device limit (0 = unlimited)"
                            onClick={() => openEditDevices(key)}
                          >
                            <Settings2 className="size-4" />
                          </Button>
                        )}
                        {key.canManage && key.deviceId && key.status !== "revoked" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="cursor-pointer text-muted-foreground hover:text-foreground"
                                aria-label="Reset device binding"
                                title="Reset device binding"
                              >
                                <RefreshCw className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reset device binding?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This key is bound to device{" "}
                                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                                    {key.deviceId}
                                  </code>
                                  . Unbinding lets it connect from a new device
                                  — the next successful connect binds it again
                                  (up to its max devices). The usage counter is
                                  not affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="cursor-pointer">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  className="cursor-pointer"
                                  onClick={() => reset(key)}
                                >
                                  Reset device
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {key.canManage && key.status !== "revoked" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="cursor-pointer text-muted-foreground hover:text-foreground"
                            onClick={() => revoke(key)}
                            aria-label="Revoke key"
                          >
                            <XCircle className="size-4" />
                          </Button>
                        )}
                        {key.canManage && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="cursor-pointer text-muted-foreground hover:text-destructive"
                                aria-label="Delete key"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this key?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  The key and its connection history will be removed
                                  permanently. It can no longer connect.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
                                  onClick={() => remove(key)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {scope === "admin" && balance === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Coins className="size-3.5" />
            Out of balance? Ask the owner to top you up in the Members page.
          </p>
        )}
      </div>

      <Dialog open={editKey !== null} onOpenChange={(open) => !open && setEditKey(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Device limit</DialogTitle>
            <DialogDescription className="break-all">
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {editKey?.key}
              </code>{" "}
              — set how many devices may bind to this key.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-max-devices">Max devices</Label>
            <Input
              id="edit-max-devices"
              type="number"
              min={0}
              value={editMaxDevices}
              onChange={(e) => setEditMaxDevices(e.target.value)}
              placeholder="0 = unlimited"
            />
            <p className="text-xs text-muted-foreground">
              0 = unlimited (any device), 1 = 1 key 1 device, N = mass key.
              Applies immediately — keys already bound keep their devices.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => setEditKey(null)}
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              disabled={editBusy}
              onClick={saveDevices}
            >
              {editBusy && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
