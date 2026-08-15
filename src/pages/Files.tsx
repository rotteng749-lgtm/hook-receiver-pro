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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CopyButton } from "@/components/panel/CopyButton";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  contentTypeFor,
  formatBytes,
  formatDate,
  formatRelative,
  getFileUrl,
} from "@/lib/download";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Check,
  Download,
  FileArchive,
  Fingerprint,
  Link2,
  Loader2,
  QrCode,
  Trash2,
  UploadCloud,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

type UploadState = "idle" | "uploading" | "registering" | "hashing";

function QRCodeImage({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: 240, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (dataUrl === null) {
    return <div className="size-56 animate-pulse rounded-lg border border-border bg-muted" />;
  }
  return (
    <img
      src={dataUrl}
      alt="QR code for download link"
      className="size-56 rounded-lg border border-border bg-white p-2"
    />
  );
}

export default function Files() {
  const navigateToUpload = useSearchParams()[0].get("upload") === "1";
  const uploadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const files = useQuery(api.files.list) ?? [];
  const settings = useQuery(api.files.getSettings);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const registerFile = useMutation(api.files.registerFile);
  const computeSha256 = useAction(api.checksum.computeSha256);
  const removeFile = useMutation(api.files.remove);

  const [selected, setSelected] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<UploadState>("idle");
  const [dragging, setDragging] = useState(false);

  const [qrFile, setQrFile] = useState<Doc<"files"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"files"> | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // "?upload=1" (sidebar "New file" button) scrolls to the upload card.
  useEffect(() => {
    if (navigateToUpload && uploadRef.current) {
      uploadRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState({}, "", "/dashboard/files");
    }
  }, [navigateToUpload]);

  const pickFile = (file: File | null) => {
    if (!file) return;
    if (settings && file.size > settings.maxUploadBytes) {
      toast.error(
        `File is ${formatBytes(file.size)} — the limit is ${formatBytes(settings.maxUploadBytes)}`,
      );
      return;
    }
    setSelected(file);
    setName(file.name);
  };

  const handleUpload = async () => {
    if (!selected) return;
    const fileName = name.trim() || selected.name;
    const contentType = contentTypeFor(fileName);
    setState("uploading");
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: selected,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = await res.json();

      setState("registering");
      const fileId = await registerFile({
        storageId,
        name: fileName,
        version: version.trim() || undefined,
        note: note.trim() || undefined,
        size: selected.size,
        contentType,
      });

      setState("hashing");
      // Checksum is computed server-side; the row appears immediately and
      // fills in when hashing finishes.
      computeSha256({ fileId })
        .then(() => {
          if (state === "hashing") setState("idle");
        })
        .catch((err) => {
          console.error("checksum failed:", err);
          setState("idle");
        });

      setSelected(null);
      setName("");
      setVersion("");
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success(`${fileName} uploaded`);
    } catch (err) {
      console.error("upload error:", err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setState("idle");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await removeFile({ id: deleting._id });
      toast.success(`${deleting.name} deleted`);
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete file");
    } finally {
      setDeleteBusy(false);
    }
  };

  const busy = state !== "idle";
  const shaPending = (f: Doc<"files">) => f.sha256.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Files"
        description="Upload builds and artifacts, then share a public download link."
        actions={
          <Button
            className="cursor-pointer"
            onClick={() => uploadRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            <UploadCloud className="size-4" />
            New file
          </Button>
        }
      />

      {/* Upload card */}
      <Card ref={uploadRef} className="scroll-mt-20 border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Upload a file</CardTitle>
          <CardDescription>
            Any file type is accepted (.apk, .sh, .dll, .so, .zip, …). SHA-256 is
            computed server-side after upload.
            {settings && (
              <span className="ml-1">Limit: {formatBytes(settings.maxUploadBytes)}.</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragging ? "border-primary bg-accent/40" : "border-border hover:border-primary/40 hover:bg-muted/40"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files[0] ?? null);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <UploadCloud className="size-5" />}
            </div>
            <p className="text-sm font-medium">
              {selected ? selected.name : "Drag & drop a file, or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground">
              {selected ? formatBytes(selected.size) : "no file selected"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="file-name">Name</Label>
              <Input
                id="file-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-app-v1.apk"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file-version">Version (optional)</Label>
              <Input
                id="file-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.3"
                disabled={busy}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="file-note">Note (optional)</Label>
            <Textarea
              id="file-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What changed in this build?"
              rows={2}
              disabled={busy}
            />
          </div>
          <div className="flex justify-end">
            <Button
              className="cursor-pointer"
              onClick={handleUpload}
              disabled={!selected || busy}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {state === "uploading" && "Uploading…"}
                  {state === "registering" && "Registering…"}
                  {state === "hashing" && "Hashing…"}
                </>
              ) : (
                <>
                  <UploadCloud className="size-4" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* File list */}
      {files.length === 0 ? (
        <Empty className="rounded-xl border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileArchive />
            </EmptyMedia>
            <EmptyTitle>No files yet</EmptyTitle>
            <EmptyDescription>
              Upload your first file above — you'll get a public download link
              with a SHA-256 checksum.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-56">File</TableHead>
                <TableHead className="w-24">Size</TableHead>
                <TableHead className="min-w-44">SHA-256</TableHead>
                <TableHead className="w-24">Downloads</TableHead>
                <TableHead className="w-28">Added</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => {
                const url = getFileUrl(file._id);
                const pending = shaPending(file);
                return (
                  <TableRow key={file._id} className="group">
                    <TableCell>
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {file.name}
                        {file.version && (
                          <span className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                            v{file.version}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 max-w-72 truncate text-xs text-muted-foreground">
                        {file.note || `${file.contentType} · ${file.extension || "no extension"}`}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                    </TableCell>
                    <TableCell>
                      {pending ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          hashing…
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {file.sha256.slice(0, 12)}…{file.sha256.slice(-6)}
                          </code>
                          <CopyButton value={file.sha256} label="Checksum" variant="ghost" size="icon" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {file.downloadCount}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-xs text-muted-foreground"
                      title={formatDate(file._creationTime)}
                    >
                      {formatRelative(file._creationTime)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <CopyButton value={url} label="Link" variant="ghost" size="icon" />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="cursor-pointer text-muted-foreground"
                          aria-label="Show QR code"
                          onClick={() => setQrFile(file)}
                        >
                          <QrCode className="size-3.5" />
                        </Button>
                        <Button asChild variant="ghost" size="icon-sm" className="cursor-pointer text-muted-foreground">
                          <a href={url} aria-label={`Download ${file.name}`}>
                            <Download className="size-3.5" />
                          </a>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="cursor-pointer text-muted-foreground hover:text-destructive"
                              aria-label="Delete file"
                              onClick={() => setDeleting(file)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The public download link will stop working immediately and the
                                bytes are removed from storage. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="cursor-pointer"
                                onClick={handleDelete}
                                disabled={deleteBusy}
                              >
                                {deleteBusy && <Loader2 className="size-4 animate-spin" />}
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* QR dialog */}
      <Dialog open={qrFile !== null} onOpenChange={(open) => !open && setQrFile(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="size-4 text-primary" />
              {qrFile?.name}
            </DialogTitle>
            <DialogDescription>
              Scan to open the public download link.
            </DialogDescription>
          </DialogHeader>
          {qrFile && (
            <div className="flex flex-col items-center gap-4">
              <QRCodeImage value={getFileUrl(qrFile._id)} />
              <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <Link2 className="size-4 shrink-0 text-muted-foreground" />
                <code className="min-w-0 flex-1 truncate font-mono text-xs">
                  {getFileUrl(qrFile._id)}
                </code>
                <CopyButton value={getFileUrl(qrFile._id)} label="Link" />
              </div>
              <div className="w-full space-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Fingerprint className="size-3.5 shrink-0" />
                  SHA-256: {qrFile.sha256.slice(0, 16)}…
                </p>
                <p className="flex items-center gap-2">
                  <Check className="size-3.5 shrink-0" />
                  {formatBytes(qrFile.size)} · {qrFile.downloadCount} downloads
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
