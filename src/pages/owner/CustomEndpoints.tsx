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
  Clock,
  FileCode2,
  FileText,
  Globe,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
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

/** Organized content-type presets grouped by category for multi-response support. */
const CONTENT_TYPE_PRESETS: { value: string; label: string; group: string }[] = [
  // Web
  { value: "application/json", label: "JSON", group: "Web" },
  { value: "text/html", label: "HTML", group: "Web" },
  { value: "text/css", label: "CSS", group: "Web" },
  { value: "application/javascript", label: "JavaScript", group: "Web" },
  { value: "text/javascript", label: "JS (text)", group: "Web" },
  { value: "text/php", label: "PHP", group: "Web" },
  { value: "text/xml", label: "XML", group: "Web" },
  { value: "application/xml", label: "XML (app)", group: "Web" },
  { value: "text/x-python", label: "Python", group: "Web" },
  { value: "text/x-ruby", label: "Ruby", group: "Web" },
  { value: "text/x-perl", label: "Perl", group: "Web" },
  { value: "text/x-csrc", label: "C Source", group: "Web" },
  { value: "text/x-c++src", label: "C++ Source", group: "Web" },
  { value: "text/x-java", label: "Java", group: "Web" },
  { value: "text/x-go", label: "Go", group: "Web" },
  { value: "text/x-rust", label: "Rust", group: "Web" },
  // Data
  { value: "text/plain", label: "Plain Text", group: "Data" },
  { value: "text/markdown", label: "Markdown", group: "Data" },
  { value: "text/csv", label: "CSV", group: "Data" },
  { value: "text/yaml", label: "YAML", group: "Data" },
  { value: "text/toml", label: "TOML", group: "Data" },
  { value: "application/toml", label: "TOML (app)", group: "Data" },
  { value: "text/x-ini", label: "INI Config", group: "Data" },
  { value: "application/x-ndjson", label: "NDJSON", group: "Data" },
  { value: "application/ld+json", label: "JSON-LD", group: "Data" },
  // Images
  { value: "image/png", label: "PNG", group: "Image" },
  { value: "image/jpeg", label: "JPEG", group: "Image" },
  { value: "image/gif", label: "GIF", group: "Image" },
  { value: "image/webp", label: "WebP", group: "Image" },
  { value: "image/svg+xml", label: "SVG", group: "Image" },
  { value: "image/avif", label: "AVIF", group: "Image" },
  { value: "image/bmp", label: "BMP", group: "Image" },
  { value: "image/x-icon", label: "ICO (icon)", group: "Image" },
  { value: "image/tiff", label: "TIFF", group: "Image" },
  { value: "image/vnd.microsoft.icon", label: "MS ICO", group: "Image" },
  // Fonts
  { value: "font/woff", label: "WOFF", group: "Font" },
  { value: "font/woff2", label: "WOFF2", group: "Font" },
  { value: "font/ttf", label: "TTF", group: "Font" },
  { value: "font/otf", label: "OTF", group: "Font" },
  { value: "application/font-woff", label: "WOFF (app)", group: "Font" },
  { value: "application/font-woff2", label: "WOFF2 (app)", group: "Font" },
  // Documents
  { value: "application/pdf", label: "PDF", group: "Doc" },
  { value: "application/msword", label: "Word (.doc)", group: "Doc" },
  { value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "DOCX", group: "Doc" },
  { value: "application/vnd.ms-excel", label: "Excel (.xls)", group: "Doc" },
  { value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "XLSX", group: "Doc" },
  // Archives
  { value: "application/zip", label: "ZIP", group: "Archive" },
  { value: "application/x-tar", label: "TAR", group: "Archive" },
  { value: "application/gzip", label: "GZIP", group: "Archive" },
  { value: "application/x-7z-compressed", label: "7-Zip", group: "Archive" },
  { value: "application/x-rar-compressed", label: "RAR", group: "Archive" },
  { value: "application/x-bzip2", label: "BZ2", group: "Archive" },
  { value: "application/java-archive", label: "JAR", group: "Archive" },
  // Audio / Video
  { value: "audio/mpeg", label: "MP3", group: "Media" },
  { value: "audio/wav", label: "WAV", group: "Media" },
  { value: "audio/ogg", label: "OGG Audio", group: "Media" },
  { value: "audio/flac", label: "FLAC", group: "Media" },
  { value: "audio/aac", label: "AAC", group: "Media" },
  { value: "video/mp4", label: "MP4", group: "Media" },
  { value: "video/webm", label: "WebM", group: "Media" },
  { value: "video/ogg", label: "OGG Video", group: "Media" },
  { value: "video/quicktime", label: "MOV", group: "Media" },
  { value: "video/x-msvideo", label: "AVI", group: "Media" },
  // Misc / Binary
  { value: "application/octet-stream", label: "Binary", group: "Binary" },
  { value: "application/wasm", label: "WebAssembly", group: "Binary" },
  { value: "application/typescript", label: "TypeScript", group: "Binary" },
  { value: "application/vnd.android.package-archive", label: "APK", group: "Binary" },
  { value: "application/x-executable", label: "Executable", group: "Binary" },
  { value: "application/x-sharedlib", label: "Shared Lib", group: "Binary" },
  { value: "application/x-dll", label: "DLL", group: "Binary" },
  { value: "application/x-shellscript", label: "Shell Script", group: "Binary" },
  { value: "text/x-shellscript", label: "Shell (.sh)", group: "Binary" },
];

