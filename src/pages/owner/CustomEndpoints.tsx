import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/panel/CopyButton";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  FileCode2,
  FileText,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Shield,
  Sparkles,
  TestTube2,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PATCH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  ANY: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const CONTENT_TYPE_PRESETS = [
  { value: "application/json", label: "JSON" },
  { value: "text/plain", label: "Text" },
  { value: "text/html", label: "HTML" },
  { value: "text/css", label: "CSS" },
  { value: "application/javascript", label: "JavaScript" },
  { value: "text/php", label: "PHP" },
  { value: "application/xml", label: "XML" },
  { value: "text/xml", label: "XML (text)" },
  { value: "image/svg+xml", label: "SVG" },
  { value: "application/octet-stream", label: "Binary" },
];

/** Auto-detect Content-Type from file name + MIME type. */
function detectContentType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const EXT_MAP: Record<string, string> = {
    json: "application/json",
    js: "application/javascript",
    mjs: "application/javascript",
    css: "text/css",
    html: "text/html",
    htm: "text/html",
    php: "text/php",
    txt: "text/plain",
    text: "text/plain",
    xml: "application/xml",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    pdf: "application/pdf",
    zip: "application/zip",
    sh: "text/x-shellscript",
    py: "text/x-python",
    ts: "text/typescript",
    tsx: "text/typescript",
    jsx: "text/typescript",
    yml: "text/yaml",
    yaml: "text/yaml",
    md: "text/markdown",
    csv: "text/csv",
  };
  return EXT_MAP[ext] ?? "application/octet-stream";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ========================= Endpoint Form (Create + Edit) ========================= */

type MethodType = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ANY";

interface EndpointFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialPath?: string;
  initialMethod?: MethodType;
  initialStatusCode?: number;
  initialBody?: string;
  initialContentType?: string;
  initialResponseType?: "text" | "file";
  initialFileId?: string;
  initialAuthRequired?: boolean;
  endpointId?: Id<"customEndpoints">;
}

