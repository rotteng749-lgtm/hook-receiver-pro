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
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/panel/CopyButton";
import { PageHeader } from "@/components/panel/PageHeader";
import { RequestTable } from "@/components/panel/RequestTable";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getCurlExample, getHookUrl } from "@/lib/webhook";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const STATUS_PRESETS = [200, 201, 204, 400, 401, 403, 404, 500];
const CONTENT_TYPES = [
  "application/json",
  "text/plain",
  "text/html",
  "application/xml",
];

export default function HookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const hookId = id as Id<"hooks">;
  const hook = useQuery(api.hooks.get, { id: hookId });
  const requests = useQuery(api.requests.listForOwner, { hookId });

  const updateHook = useMutation(api.hooks.update);
  const rotateToken = useMutation(api.hooks.rotateToken);
  const removeHook = useMutation(api.hooks.remove);
  const clearForHook = useMutation(api.requests.clearForHook);

  const [methods, setMethods] = useState<string[]>([]);
  const [requireToken, setRequireToken] = useState(true);
  const [responseStatus, setResponseStatus] = useState(200);
  const [responseContentType, setResponseContentType] = useState("application/json");
  const [responseBody, setResponseBody] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (hook) {
      setMethods(hook.methods);
      setRequireToken(hook.requireToken);
      setResponseStatus(hook.responseStatus);
      setResponseContentType(hook.responseContentType);
      setResponseBody(hook.responseBody);
    }
  }, [hook]);

  if (hook === undefined || requests === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hook === null) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Hook not found.</p>
        <Button variant="outline" asChild className="cursor-pointer">
          <Link to="/dashboard/hooks">Back to hooks</Link>
        </Button>
      </div>
    );
  }

  const toggleMethod = (method: string) =>
    setMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
    );

  const handleSave = async () => {
    if (methods.length === 0) {
      setFormError("Select at least one method.");
      return;
    }
    if (responseContentType.includes("json") && responseBody.trim().length > 0) {
      try {
        JSON.parse(responseBody);
      } catch {
        setFormError("Response body is not valid JSON.");
        return;
      }
    }
    setFormError(null);
    setSaving(true);
    try {
      await updateHook({
        id: hook._id,
        patch: {
          methods,
          requireToken,
          responseStatus,
          responseContentType,
          responseBody,
        },
      });
      toast("Settings saved");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleRotate = async () => {
    setBusy(true);
    try {
      await rotateToken({ id: hook._id });
      toast("Token rotated — old tokens no longer work");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to rotate token");
    } finally {
      setBusy(false);
    }
  };

  const handleClearHistory = async () => {
    setBusy(true);
    try {
      await clearForHook({ hookId: hook._id });
      toast("Request history cleared");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to clear history");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await removeHook({ id: hook._id });
      toast(`Hook /${hook.path} deleted`);
      navigate("/dashboard/hooks");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete hook");
      setBusy(false);
    }
  };

  const statusIsPreset = STATUS_PRESETS.includes(responseStatus);

  return (
    <div className="space-y-8">
      <Button
        variant="ghost"
        size="sm"
        className="cursor-pointer -ml-2 text-muted-foreground"
        asChild
      >
        <Link to="/dashboard/hooks">
          <ArrowLeft className="size-4" />
          Back to hooks
        </Link>
      </Button>

      <PageHeader
        title={hook.name}
        description={`Public URL: /api/hook/${hook.path}`}
        actions={
          <>
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
              Enabled
              <Switch
                checked={hook.enabled}
                onCheckedChange={async (checked) => {
                  await updateHook({ id: hook._id, patch: { enabled: checked } });
                  toast(checked ? "Hook enabled" : "Hook disabled");
                }}
                aria-label="Toggle hook"
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete /{hook.path}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The URL will stop working and all logged requests will be deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="cursor-pointer"
                    onClick={handleDelete}
                    disabled={busy}
                  >
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      {/* URL + token */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Hook URL</CardTitle>
            <CardDescription>What your scripts call. No login or Vercel bypass needed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{getHookUrl(hook.path)}</code>
              <CopyButton value={getHookUrl(hook.path)} label="Hook URL" />
            </div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-zinc-950 p-4 font-mono text-[12.5px] leading-relaxed text-zinc-300">
              {getCurlExample(hook.path, hook.token)}
            </pre>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4 text-primary" />
              Secret token
            </CardTitle>
            <CardDescription>
              Sent as <code className="font-mono text-xs">x-hook-token</code>,{" "}
              <code className="font-mono text-xs">Authorization: Bearer</code>, or{" "}
              <code className="font-mono text-xs">?bypass=</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[13px]">
                {showToken ? hook.token : "•".repeat(Math.min(hook.token.length, 32))}
              </code>
              <Button
                variant="ghost"
                size="icon-sm"
                className="cursor-pointer text-muted-foreground"
                aria-label={showToken ? "Hide token" : "Reveal token"}
                onClick={() => setShowToken((value) => !value)}
              >
                {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <CopyButton value={hook.token} label="Token" />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  disabled={busy}
                >
                  <RefreshCw className="size-4" />
                  Rotate token
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rotate this token?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A new token is generated and the old one stops working immediately.
                    Update your scripts afterwards.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                  <AlertDialogAction className="cursor-pointer" onClick={handleRotate} disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    Rotate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      {/* Response settings */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Response settings</CardTitle>
          <CardDescription>
            Exactly what callers receive. Apply to every allowed request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Allowed methods</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => toggleMethod(method)}
                  className={cn(
                    "cursor-pointer rounded-md border px-2.5 py-1 font-mono text-xs font-semibold transition-colors",
                    methods.includes(method)
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3.5 py-3">
            <div>
              <p className="text-sm font-medium">Require secret token</p>
              <p className="text-xs text-muted-foreground">
                Reject calls without a valid token with 403.
              </p>
            </div>
            <Switch checked={requireToken} onCheckedChange={setRequireToken} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status code</Label>
              <div className="flex gap-2">
                <Select
                  value={statusIsPreset ? String(responseStatus) : "custom"}
                  onValueChange={(value) =>
                    setResponseStatus(value === "custom" ? 200 : Number(value))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Status code" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_PRESETS.map((status) => (
                      <SelectItem key={status} value={String(status)}>
                        {status}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {!statusIsPreset && (
                  <Input
                    type="number"
                    min={100}
                    max={599}
                    value={responseStatus}
                    onChange={(e) => setResponseStatus(Number(e.target.value))}
                    className="w-28 font-mono"
                  />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Content type</Label>
              <Select
                value={responseContentType}
                onValueChange={setResponseContentType}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Content type" />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Response body</Label>
            <Textarea
              className="min-h-28 font-mono text-[13px]"
              value={responseBody}
              onChange={(e) => setResponseBody(e.target.value)}
              placeholder='{"ok":true}'
            />
            <p className="text-xs text-muted-foreground">
              Returned verbatim. JSON is validated before saving.
            </p>
          </div>

          {formError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}

          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save settings
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Request history</h2>
            <p className="text-sm text-muted-foreground">
              {requests.length} captured request{requests.length === 1 ? "" : "s"}
            </p>
          </div>
          {requests.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer text-muted-foreground"
              onClick={handleClearHistory}
              disabled={busy}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Clear history
            </Button>
          )}
        </div>
        <RequestTable requests={requests} />
      </div>
    </div>
  );
}