/** Group labels in display order. */
const TYPE_GROUPS = ["Web", "Data", "Image", "Font", "Doc", "Archive", "Media", "Binary"];

/** Extension → human label for the auto-detect badge. */
const EXT_LABELS: Record<string, string> = {
  json: "JSON", js: "JavaScript", mjs: "ES Module", cjs: "CommonJS",
  css: "CSS", scss: "SCSS", less: "Less",
  html: "HTML", htm: "HTML",
  php: "PHP", phtml: "PHP",
  txt: "Plain Text", text: "Plain Text",
  xml: "XML", svg: "SVG",
  png: "PNG", jpg: "JPEG", jpeg: "JPEG", gif: "GIF", webp: "WebP", avif: "AVIF", bmp: "BMP", ico: "ICO", tiff: "TIFF",
  pdf: "PDF", doc: "Word", docx: "Word", xls: "Excel", xlsx: "Excel",
  zip: "ZIP", tar: "TAR", gz: "GZIP", "7z": "7-Zip", rar: "RAR", bz2: "BZ2", xz: "XZ",
  sh: "Shell Script", bash: "Bash", zsh: "Zsh",
  py: "Python", rb: "Ruby", pl: "Perl",
  ts: "TypeScript", tsx: "TSX", jsx: "JSX",
  yml: "YAML", yaml: "YAML", toml: "TOML", ini: "INI", cfg: "Config", conf: "Config",
  md: "Markdown", mdx: "MDX",
  csv: "CSV", tsv: "TSV",
  woff: "WOFF", woff2: "WOFF2", ttf: "TTF", otf: "OTF",
  mp3: "MP3", wav: "WAV", ogg: "OGG", flac: "FLAC", aac: "AAC",
  mp4: "MP4", webm: "WebM", mov: "MOV", avi: "AVI",
  java: "Java", kt: "Kotlin", go: "Go", rs: "Rust", c: "C", cpp: "C++", h: "C Header",
  wasm: "WebAssembly", so: "Shared Lib", dll: "DLL", exe: "Executable",
  apk: "APK", aab: "Android Bundle",
  jar: "JAR", war: "WAR", ear: "EAR",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL",
  env: "Env Config", gitignore: "Git Config",
};

