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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/panel/CopyButton";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatRelative } from "@/lib/format";
import { motion } from "framer-motion";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Pencil, Plus, RotateCcw, Server as ServerIcon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type ServerRow = Doc<"servers"> & {
  creatorEmail: string;
  canManage: boolean;
};

// Public HTTP routes (like /connect) are served from the Convex site URL.
const CONVEX_BASE = (import.meta.env.VITE_CONVEX_URL as string)
  .replace(/\.convex\.cloud$/, ".convex.site")
  .replace(/\/$/, "");

/** Build the connect URL: use current domain (works via Vite proxy / Convex routing). */
function buildConnectBase(domain: string): string {
  if (domain.length > 0) {
    return domain.includes(".") ? `https://${domain}` : `https://${domain}.site`;
  }
  // Default: use the current website domain — works when Vite proxy or
  // Freebuff routing forwards API paths to the Convex backend.
  return CONVEX_BASE;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function NewServerDialog({ onCreated }: { onCreated?: () => void }) {
  const createServer = useMutation(api.nameserver.createServer);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [customSeal, setCustomSeal] = useState("");
  const [busy, setBusy] = useState(false);

  const handleName = (value: string) => {
    setName(value);
    if (!code || code === slugify(name)) setCode(slugify(value));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createServer({ name, code, description: description || undefined, customSeal: customSeal.trim() || undefined });
      toast.success(`Server "${name}" created`);
      setOpen(false);
      setName("");
      setCode("");
      setDescription("");
      setCustomSeal("");
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="cursor-pointer">
          <Plus className="size-4" />
          New server
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a server</DialogTitle>
          <DialogDescription>
            Clients connect to it at{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/connect</code>{" "}
            with a license key — the server is detected from the key
            automatically, no code needed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="server-name">Name</Label>
            <Input
              id="server-name"
              value={name}
              onChange={(e) => handleName(e.target.value)}
              placeholder="e.g. EU Main"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="server-code">Code</Label>
            <Input
              id="server-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="eu-main"
              required
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Unique slug used by clients — lowercase letters, numbers, dashes.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="server-desc">Description (optional)</Label>
            <Textarea
              id="server-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this server for?"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="server-seal">Custom Seal / MD5 (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="server-seal"
                value={customSeal}
                onChange={(e) => setCustomSeal(e.target.value)}
                placeholder="e.g. 8b3d18363278f9bbaf745f2749b32aca"
                className="font-mono text-xs"
              />
              <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap rounded-md border bg-muted px-3 text-xs">
                <input
                  type="file"
                  className="sr-only"
                  accept=".php,.txt,.js,.json,.py,.sh,.rb,.conf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    // Auto-detect MD5: match 32-char hex strings
                    const md5Match = text.match(/\b([a-f0-9]{32})\b/i);
                    if (md5Match) {
                      setCustomSeal(md5Match[1].toLowerCase());
                      toast.success(`MD5 detected: ${md5Match[1]}`);
                    } else {
                      // Try to find md5() call
                      const md5Call = text.match(/md5\s*\(\s*["']([^"']+)["']/i);
                      if (md5Call) {
                        setCustomSeal(md5Call[1]);
                        toast.success(`MD5 value detected: ${md5Call[1]}`);
                      } else {
                        toast.error("No MD5 hash found in file");
                      }
                    }
                  }}
                />
                📄 Auto-detect
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a PHP/JS file to auto-detect its MD5 seal. This seal is returned in connect responses.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Create server
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditServerDialog({ server }: { server: ServerRow }) {
  const updateServer = useMutation(api.nameserver.updateServer);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description ?? "");
  const [customSeal, setCustomSeal] = useState(server.customSeal ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateServer({
        id: server._id,
        name,
        description: description || undefined,
        customSeal: customSeal.trim() || undefined,
      });
      toast.success("Server updated");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon-sm" className="cursor-pointer" aria-label="Edit server">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit server</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Custom Seal / MD5 (optional)</Label>
            <div className="flex gap-2">
              <Input
                value={customSeal}
                onChange={(e) => setCustomSeal(e.target.value)}
                placeholder="e.g. 8b3d18363278f9bbaf745f2749b32aca"
                className="font-mono text-xs"
              />
              <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap rounded-md border bg-muted px-3 text-xs">
                <input
                  type="file"
                  className="sr-only"
                  accept=".php,.txt,.js,.json,.py,.sh,.rb,.conf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    const md5Match = text.match(/\b([a-f0-9]{32})\b/i);
                    if (md5Match) {
                      setCustomSeal(md5Match[1].toLowerCase());
                      toast.success(`MD5 detected: ${md5Match[1]}`);
                    } else {
                      const md5Call = text.match(/md5\s*\(\s*["']([^"']+)["']/i);
                      if (md5Call) {
                        setCustomSeal(md5Call[1]);
                        toast.success(`MD5 value detected: ${md5Call[1]}`);
                      } else {
                        toast.error("No MD5 hash found in file");
                      }
                    }
                  }}
                />
                📄 Auto-detect
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a PHP/JS file to auto-detect its MD5 seal.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Servers() {
  const servers = useQuery(api.nameserver.listServers);
  const settings = useQuery(api.nameserver.getSettings);
  const updateServer = useMutation(api.nameserver.updateServer);
  const deleteServer = useMutation(api.nameserver.deleteServer);
  const updateSettings = useMutation(api.nameserver.updateSettings);

  const [editingDomain, setEditingDomain] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);

  useEffect(() => {
    if (settings) setDomainInput(settings.serverDomain);
  }, [settings]);

  const domain = settings?.serverDomain ?? "";
  const connectBase = buildConnectBase(domain);
  const keyPrefix = settings?.keyPrefix ?? "NS";

  const saveDomain = async () => {
    if (!settings) return;
    setDomainBusy(true);
    try {
      await updateSettings({
        keyPrice: settings.keyPrice,
        defaultKeyUses: settings.defaultKeyUses,
        defaultKeyHours: settings.defaultKeyHours,
        maintenance: settings.maintenance,
        downMessage: settings.downMessage || undefined,
        keyPrefix: settings.keyPrefix || undefined,
        keyFormat: settings.keyFormat || undefined,
        serverDomain: domainInput || undefined,
        endpointAuthToken: settings.endpointAuthToken || undefined,
        webhookUrl: settings.webhookUrl || undefined,
      });
      setEditingDomain(false);
      toast.success("Server URL updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setDomainBusy(false);
    }
  };

  const toggle = async (server: ServerRow) => {
    try {
      const next = server.status === "active" ? "off" : "active";
      await updateServer({ id: server._id, status: next });
      toast.success(`Server "${server.name}" ${next === "active" ? "turned on" : "turned off"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle server");
    }
  };

  const remove = async (server: ServerRow) => {
    try {
      await deleteServer({ id: server._id });
      toast.success(`Server "${server.name}" deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete server");
    }
  };

  if (servers === undefined || settings === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Servers"
        description="The nameservers your clients connect to. Create one, generate keys for it, share the connect URL."
        actions={<NewServerDialog />}
      />

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="border-border/70">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">How clients connect</CardTitle>
              <CardDescription>
                Your app / script / loader asks the user for their license key and
                calls /connect with it — the server is detected automatically:
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {domain.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer text-muted-foreground"
                  onClick={() => {
                    setDomainInput("");
                    saveDomain();
                  }}
                  title="Reset to default Convex URL"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => {
                  setEditingDomain(!editingDomain);
                  setDomainInput(domain);
                }}
              >
                <Pencil className="size-3.5" />
                Edit URL
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editingDomain && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-muted/20 p-3">
              <div className="flex items-center gap-0 flex-1">
                <span className="rounded-l-md border border-r-0 border-border bg-muted px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  https://
                </span>
                <Input
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ""))}
                  placeholder="panxcz.convex.site or custom.com"
                  maxLength={63}
                  className="rounded-l-none font-mono text-sm"
                />
                <span className="rounded-r-md border border-l-0 border-border bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                  /connect
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={saveDomain}
                disabled={domainBusy}
                className="cursor-pointer shrink-0"
              >
                {domainBusy ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-[12.5px]">
            <span className="truncate">
              {`curl -X POST ${connectBase}/connect -d '{"license":"LIC-XXXX-…","device":"device-abc"}'`}
            </span>
            <CopyButton
              value={`curl -X POST ${connectBase}/connect -d '{"license":"LIC-XXXX-XXXX-XXXX-XXXX-XXXX","device":"device-abc"}'`}
              label="cURL"
              size="icon"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            GET works too:{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              {connectBase}/connect?license=LIC-…&amp;device=device-abc
            </code>{" "}
            — the client only needs the license key the user typed in. Include{" "}
            <code className="rounded bg-muted px-1 py-0.5">device</code> to bind
            the license to that device — 1 key = 1 device. Keys are generated
            with the prefix you set in Settings (default {" "}
            <code className="rounded bg-muted px-1 py-0.5">{keyPrefix}</code>).
          </p>
          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Login format (PHP):</p>
            <pre className="overflow-x-auto font-mono text-[11px] text-muted-foreground/80">{`$resp = file_get_contents("${connectBase}/connect", false,
  stream_context_create(["http" => [
    "method" => "POST",
    "header" => "Content-Type: application/x-www-form-urlencoded",
    "content" => http_build_query([
      "game" => "MLBB",
      "user_key" => "YOUR_KEY",
      "serial" => "DEVICE_ID"
    ])
  ]])
);
$data = json_decode($resp, true);
echo $data["ok"] ? "OK!" : "Gagal: " . $data["reason"];`}</pre>
          </div>
        </CardContent>
      </Card>
      </motion.div>

      {servers.length === 0 ? (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ServerIcon className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No servers yet — create your first one to get a connect URL.
            </p>
            <NewServerDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {servers.map((server, i) => (
              <motion.li
                key={server._id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.25 }}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{server.name}</p>
                    <Badge
                      variant={server.status === "active" ? "default" : "secondary"}
                      className={server.status === "active" ? "bg-emerald-600/90 hover:bg-emerald-600/90 text-white" : ""}
                    >
                      {server.status === "active" ? "active" : "off"}
                    </Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    {server.code}
                    <CopyButton value={server.code} label="Code" variant="ghost" size="icon" />
                  </p>
                  {server.description && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{server.description}</p>
                  )}
                  {server.customSeal && (
                    <p className="mt-1 flex items-center gap-1 font-mono text-xs text-violet-400">
                      Seal: {server.customSeal.slice(0, 12)}…
                      <CopyButton value={server.customSeal} label="Seal" variant="ghost" size="icon" />
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    by {server.creatorEmail} · created {formatRelative(server._creationTime)}
                  </p>
                </div>
                {server.canManage && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      onClick={() => toggle(server)}
                    >
                      {server.status === "active" ? "Turn off" : "Turn on"}
                    </Button>
                    <EditServerDialog server={server} />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="icon-sm" className="cursor-pointer text-destructive" aria-label="Delete server">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{server.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes the server, all of its keys and
                            connection logs. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => remove(server)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
