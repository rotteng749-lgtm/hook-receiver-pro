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
import { useMutation, useQuery } from "convex/react";
import { Loader2, Pencil, Plus, Server as ServerIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ServerRow = Doc<"servers"> & {
  creatorEmail: string;
  canManage: boolean;
};

// Public HTTP routes (like /connect) are served from the Convex site URL.
const CONNECT_BASE = (import.meta.env.VITE_CONVEX_URL as string)
  .replace(/\.convex\.cloud$/, ".convex.site")
  .replace(/\/$/, "");

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
  const [busy, setBusy] = useState(false);

  const handleName = (value: string) => {
    setName(value);
    if (!code || code === slugify(name)) setCode(slugify(value));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createServer({ name, code, description: description || undefined });
      toast.success(`Server "${name}" created`);
      setOpen(false);
      setName("");
      setCode("");
      setDescription("");
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
            Clients will connect to it with a key at{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/connect</code>{" "}
            using this server's code.
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
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateServer({
        id: server._id,
        name,
        description: description || undefined,
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
  const updateServer = useMutation(api.nameserver.updateServer);
  const deleteServer = useMutation(api.nameserver.deleteServer);

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

  if (servers === undefined) {
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

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">How clients connect</CardTitle>
          <CardDescription>
            Give your app / script / loader the connect URL and a generated key:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 font-mono text-[12.5px]">
            <span className="truncate">
              {`curl -X POST ${CONNECT_BASE}/connect -d '{"key":"NS-XXXX-…","server":"<code>","device":"device-abc"}'`}
            </span>
            <CopyButton
              value={`curl -X POST ${CONNECT_BASE}/connect -d '{"key":"NS-XXXX-XXXX-XXXX-XXXX-XXXX","server":"<code>","device":"device-abc"}'`}
              label="cURL"
              size="icon"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            GET works too:{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              {CONNECT_BASE}/connect?key=NS-…&amp;server=&lt;code&gt;&amp;device=device-abc
            </code>{" "}
            — replace <code className="rounded bg-muted px-1 py-0.5">&lt;code&gt;</code> with the
            server code below. Include <code className="rounded bg-muted px-1 py-0.5">device</code>{" "}
            to bind the key to that device — 1 key = 1 device.
          </p>
        </CardContent>
      </Card>

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
            {servers.map((server) => (
              <li key={server._id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
