import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CopyButton } from "@/components/panel/CopyButton";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatDate, getSiteBaseUrl } from "@/lib/download";
import { useMutation, useQuery } from "convex/react";
import { KeyRound, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Endpoint {
  method: string;
  path: string;
  auth: string;
  description: string;
  curl: string;
}

function endpointCards(base: string): Endpoint[] {
  return [
    {
      method: "GET",
      path: "/health",
      auth: "public",
      description: "Server status.",
      curl: `curl ${base}/health`,
    },
    {
      method: "POST",
      path: "/api/login",
      auth: "public",
      description: "Exchange admin credentials for a Bearer token (valid 24 h). Rate-limited to 5 failed attempts/min/IP.",
      curl: `curl -X POST ${base}/api/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"your-password"}'`,
    },
    {
      method: "POST",
      path: "/api/files",
      auth: "Bearer token",
      description: "Upload a file (multipart). Fields: file, name (optional), version (optional), note (optional). API uploads are capped at 15 MB — use the admin panel for larger files.",
      curl: `curl -X POST ${base}/api/files \\
  -H "Authorization: Bearer <token>" \\
  -F "file=@build.apk" \\
  -F "name=build.apk" \\
  -F "version=1.0.3"`,
    },
    {
      method: "GET",
      path: "/api/files",
      auth: "Bearer token",
      description: "List all files with metadata (id, name, size, sha256, created_at, download_count, url).",
      curl: `curl ${base}/api/files \\
  -H "Authorization: Bearer <token>"`,
    },
    {
      method: "DELETE",
      path: "/api/files/:id",
      auth: "Bearer token",
      description: "Delete a file and its bytes.",
      curl: `curl -X DELETE ${base}/api/files/<id> \\
  -H "Authorization: Bearer <token>"`,
    },
    {
      method: "GET",
      path: "/files/:id",
      auth: "public",
      description: "Download a file. Files ≤15 MB stream with Content-Disposition: attachment and X-Checksum-Sha256; larger files redirect (302) to a signed storage URL.",
      curl: `curl -L -O ${base}/files/<id>`,
    },
  ];
}

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  POST: "bg-primary/10 text-primary",
  DELETE: "bg-destructive/10 text-destructive",
};

export default function ApiDocs() {
  const base = getSiteBaseUrl();
  const tokens = useQuery(api.files.listApiTokens) ?? [];
  const createToken = useMutation(api.files.createApiToken);
  const revokeToken = useMutation(api.files.revokeApiToken);

  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ token: string; expiresAt: number } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createToken({ label: label.trim() || undefined });
      setNewToken(result);
      setLabel("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await revokeToken({ id: id as Doc<"apiTokens">["_id"] });
      toast.success("Token revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke token");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="REST API"
        description={`Programmatic access for scripts and CI. Base URL: ${base}`}
      />

      {/* Tokens */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">API tokens</CardTitle>
          <CardDescription>
            Tokens authenticate the admin endpoints (Authorization: Bearer). They are
            stored hashed — copy the token now, it is shown only once.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="token-label">Label (optional)</Label>
              <Input
                id="token-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ci-deploy"
              />
            </div>
            <Button className="cursor-pointer" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create token
            </Button>
          </div>

          {tokens.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Label</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((token) => (
                    <TableRow key={token._id}>
                      <TableCell className="text-sm font-medium">{token.label}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(token.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(token.expiresAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="cursor-pointer text-muted-foreground hover:text-destructive"
                          aria-label="Revoke token"
                          onClick={() => handleRevoke(token._id)}
                          disabled={revoking === token._id}
                        >
                          {revoking === token._id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Endpoints */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold tracking-tight">Endpoints</h2>
        {endpointCards(base).map((endpoint) => (
          <Card key={`${endpoint.method} ${endpoint.path}`} className="border-border/70">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${METHOD_STYLES[endpoint.method] ?? "bg-muted text-muted-foreground"}`}
                >
                  {endpoint.method}
                </span>
                <code className="font-mono text-sm font-semibold">{endpoint.path}</code>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <ShieldCheck className="size-3" />
                  {endpoint.auth}
                </span>
              </div>
              <CardDescription>{endpoint.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-zinc-950 p-3.5 font-mono text-[12px] leading-relaxed text-zinc-300">
                  {endpoint.curl}
                </pre>
                <CopyButton value={endpoint.curl} label="curl" className="mt-1 shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New token dialog */}
      <Dialog open={newToken !== null} onOpenChange={(open) => !open && setNewToken(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              Token created
            </DialogTitle>
            <DialogDescription>
              Copy it now — it won't be shown again. Expires{" "}
              {newToken ? formatDate(newToken.expiresAt) : ""}.
            </DialogDescription>
          </DialogHeader>
          {newToken && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{newToken.token}</code>
                <CopyButton value={newToken.token} label="Token" />
              </div>
              <p className="text-xs text-muted-foreground">
                Use it as <code className="font-mono">Authorization: Bearer {newToken.token.slice(0, 12)}…</code>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