/** Auto-detect Content-Type from file name + MIME type. */
function detectContentType(file: File): string {
  // Prefer browser-provided MIME type if it's reliable
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const EXT_MAP: Record<string, string> = {
    // Web
    json: "application/json", js: "application/javascript", mjs: "application/javascript", cjs: "application/javascript",
    css: "text/css", scss: "text/x-scss", less: "text/x-less",
    html: "text/html", htm: "text/html",
    php: "text/php", phtml: "text/php",
    svg: "image/svg+xml",
    // Data
    txt: "text/plain", text: "text/plain", md: "text/markdown", mdx: "text/markdown",
    csv: "text/csv", tsv: "text/tab-separated-values",
    xml: "application/xml", yml: "text/yaml", yaml: "text/yaml",
    toml: "text/toml", ini: "text/x-ini", cfg: "text/plain", conf: "text/plain",
    sql: "application/sql", graphql: "application/graphql", gql: "application/graphql",
    env: "text/plain",
    // Images
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon", tiff: "image/tiff",
    // Fonts
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    // Documents
    pdf: "application/pdf",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Archives
    zip: "application/zip", tar: "application/x-tar", gz: "application/gzip",
    "7z": "application/x-7z-compressed", rar: "application/x-rar-compressed", bz2: "application/x-bzip2", xz: "application/x-xz",
    jar: "application/java-archive", war: "application/java-archive", ear: "application/java-archive",
    // Audio / Video
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo",
    // Programming
    sh: "text/x-shellscript", bash: "text/x-shellscript", zsh: "text/x-shellscript",
    py: "text/x-python", rb: "text/x-ruby", pl: "text/x-perl",
    ts: "text/typescript", tsx: "text/typescript", jsx: "text/typescript",
    java: "text/x-java", kt: "text/x-kotlin", go: "text/x-go", rs: "text/x-rust",
    c: "text/x-csrc", cpp: "text/x-c++src", h: "text/x-csrc",
    // Misc
    wasm: "application/wasm",
    so: "application/x-sharedlib", dll: "application/x-dll", exe: "application/x-executable",
    apk: "application/vnd.android.package-archive", aab: "application/vnd.android.package-archive",
  };
  return EXT_MAP[ext] ?? "application/octet-stream";
}

/** Get a human-readable label for a file by extension. */
function fileLabel(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LABELS[ext] ?? (ext.toUpperCase() || "File");
}

/** Auto-detect recommended HTTP status code from file content type + name. */
function autoDetectStatus(ct: string, name: string): number {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  // Redirect / rewrite pages
  if (ext === "redirect" || ext === "301" || ext === "302") return 302;
  // Error / deny pages
  if (ext === "403" || ext === "denied" || ext === "banned") return 403;
  if (ext === "404" || ext === "notfound") return 404;
  if (ext === "500" || ext === "error") return 500;
  if (ext === "410" || ext === "expired") return 410;
  if (ext === "429" || ext === "ratelimit") return 429;
  // JSON API payloads → 200 (success response)
  if (ct.includes("json")) return 200;
  // Web assets served inline → 200
  if (ct.startsWith("text/") || ct.startsWith("image/") || ct.startsWith("font/") || ct.startsWith("audio/") || ct.startsWith("video/")) return 200;
  // Archives / binaries → 200
  return 200;
}

/** Auto-detect recommended HTTP method from file type. */
function autoDetectMethod(ct: string, ext: string): MethodType {
  // Script / server-side files are usually POST (they read form data)
  if (ext === "php" || ext === "phtml" || ct.includes("php")) return "POST";
  if (ext === "py" || ct.includes("python") || ext === "rb" || ext === "pl") return "POST";
  // JSON / text API responses are usually GET
  if (ct.includes("json") || ct === "text/plain" || ct.includes("xml")) return "GET";
  // Web assets are GET
  if (ct.startsWith("text/css") || ct.startsWith("text/html") || ct.startsWith("application/javascript") || ct.startsWith("image/")) return "GET";
  // Archives / binaries are GET (download)
  if (ct.includes("zip") || ct.includes("archive") || ct.includes("octet-stream") || ext === "apk") return "GET";
  return "GET";
}

/** Auto-detect suggested endpoint path from file name. */
function autoDetectPath(name: string): string {
  const base = name.split(".")[0]?.toLowerCase() ?? "";
  // Clean: only lowercase alphanumeric + dashes
  return base.replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}