function EndpointForm({
  open,
  onOpenChange,
  mode,
  initialPath = "",
  initialMethod = "POST",
  initialStatusCode = 200,
  initialBody = '{"ok":true}',
  initialContentType = "application/json",
  initialResponseType = "text",
  initialFileId,
  initialAuthRequired = false,
  endpointId,
}: EndpointFormProps) {
  const createEndpoint = useMutation(api.nameserver.createCustomEndpoint);
  const updateEndpoint = useMutation(api.nameserver.updateCustomEndpoint);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const registerFile = useMutation(api.files.registerFile);

  const [path, setPath] = useState(initialPath);
  const [method, setMethod] = useState<MethodType>(initialMethod);
  const [statusCode, setStatusCode] = useState(String(initialStatusCode));
  const [body, setBody] = useState(initialBody);
  const [contentType, setContentType] = useState(initialContentType);
  const [authRequired, setAuthRequired] = useState(initialAuthRequired);
  const [responseType, setResponseType] = useState<"text" | "file">(initialResponseType);
  const [file, setFile] = useState<File | null>(null);
  const [detectedContentType, setDetectedContentType] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPath("");
    setMethod("POST");
    setStatusCode("200");
    setBody('{"ok":true}');
    setContentType("application/json");
    setAuthRequired(false);
    setResponseType("text");
    setFile(null);
    setDetectedContentType("");
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) {
      const ct = detectContentType(f);
      setDetectedContentType(ct);
      setContentType(ct);
    } else {
      setDetectedContentType("");
    }
  }, []);

  const handleSubmit = async () => {
    if (!path.trim()) {
      toast.error("Path is required");
      return;
    }
    if (responseType === "file" && !file && mode === "create") {
      toast.error("Pick a file to upload");
      return;
    }
    setBusy(true);
    try {
      let fileId: Id<"files"> | undefined;
      if (responseType === "file" && file) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!res.ok) throw new Error("File upload failed");
        const { storageId } = (await res.json()) as { storageId: string };
        fileId = await registerFile({
          storageId: storageId as Id<"_storage">,
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        });
      }

      if (mode === "create") {
        await createEndpoint({
          path,
          method,
          statusCode: Number(statusCode) || 200,
          body: responseType === "text" ? body : "",
          contentType: responseType === "file" ? (file?.type || detectedContentType || undefined) : (contentType || undefined),
          responseType,
          fileId,
          enabled: true,
          authRequired,
        });
        toast.success(`Endpoint /hook/${path} created`);
      } else {
        await updateEndpoint({
          id: endpointId!,
          method,
          statusCode: Number(statusCode) || 200,
          body: responseType === "text" ? body : "",
          contentType: contentType || undefined,
          responseType,
          fileId: fileId || (initialFileId as Id<"files"> | undefined),
          authRequired,
        });
        toast.success("Endpoint updated");
      }
      onOpenChange(false);
      if (mode === "create") reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v && mode === "create") reset();
      }}
    >
      {mode === "create" && (
        <DialogTrigger asChild>
          <Button className="cursor-pointer gap-1.5">
            <Plus className="size-4" />
            New endpoint
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create custom endpoint" : "Edit endpoint"}</DialogTitle>
          <DialogDescription>
            Serve text responses or uploaded files (PHP, CSS, JS, HTML, etc.) at{" "}
            <code className="font-mono text-violet-400">/hook/&lt;path&gt;</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Path</Label>
              <div className="flex items-center gap-0">
                <span className="rounded-l-md border border-r-0 border-border bg-muted/80 px-2 py-1.5 text-xs text-muted-foreground">
                  /hook/
                </span>
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  placeholder="my-endpoint"
                  maxLength={64}
                  disabled={mode === "edit"}
                  className="rounded-l-none font-mono text-sm disabled:opacity-60"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Method</Label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as MethodType)}
                className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm"
              >
                <option value="ANY">ANY</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Status</Label>
              <Input
                value={statusCode}
                onChange={(e) => setStatusCode(e.target.value)}
                type="number"
                min={100}
                max={599}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Response type</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResponseType("text")}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  responseType === "text"
                    ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <FileText className="size-4" />
                Text / JSON
              </button>
              <button
                type="button"
                onClick={() => setResponseType("file")}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                  responseType === "file"
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <FileCode2 className="size-4" />
                File upload
              </button>
            </div>
          </div>

          {responseType === "text" ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Content-Type</Label>
                <div className="flex flex-wrap gap-1.5">
                  {CONTENT_TYPE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setContentType(preset.value)}
                      className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                        contentType === preset.value
                          ? "border-violet-500/40 bg-violet-500/10 text-violet-400"
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <Input
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  placeholder="application/json"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Response body</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  className="font-mono text-xs"
                  placeholder='{"ok":true, "status":"success"}'
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Upload file</Label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5 px-4 py-4 text-sm text-muted-foreground transition-colors hover:bg-blue-500/10">
                <Upload className="size-5 text-blue-400" />
                {file ? (
                  <span className="flex-1">
                    <span className="font-medium text-foreground">{file.name}</span>
                    <span className="ml-2 text-muted-foreground">({formatBytes(file.size)})</span>
                  </span>
                ) : initialFileId && mode === "edit" ? (
                  <span className="flex-1 text-muted-foreground">
                    Current file linked · <span className="text-foreground font-medium">Select new file to replace</span>
                  </span>
                ) : (
                  <span>Upload .php, .css, .js, .html, .txt, .xml, .svg, .json, or any file…</span>
                )}
                <input type="file" className="hidden" onChange={handleFileChange} />
              </label>
              {detectedContentType && (
                <div className="flex items-center gap-2 rounded-md bg-blue-500/5 border border-blue-500/20 px-3 py-1.5">
                  <Sparkles className="size-3 text-blue-400" />
                  <span className="text-[11px] text-blue-400">
                    Auto-detected: <code className="font-mono font-medium">{detectedContentType}</code>
                  </span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Content-Type auto-detected from file extension and MIME type.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={authRequired}
              onChange={(e) => setAuthRequired(e.target.checked)}
              className="rounded border-border"
            />
            <Shield className="size-3.5 text-amber-400" />
            Require auth token
          </label>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={busy || !path.trim() || (mode === "create" && responseType === "file" && !file)}
            className="cursor-pointer bg-violet-600 hover:bg-violet-700 text-white"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {mode === "create" ? "Create endpoint" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================= Endpoint Row ========================= */

function EndpointRow({ ep }: { ep: Doc<"customEndpoints"> }) {
  const toggleEndpoint = useMutation(api.nameserver.updateCustomEndpoint);
  const deleteEndpoint = useMutation(api.nameserver.deleteCustomEndpoint);
  const duplicateEndpoint = useMutation(api.nameserver.duplicateCustomEndpoint);
  const [editOpen, setEditOpen] = useState(false);

  const CONVEX_BASE = (import.meta.env.VITE_CONVEX_URL as string)
    .replace(/\.convex\.cloud$/, ".convex.site")
    .replace(/\/$/, "");
  const url = `${CONVEX_BASE}/hook/${ep.path}`;

  const handleToggle = async () => {
    try {
      await toggleEndpoint({ id: ep._id, enabled: !ep.enabled });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteEndpoint({ id: ep._id });
      toast.success(`Deleted /${ep.path}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDuplicate = async () => {
    try {
      const res = await duplicateEndpoint({ id: ep._id });
      toast.success(`Duplicated as /hook/${res.path}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Duplicate failed");
    }
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95, x: -20 }}
        transition={{ duration: 0.2 }}
        className="group flex flex-col gap-2 rounded-lg border border-border/60 bg-card/50 p-4 transition-all hover:border-violet-500/30 hover:bg-card sm:flex-row sm:items-center"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-sm font-medium">/hook/{ep.path}</code>
            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${METHOD_COLORS[ep.method] ?? METHOD_COLORS.ANY}`}>
              {ep.method}
            </span>
            <span className="rounded bg-muted/80 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {ep.statusCode}
            </span>
            {ep.responseType === "file" ? (
              <span className="flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                <FileCode2 className="size-2.5" /> File
              </span>
            ) : (
              <span className="flex items-center gap-0.5 rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400">
                <FileText className="size-2.5" /> Text
              </span>
            )}
            {ep.authRequired && (
              <span className="flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                <Shield className="size-2.5" /> Auth
              </span>
            )}
          </div>
          {ep.responseType === "text" && ep.contentType && (
            <p className="mt-0.5 text-[10px] text-muted-foreground/50 font-mono">{ep.contentType}</p>
          )}
          {ep.responseType === "text" && ep.body && (
            <p className="mt-1 max-w-md truncate text-[10px] text-muted-foreground/40 font-mono">
              {ep.body.slice(0, 120)}{ep.body.length > 120 ? "…" : ""}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
              {url}
            </code>
            <CopyButton value={url} label="URL" size="icon" variant="ghost" />
          </div>
        </div>
        <div className="flex items-center gap-1 sm:ml-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            title="Duplicate"
            onClick={handleDuplicate}
          >
            <FileText className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setEditOpen(true)}
            title="Edit"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Switch
            checked={ep.enabled}
            onCheckedChange={handleToggle}
            aria-label={`Toggle ${ep.path}`}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete /hook/{ep.path}?</AlertDialogTitle>
                <AlertDialogDescription>This endpoint will stop working immediately.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                <AlertDialogAction className="cursor-pointer bg-destructive text-white hover:bg-destructive/90" onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </motion.div>

      <EndpointForm
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        initialPath={ep.path}
        initialMethod={ep.method as MethodType}
        initialStatusCode={ep.statusCode}
        initialBody={ep.body}
        initialContentType={ep.contentType ?? "application/json"}
        initialResponseType={(ep.responseType as "text" | "file") ?? "text"}
        initialFileId={ep.fileId}
        initialAuthRequired={ep.authRequired ?? false}
        endpointId={ep._id}
      />
    </>
  );
}

/* ========================= Main Page ========================= */

export default function CustomEndpointsPage() {
  const endpoints = useQuery(api.nameserver.listCustomEndpoints);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <PageHeader
          title="Custom Endpoints"
          description="Create your own HTTP endpoints that return text or serve uploaded files (PHP, CSS, JS, HTML, etc.)."
          actions={
            <Button className="cursor-pointer gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New endpoint
            </Button>
          }
        />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}>
        <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-background to-fuchsia-500/5">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/15">
                <Globe className="size-4 text-violet-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">How it works</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Each endpoint lives at <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/hook/&lt;path&gt;</code>.
                  Choose <strong>Text / JSON</strong> for static responses or{" "}
                  <strong>File upload</strong> to serve uploaded files with auto-detected Content-Type.
                  Hover an endpoint to <strong>duplicate</strong>, <strong>edit</strong>, or <strong>delete</strong> it.
                  Test with curl: <code className="font-mono text-[11px]">curl https://.../hook/&lt;path&gt;</code>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="space-y-3">
        {endpoints === undefined ? (
          <div className="flex min-h-[20vh] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : endpoints.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/10">
                <Zap className="size-6 text-violet-400/50" />
              </div>
              <p className="text-sm text-muted-foreground">No endpoints yet</p>
              <p className="text-xs text-muted-foreground/60">
                Create one to get started — each endpoint returns your configured response or serves your uploaded file.
              </p>
            </CardContent>
          </Card>
        ) : (
          <AnimatePresence mode="popLayout">
            {endpoints.map((ep) => (
              <EndpointRow key={ep._id} ep={ep} />
            ))}
          </AnimatePresence>
        )}
      </div>

      <EndpointForm open={createOpen} onOpenChange={setCreateOpen} mode="create" />
    </div>
  );
}
