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
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { formatRelative } from "@/lib/format";
import { useAction, useMutation, useQuery } from "convex/react";
import { Database, FileUp, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Public HTTP routes live on the Convex site URL (<deployment>.convex.site). */
const SITE_URL =
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.replace(
    /\.convex\.cloud$/,
    ".convex.site",
  ) ?? "https://<deployment>.convex.site";

const GAMES = [
  { key: "MLBB", label: "Mobile Legends (MLBB)" },
  { key: "FREEFIRE", label: "Free Fire" },
  { key: "PUBG", label: "PUBG" },
] as const;

function gameBadgeClass(game: string | undefined): string {
  switch (game) {
    case "MLBB":
      return "bg-sky-600/90 text-white hover:bg-sky-600/90";
    case "FREEFIRE":
      return "bg-orange-600/90 text-white hover:bg-orange-600/90";
    case "PUBG":
      return "bg-amber-600/90 text-white hover:bg-amber-600/90";
    default:
      return "bg-zinc-600/90 text-white hover:bg-zinc-600/90";
  }
}

function gameLabel(game: string | undefined): string {
  if (!game) return "generic";
  const found = GAMES.find((g) => g.key === game);
  return found ? found.label : game;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function UploadCard() {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const registerFile = useMutation(api.files.registerFile);
  const computeSha256 = useAction(api.checksum.computeSha256);

  const [game, setGame] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Pick a file to upload");
      return;
    }
    if (!game) {
      toast.error("Pick the game this loader belongs to");
      return;
    }
    setBusy(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!res.ok) throw new Error("Upload to storage failed");
      const { storageId } = (await res.json()) as { storageId: string };
      const fileId = await registerFile({
        storageId: storageId as Id<"_storage">,
        name: file.name,
        version: version.trim() || undefined,
        note: note.trim() || undefined,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        game,
      });
      // SHA-256 is computed server-side, best effort — never blocks the upload.
      computeSha256({ fileId }).catch(() => undefined);
      toast.success("Loader uploaded — the connect URL is ready");
      setFile(null);
      setVersion("");
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="text-base">Upload a loader / APK</CardTitle>
        <CardDescription>
          Upload the loader file per game. The newest file for each game is what{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">/connect</code>{" "}
          returns as <code className="rounded bg-muted px-1 py-0.5 text-xs">data.url</code>{" "}
          when a client connects with that <code className="rounded bg-muted px-1 py-0.5 text-xs">game</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={upload} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Game</Label>
            <Select value={game} onValueChange={setGame}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select game" />
              </SelectTrigger>
              <SelectContent>
                {GAMES.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="db-version">Version (optional)</Label>
            <Input
              id="db-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 2.4.1"
              maxLength={40}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="db-file">File</Label>
            <div className="flex items-center gap-3">
              <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70">
                <FileUp className="size-4" />
                {file ? (
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {file.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {formatBytes(file.size)}
                    </span>
                  </span>
                ) : (
                  <span>Pick an .apk / .sh / .dll / .zip / any file…</span>
                )}
                <input
                  id="db-file"
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <Button type="submit" disabled={busy} className="cursor-pointer">
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileUp className="size-4" />
                )}
                Upload
              </Button>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="db-note">Note (optional)</Label>
            <Input
              id="db-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. loader v2 for Android 14"
              maxLength={160}
            />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FileRow({ file }: { file: Doc<"files"> }) {
  const remove = useMutation(api.files.remove);
  const url = `${SITE_URL}/databases/${file._id}`;

  const del = async () => {
    try {
      await remove({ id: file._id });
      toast.success("Loader deleted — its download URL no longer works");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3">
        <Badge className={gameBadgeClass(file.game)}>{gameLabel(file.game)}</Badge>
      </td>
      <td className="max-w-[220px] px-4 py-3">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {file.version ? `v${file.version}` : "no version"}
          {file.note ? ` · ${file.note}` : ""}
        </p>
      </td>
      <td className="px-4 py-3 text-xs tabular-nums">{formatBytes(file.size)}</td>
      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
        {file.downloadCount}
      </td>
      <td className="max-w-[260px] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
            {url}
          </code>
          <CopyButton value={url} label="URL" size="icon" variant="ghost" />
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {formatRelative(file._creationTime)}
      </td>
      <td className="px-4 py-3 text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer text-muted-foreground hover:text-destructive"
              aria-label="Delete loader"
            >
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this loader?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-medium">{file.name}</span> and its download
                URL will be removed. Clients that connect after this will no
                longer receive this URL from /connect.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
                onClick={del}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}

export default function Databases() {
  const files = useQuery(api.files.list);

  if (files === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const loaders = files.filter((f) => f.game !== undefined);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Databases"
        description="Loader / APK files clients download after a successful connect. Each file gets a public URL at /databases/<id> — the /connect response for that game points to it. Files live in Convex object storage, so the URLs work from any host (Vercel included)."
      />

      <UploadCard />

      <div className="space-y-4">
        <h2 className="text-base font-semibold tracking-tight">
          Loaders
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {loaders.length} total
          </span>
        </h2>

        {loaders.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Database className="size-8 text-muted-foreground/50" />
              <p className="max-w-md text-sm text-muted-foreground">
                No loaders yet. Upload one per game (MLBB, Free Fire, PUBG) —
                the newest file for a game is what /connect returns as the APK
                response URL when a client connects with that game.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Game</th>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Downloads</th>
                  <th className="px-4 py-3 font-medium">APK response URL</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loaders.map((file) => (
                  <FileRow key={file._id} file={file} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Example connect response for{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">game=MLBB</code>:
          {" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {"{\"status\":true,\"message\":\"connected\",\"data\":{\"url\":\"https://…/databases/&lt;id&gt;\"}}"}
          </code>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">DIMZNEXTV2 — Free Fire</CardTitle>
            <CardDescription>
              License check endpoint that the DIMZNEXTV2.sh binary talks to.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <p className="mb-1 font-medium">Request</p>
              <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`POST ${SITE_URL}/mod/dimz.php
{"game":"freefire","licence":"NS-XXXX-…",
 "nonce":"f3e978cf","timestamp":"1786742177",
 "uuid":"<device-id>"}`}
              </pre>
            </div>
            <div>
              <p className="mb-1 font-medium">Response</p>
              <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`{"status":"SUCCESS","message":"ok",
 "signature":"00000000000000000000000000000000"}

maintenance → {"status":"maintenace","message":"…"}
failure     → {"status":"BANNED","message":"…"}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">ZALL RW — MLBB</CardTitle>
            <CardDescription>
              App version check the ZALL RW v4.7 APK polls on launch (no auth).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div>
              <p className="mb-1 font-medium">Request</p>
              <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`GET ${SITE_URL}/api/app/version
(optional ?game=MLBB | FREEFIRE | PUBG)`}
              </pre>
            </div>
            <div>
              <p className="mb-1 font-medium">Response</p>
              <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`{"forceUpdate":true,"latestVersion":"4.7",
 "minVersion":"4.7",
 "downloadUrl":"https://…/databases/<id>",
 "message":"Update Zall RW v4.7…"}`}
              </pre>
            </div>
            <p className="text-muted-foreground">
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">latestVersion</code>,
              {" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">downloadUrl</code> and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">message</code> come from
              the newest loader uploaded for that game. Upload one above to make
              the APK point at your server.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