/** Full auto-check result for a file. */
interface AutoCheckResult {
  contentType: string;
  statusCode: number;
  method: MethodType;
  suggestedPath: string;
  fileType: string;
  renderable: boolean; // can the browser display this inline?
  notes: string[]; // warnings / info
}

function autoCheckFile(file: File): AutoCheckResult {
  const ct = detectContentType(file);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const status = autoDetectStatus(ct, file.name);
  const method = autoDetectMethod(ct, ext);
  const path = autoDetectPath(file.name);
  const fileType = fileLabel(file.name);

  // Can the browser display this inline?
  const renderable = ct.startsWith("text/") || ct.startsWith("image/")
    || ct.startsWith("font/") || ct.startsWith("audio/")
    || ct.startsWith("video/") || ct === "application/json"
    || ct === "application/xml" || ct === "application/javascript"
    || ct === "application/pdf" || ct === "application/wasm"
    || ct === "application/svg+xml";

  const notes: string[] = [];
  if (!renderable) notes.push("This file type may prompt a download in some browsers");
  if (file.size > 19 * 1024 * 1024) notes.push(`File is ${formatBytes(file.size)} — max inline size is 19 MB`);
  if (ext === "php" || ext === "py" || ext === "rb") notes.push("Server-side scripts are served as text (not executed)");
  if (ct.includes("octet-stream")) notes.push("Content-Type auto-detected as binary — may need override");

  return { contentType: ct, statusCode: status, method, suggestedPath: path, fileType, renderable, notes };
}

/** Get the file-type category icon color for badge styling. */
function fileTypeColor(ct: string): string {
  if (ct.startsWith("image/")) return "text-pink-400 bg-pink-500/10 border-pink-500/30";
  if (ct.startsWith("video/")) return "text-red-400 bg-red-500/10 border-red-500/30";
  if (ct.startsWith("audio/")) return "text-orange-400 bg-orange-500/10 border-orange-500/30";
  if (ct.startsWith("font/") || ct.includes("woff") || ct.includes("ttf") || ct.includes("otf"))
    return "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";
  if (ct.includes("zip") || ct.includes("tar") || ct.includes("gzip") || ct.includes("rar") || ct.includes("7z") || ct.includes("jar"))
    return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  if (ct.includes("pdf")) return "text-rose-400 bg-rose-500/10 border-rose-500/30";
  if (ct.includes("json")) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
  if (ct.includes("html")) return "text-orange-400 bg-orange-500/10 border-orange-500/30";
  if (ct.includes("css")) return "text-blue-400 bg-blue-500/10 border-blue-500/30";
  if (ct.includes("javascript") || ct.includes("typescript")) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (ct.includes("php")) return "text-indigo-400 bg-indigo-500/10 border-indigo-500/30";
  if (ct.includes("xml") || ct.includes("yaml") || ct.includes("toml"))
    return "text-violet-400 bg-violet-500/10 border-violet-500/30";
  return "text-muted-foreground bg-muted/50 border-border";
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
  initialAuthType?: "token" | "key" | "any";
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
  initialAuthType = "token",
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
  const [authType, setAuthType] = useState<"token" | "key" | "any">(initialAuthType);
  const [responseType, setResponseType] = useState<"text" | "file">(initialResponseType);
  const [file, setFile] = useState<File | null>(null);
  const [detectedContentType, setDetectedContentType] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"" | "uploading" | "registering">("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState("");
  const [uploadEta, setUploadEta] = useState("");

  const reset = () => {
    setPath("");
    setMethod("POST");
    setStatusCode("200");
    setBody('{"ok":true}');
    setContentType("application/json");
    setAuthRequired(false);
    setAuthType("token");
    setResponseType("text");
    setFile(null);
    setDetectedContentType("");
    setAutoCheck(null);
    setUploadPhase("");
    setUploadProgress(0);
    setUploadSpeed("");
    setUploadEta("");
  };

  const [autoCheck, setAutoCheck] = useState<AutoCheckResult | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) {
      const check = autoCheckFile(f);
      setAutoCheck(check);
      setDetectedContentType(check.contentType);
      setContentType(check.contentType);
      setStatusCode(String(check.statusCode));
      setMethod(check.method);
      if (!path.trim()) setPath(check.suggestedPath);
    } else {
      setDetectedContentType("");
      setAutoCheck(null);
    }
  }, [path]);

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
        setUploadPhase("uploading");
        setUploadProgress(0);
        // Use XHR for upload progress tracking
        const storageId = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", uploadUrl, true);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
          let lastLoaded = 0;
          let lastTime = Date.now();
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              const pct = Math.round((ev.loaded / ev.total) * 100);
              setUploadProgress(pct);
              const now = Date.now();
              const dt = (now - lastTime) / 1000;
              if (dt > 0.3) {
                const bytesPerSec = (ev.loaded - lastLoaded) / dt;
                lastLoaded = ev.loaded;
                lastTime = now;
                setUploadSpeed(formatBytes(bytesPerSec) + "/s");
                const remaining = ev.total - ev.loaded;
                const etaSec = bytesPerSec > 0 ? Math.ceil(remaining / bytesPerSec) : 0;
                setUploadEta(etaSec > 0 ? `${etaSec}s left` : "");
              }
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                if (data.storageId) resolve(data.storageId);
                else reject(new Error("No storageId in response"));
              } catch {
                reject(new Error(`Invalid response: ${xhr.responseText.slice(0, 200)}`));
              }
            } else {
              const detail = xhr.responseText?.slice(0, 200) ?? "";
              console.error("[upload] POST failed:", xhr.status, detail);
              reject(new Error(`File upload failed (${xhr.status}): ${detail}`));
            }
          };
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.ontimeout = () => reject(new Error("Upload timed out (2 min limit)"));
          xhr.timeout = 120_000;
          xhr.send(file);
        });
        setUploadPhase("registering");
        setUploadProgress(100);
        setUploadSpeed("");
        setUploadEta("");
        fileId = await registerFile({
          storageId: storageId as Id<"_storage">,
          name: file.name,
          size: file.size,
          contentType: detectContentType(file),
        });
        setUploadPhase("");
        setUploadProgress(0);
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
          authType: authRequired ? authType : undefined,
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
          authType: authRequired ? authType : undefined,
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <div className="overflow-y-auto flex-1 pr-1 -mr-1 space-y-4">
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
              <div className="flex flex-wrap gap-1">
                {[{ v: 200, l: "200 OK" }, { v: 201, l: "201 Created" }, { v: 301, l: "301" }, { v: 302, l: "302" }, { v: 400, l: "400" }, { v: 401, l: "401" }, { v: 403, l: "403" }, { v: 404, l: "404" }, { v: 410, l: "410" }, { v: 429, l: "429" }, { v: 500, l: "500" }].map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setStatusCode(String(s.v))}
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-mono transition-colors ${
                      statusCode === String(s.v)
                        ? "border-violet-500/40 bg-violet-500/10 text-violet-400"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {s.l}
                  </button>
                ))}
              </div>
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
                {TYPE_GROUPS.map((group) => {
                  const presets = CONTENT_TYPE_PRESETS.filter((p) => p.group === group);
                  if (presets.length === 0) return null;
                  return (
                    <div key={group} className="space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">{group}</p>
                      <div className="flex flex-wrap gap-1">
                        {presets.map((preset) => (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => setContentType(preset.value)}
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                              contentType === preset.value
                                ? "border-violet-500/40 bg-violet-500/10 text-violet-400"
                                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
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
            <div className="space-y-2">
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
                  <span>Upload any file: .php, .css, .js, .html, .sh, .py, .json, .xml, .apk, .zip, images…</span>
                )}
                <input type="file" className="hidden" onChange={handleFileChange} />
              </label>
              {/* Full auto-check panel with file requirements */}
              {file && autoCheck && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-emerald-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-emerald-400">Auto-check results</span>
                    <span className={`ml-auto rounded border px-1.5 py-0.5 text-[10px] font-mono font-medium ${fileTypeColor(autoCheck.contentType)}`}>
                      {autoCheck.fileType}
                    </span>
                  </div>
                  {/* Requirements table */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground/60 w-16">Status</span>
                      <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-400">{autoCheck.statusCode}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground/60 w-16">Method</span>
                      <span className={`rounded border px-1.5 py-0.5 font-mono font-bold ${METHOD_COLORS[autoCheck.method] ?? METHOD_COLORS.ANY}`}>{autoCheck.method}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground/60 w-16">Path</span>
                      <span className="font-mono text-foreground">/hook/{autoCheck.suggestedPath || path}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground/60 w-16">Type</span>
                      <span className="font-mono text-foreground">{autoCheck.renderable ? "✓ Inline" : "⬇ May download"}</span>
                    </div>
                    <div className="col-span-2 flex items-start gap-1.5">
                      <span className="text-muted-foreground/60 w-16 shrink-0">Content</span>
                      <code className="font-mono text-muted-foreground/70 break-all">{autoCheck.contentType}</code>
                    </div>
                  </div>
                  {/* Notes / warnings */}
                  {autoCheck.notes.length > 0 && (
                    <div className="space-y-0.5">
                      {autoCheck.notes.map((n, i) => (
                        <p key={i} className="text-[9px] text-amber-400/80">⚠ {n}</p>
                      ))}
                    </div>
                  )}
                  <p className="text-[9px] text-muted-foreground/50">Response served inline (not download) · All settings auto-filled above</p>
                </motion.div>
              )}
              {/* Content-Type override (for edge cases where auto-detect is wrong) */}
              {file && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/60">Override Content-Type (optional)</Label>
                  <div className="flex flex-wrap gap-1">
                    {["application/json", "text/html", "text/css", "application/javascript", "text/php", "text/plain", "application/xml", "image/svg+xml", "application/octet-stream"].map((ct) => (
                      <button
                        key={ct}
                        type="button"
                        onClick={() => setContentType(ct)}
                        className={`rounded border px-1.5 py-0.5 text-[9px] font-mono transition-colors ${
                          contentType === ct
                            ? "border-violet-500/40 bg-violet-500/10 text-violet-400"
                            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                        }`}
                      >
                        {ct.split("/").pop()}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value)}
                    placeholder="auto-detect"
                    className="font-mono text-[11px] h-7"
                  />
                </div>
              )}
              {!file && (
                <p className="text-[11px] text-muted-foreground">
                  Content-Type auto-detected from file extension and MIME type. Override available after upload.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={authRequired}
                onChange={(e) => setAuthRequired(e.target.checked)}
                className="rounded border-border"
              />
              <Shield className="size-3.5 text-amber-400" />
              Require authentication
            </label>
            {authRequired && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="ml-6 space-y-2"
              >
                <div className="flex gap-2">
                  {[{ v: "token" as const, l: "Token", d: "Bearer token" }, { v: "key" as const, l: "Key", d: "Connect key" }, { v: "any" as const, l: "Both", d: "Token or key" }].map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      onClick={() => setAuthType(t.v)}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all ${
                        authType === t.v
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      <span className="font-semibold">{t.l}</span>
                      <span className="ml-1 opacity-60">{t.d}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground/60">
                  {authType === "token" && "Client must send Authorization: Bearer <token> or ?token="}
                  {authType === "key" && "Client must send a valid connect key as ?key= or Authorization: Bearer <key>"}
                  {authType === "any" && "Client can use either a Bearer token or a connect key"}
                </p>
              </motion.div>
            )}
          </div>

          {/* Upload progress bar */}
          {uploadPhase && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {uploadPhase === "uploading" && (
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-3 animate-spin text-violet-400" />
                      Uploading to storage…
                    </span>
                  )}
                  {uploadPhase === "registering" && "Saving file metadata…"}
                </span>
                <span className="tabular-nums font-mono text-muted-foreground">
                  {uploadProgress}%
                  {uploadSpeed && ` · ${uploadSpeed}`}
                  {uploadEta && ` · ${uploadEta}`}
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/60">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
              {file && uploadPhase === "uploading" && (
                <p className="text-[10px] text-muted-foreground/60">
                  {file.name} · {formatBytes(file.size)}
                </p>
              )}
            </motion.div>
          )}
        </div>
        </div>{/* end scrollable area */}

        <DialogFooter className="shrink-0">
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

/* ========================= Key Generator Dialog ========================= */

function KeyGenerateDialog({ open, onOpenChange, endpointPath }: { open: boolean; onOpenChange: (v: boolean) => void; endpointPath: string }) {
  const servers = useQuery(api.nameserver.listServers) ?? [];
  const settings = useQuery(api.nameserver.getSettings);
  const generateKey = useMutation(api.nameserver.generateKey);

  const [serverId, setServerId] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [note, setNote] = useState("");
  const [uses, setUses] = useState("");
  const [hours, setHours] = useState("");
  const [maxDevices, setMaxDevices] = useState("");
  const [game, setGame] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ key: string } | null>(null);

  const activeServers = servers.filter((s) => s.status === "active");
  const keyFormat = settings?.keyFormat || `${settings?.keyPrefix ?? "NS"}-XXXX-XXXX-XXXX-XXXX-XXXX`;
  const CONVEX_BASE = (import.meta.env.VITE_CONVEX_URL as string)
    .replace(/\.convex\.cloud$/, ".convex.site")
    .replace(/\/$/, "");
  const url = `${CONVEX_BASE}/hook/${endpointPath}`;

  const GAMES = ["", "MLBB", "FREEFIRE", "PUBG", "CODM", "GENSHIN", "OTHER"];

  const handleSubmit = async () => {
    if (!serverId) { toast.error("Pick a server"); return; }
    setBusy(true);
    try {
      const res = await generateKey({
        serverId: serverId as Doc<"servers">["_id"],
        note: note || `endpoint: /hook/${endpointPath}`,
        uses: uses === "" ? undefined : Number(uses),
        hours: hours === "" ? undefined : Number(hours),
        maxDevices: maxDevices === "" ? undefined : Number(maxDevices),
        game: game || undefined,
        customKey: customKey.trim() || undefined,
      });
      setResult({ key: res.key });
      setNote(""); setUses(""); setHours(""); setMaxDevices(""); setGame(""); setCustomKey("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setResult(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-violet-400" />
            Generate Key
          </DialogTitle>
          <DialogDescription>
            Create a key for <code className="font-mono text-violet-400">/hook/{endpointPath}</code>
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-xs text-emerald-400 font-medium mb-1">Key generated!</p>
              <div className="flex items-center gap-2 rounded bg-muted/50 p-2">
                <code className="flex-1 font-mono text-xs break-all">{result.key}</code>
                <CopyButton value={result.key} label="Key" />
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-[10px] text-muted-foreground mb-1">How to use with this endpoint:</p>
              <code className="block font-mono text-[10px] text-muted-foreground/70 break-all">
                curl -d "key={result.key}&amp;device=DEVICE_ID" {url}
              </code>
            </div>
            <Button variant="outline" className="w-full cursor-pointer" onClick={() => setResult(null)}>
              Generate another
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Server</Label>
              <select value={serverId} onChange={(e) => setServerId(e.target.value)} className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm">
                <option value="">Select server…</option>
                {activeServers.map((s) => (
                  <option key={s._id} value={s._id}>{s.name} · {s.code}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Custom key <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={customKey} onChange={(e) => setCustomKey(e.target.value.toUpperCase())} placeholder={keyFormat} maxLength={80} className="font-mono text-xs" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Max uses</Label>
                <Input type="number" min={0} value={uses} onChange={(e) => setUses(e.target.value)} placeholder="0" className="text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Hours</Label>
                <Input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" className="text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Max devices</Label>
                <Input type="number" min={0} value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} placeholder="1" className="text-xs" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Game</Label>
              <select value={game} onChange={(e) => setGame(e.target.value)} className="flex h-8 w-full rounded-md border border-border bg-transparent px-2 text-xs">
                <option value="">All games</option>
                {GAMES.filter(Boolean).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <Button onClick={handleSubmit} disabled={busy || !serverId} className="w-full cursor-pointer bg-violet-600 hover:bg-violet-700 text-white">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Generate key
            </Button>
          </div>
        )}
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
  const [keyGenOpen, setKeyGenOpen] = useState(false);

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
              <span className={`flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium ${fileTypeColor(ep.contentType ?? "")}`}>
                <FileCode2 className="size-2.5" /> {ep.contentType?.split("/").pop()?.toUpperCase() ?? "FILE"}
              </span>
            ) : (
              <span className={`flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium ${fileTypeColor(ep.contentType ?? "")}`}>
                <FileText className="size-2.5" /> {ep.contentType?.split("/").pop()?.toUpperCase() ?? "TEXT"}
              </span>
            )}
            {ep.authRequired && (
              <span className="flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                <Shield className="size-2.5" /> {ep.authType === "key" ? "Key" : ep.authType === "any" ? "Token+Key" : "Token"}
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
          {ep.authRequired && (ep.authType === "key" || ep.authType === "any") && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-amber-400 hover:text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Generate key for this endpoint"
              onClick={() => setKeyGenOpen(true)}
            >
              <KeyRound className="size-3.5" />
            </Button>
          )}
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

      {ep.authRequired && (ep.authType === "key" || ep.authType === "any") && (
        <KeyGenerateDialog open={keyGenOpen} onOpenChange={setKeyGenOpen} endpointPath={ep.path} />
      )}
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
        initialAuthType={(ep.authType as "token" | "key" | "any") ?? "token"}
        endpointId={ep._id}
      />
    </>
  );
}

/* ========================= Request History ========================= */

function RequestHistoryPanel() {
  const logs = useQuery(api.nameserver.listCustomEndpointLogs, { limit: 50 });
  const endpoints = useQuery(api.nameserver.listCustomEndpoints);
  const clearLogs = useMutation(api.nameserver.clearCustomEndpointLogs);
  const [filterPath, setFilterPath] = useState("");
  const [expanded, setExpanded] = useState(false);

  const filtered = logs?.filter((l) => !filterPath || l.endpointPath === filterPath);
  const displayLogs = expanded ? filtered : filtered?.slice(0, 10);

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.3 }}>
      <Card className="border-border/60 bg-card/50">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">Request History</p>
              {logs && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {logs.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {endpoints && endpoints.length > 0 && (
                <select
                  value={filterPath}
                  onChange={(e) => setFilterPath(e.target.value)}
                  className="h-7 rounded-md border border-border bg-transparent px-2 text-[11px]"
                >
                  <option value="">All endpoints</option>
                  {endpoints.map((ep) => (
                    <option key={ep._id} value={ep.path}>/{ep.path}</option>
                  ))}
                </select>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-muted-foreground"
                onClick={() => clearLogs({ endpointPath: filterPath || undefined })}
              >
                <Trash2 className="size-3 mr-1" /> Clear
              </Button>
            </div>
          </div>

          {logs === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : displayLogs?.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No requests yet — hit an endpoint to see logs here.
            </p>
          ) : (
            <div className="space-y-1">
              {displayLogs?.map((log) => (
                <div
                  key={log._id}
                  className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-[11px]"
                >
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold font-mono ${METHOD_COLORS[log.method] ?? METHOD_COLORS.ANY}`}>
                    {log.method}
                  </span>
                  <code className="font-mono text-foreground truncate">/{log.endpointPath}</code>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${
                    log.statusCode >= 200 && log.statusCode < 300 ? "bg-emerald-500/10 text-emerald-400" :
                    log.statusCode >= 400 ? "bg-red-500/10 text-red-400" :
                    "bg-amber-500/10 text-amber-400"
                  }`}>
                    {log.statusCode}
                  </span>
                  <span className="text-muted-foreground/50 truncate">{log.ip}</span>
                  <span className="text-muted-foreground/40 ml-auto shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
              {!expanded && (filtered?.length ?? 0) > 10 && (
                <button
                  onClick={() => setExpanded(true)}
                  className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground py-2"
                >
                  Show all {filtered?.length} requests
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
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

      {/* Request History */}
      <RequestHistoryPanel />
    </div>
  );
}
