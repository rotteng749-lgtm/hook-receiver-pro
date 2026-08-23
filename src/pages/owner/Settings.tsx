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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Globe,
  KeyRound,
  Loader2,
  Plus,
  Save,
  Shield,
  Trash2,
  Webhook,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const FORMAT_PRESETS = [
  { template: "NS-XXXX-XXXX-XXXX-XXXX-XXXX", hint: "classic (default)" },
  { template: "ML_#########", hint: "→ ML_227182973" },
  { template: "ML_XXXXXXXXXXXX", hint: "→ ML_EDBBC4CA420B" },
  { template: "FF-####-####-####", hint: "Free Fire style" },
  { template: "KEY-XXXXXX-XXXXXX-XXXXXX", hint: "generic loader key" },
];

const SAMPLE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SAMPLE_DIGITS = "0123456789";

/** Render the template once with random chars so the owner sees the shape. */
function sampleKey(format: string): string {
  const template = format.trim().toUpperCase();
  if (!template.includes("X") && !template.includes("#")) return "";
  let out = "";
  for (const ch of template) {
    if (ch === "X") {
      out += SAMPLE_ALPHABET[Math.floor(Math.random() * SAMPLE_ALPHABET.length)];
    } else if (ch === "#") {
      out += SAMPLE_DIGITS[Math.floor(Math.random() * SAMPLE_DIGITS.length)];
    } else {
      out += ch;
    }
  }
  return out;
}

/* ========================== Custom Endpoint Form ========================== */

function CustomEndpointsSection() {
  const endpoints = useQuery(api.nameserver.listCustomEndpoints);
  const createEndpoint = useMutation(api.nameserver.createCustomEndpoint);
  const deleteEndpoint = useMutation(api.nameserver.deleteCustomEndpoint);
  const toggleEndpoint = useMutation(api.nameserver.updateCustomEndpoint);

  const [showForm, setShowForm] = useState(false);
  const [epPath, setEpPath] = useState("");
  const [epMethod, setEpMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ANY">("POST");
  const [epStatus, setEpStatus] = useState("200");
  const [epBody, setEpBody] = useState('{"ok":true}');
  const [epContentType, setEpContentType] = useState("application/json");
  const [epAuth, setEpAuth] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    try {
      await createEndpoint({
        path: epPath,
        method: epMethod,
        statusCode: Number(epStatus) || 200,
        body: epBody,
        contentType: epContentType || undefined,
        enabled: true,
        authRequired: epAuth,
      });
      toast.success(`Endpoint /hook/${epPath} created`);
      setShowForm(false);
      setEpPath("");
      setEpBody('{"ok":true}');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create endpoint");
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleEndpoint({ id: id as any, enabled: !enabled });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    }
  };

  const handleDelete = async (id: string, path: string) => {
    if (!confirm(`Delete endpoint /${path}?`)) return;
    try {
      await deleteEndpoint({ id: id as any });
      toast.success(`Deleted /${path}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <Card className="border-border/70">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Webhook className="size-4" />
              Custom Endpoints
            </CardTitle>
            <CardDescription>
              Create your own HTTP endpoints at /hook/&lt;path&gt;. Each one
              returns the response you configure — useful for webhooks, custom
              APIs, or mock servers.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowForm(!showForm)}
            className="cursor-pointer shrink-0"
          >
            <Plus className="size-3.5" />
            {showForm ? "Cancel" : "New endpoint"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing endpoints */}
        {endpoints && endpoints.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">
            No custom endpoints yet. Click "New endpoint" to create one.
          </p>
        )}
        {endpoints && endpoints.length > 0 && (
          <div className="space-y-2">
            {endpoints.map((ep) => (
              <div
                key={ep._id}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm">/hook/{ep.path}</code>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                      {ep.method}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      → {ep.statusCode}
                    </span>
                    {ep.authRequired && (
                      <Shield className="size-3 text-amber-500" />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={ep.enabled}
                    onCheckedChange={() => handleToggle(ep._id, ep.enabled)}
                    aria-label={`Toggle ${ep.path}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(ep._id, ep.path)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* New endpoint form */}
        {showForm && (
          <div className="space-y-3 rounded-lg border border-dashed border-primary/40 bg-muted/20 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Path</Label>
                <div className="flex items-center gap-0">
                  <span className="rounded-l-md border border-r-0 border-border bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                    /hook/
                  </span>
                  <Input
                    value={epPath}
                    onChange={(e) =>
                      setEpPath(
                        e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                      )
                    }
                    placeholder="my-endpoint"
                    maxLength={64}
                    className="rounded-l-none font-mono text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <select
                  value={epMethod}
                  onChange={(e) => setEpMethod(e.target.value as any)}
                  className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm"
                >
                  <option value="ANY">ANY (all methods)</option>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Status code</Label>
                <Input
                  value={epStatus}
                  onChange={(e) => setEpStatus(e.target.value)}
                  type="number"
                  min={100}
                  max={599}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Content-Type</Label>
              <Input
                value={epContentType}
                onChange={(e) => setEpContentType(e.target.value)}
                placeholder="application/json"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Response body</Label>
              <Textarea
                value={epBody}
                onChange={(e) => setEpBody(e.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder='{"ok":true, "status":"success"}'
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={epAuth}
                  onChange={(e) => setEpAuth(e.target.checked)}
                  className="rounded border-border"
                />
                Require auth token
              </label>
              <Button
                type="button"
                size="sm"
                onClick={handleCreate}
                disabled={busy || epPath.length === 0}
                className="cursor-pointer"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                Create
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================ Main ================================ */

export default function SettingsPage() {
  const settings = useQuery(api.nameserver.getSettings);
  const updateSettings = useMutation(api.nameserver.updateSettings);

  const [keyPrice, setKeyPrice] = useState("10");
  const [defaultKeyUses, setDefaultKeyUses] = useState("0");
  const [defaultKeyHours, setDefaultKeyHours] = useState("0");
  const [keyPrefix, setKeyPrefix] = useState("NS");
  const [keyFormat, setKeyFormat] = useState("");
  const [maintenance, setMaintenance] = useState(false);
  const [downMessage, setDownMessage] = useState("");
  const [serverDomain, setServerDomain] = useState("");
  const [endpointAuthToken, setEndpointAuthToken] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) {
      setKeyPrice(String(settings.keyPrice));
      setDefaultKeyUses(String(settings.defaultKeyUses));
      setDefaultKeyHours(String(settings.defaultKeyHours));
      setKeyPrefix(settings.keyPrefix);
      setKeyFormat(settings.keyFormat);
      setMaintenance(settings.maintenance);
      setDownMessage(settings.downMessage);
      setServerDomain(settings.serverDomain);
      setEndpointAuthToken(settings.endpointAuthToken);
    }
  }, [settings]);

  // Live sample of the custom format (recomputed as the owner types).
  // MUST stay before the early return below — hooks can't be skipped between
  // renders (React error #310 otherwise).
  const sample = useMemo(() => sampleKey(keyFormat), [keyFormat]);

  if (settings === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateSettings({
        keyPrice: Number(keyPrice) || 0,
        defaultKeyUses: Number(defaultKeyUses) || 0,
        defaultKeyHours: Number(defaultKeyHours) || 0,
        keyPrefix: keyPrefix || undefined,
        keyFormat: keyFormat.trim() || undefined,
        maintenance,
        downMessage: downMessage || undefined,
        serverDomain: serverDomain || undefined,
        endpointAuthToken: endpointAuthToken || undefined,
      });
      toast.success("Settings saved — applied immediately");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Owner-only. These apply to every admin and every generated key."
      />

      <form onSubmit={submit} className="space-y-6">
        {/* ─── Server Domain ─── */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="size-4" />
              Server Domain
            </CardTitle>
            <CardDescription>
              Set a short custom domain for your server. This replaces the long
              Convex URL in all responses and generated links. Leave empty to use
              the default Convex URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="server-domain">Custom domain</Label>
              <Input
                id="server-domain"
                value={serverDomain}
                onChange={(e) =>
                  setServerDomain(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9.-]/g, ""),
                  )
                }
                placeholder="panxcz"
                maxLength={63}
              />
              <p className="text-xs text-muted-foreground">
                Just the name — e.g. <code className="rounded bg-muted px-1 py-0.5 font-mono">panxcz</code> becomes{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">https://panxcz.site</code>. Point your domain's DNS to your hosting provider and set up an SSL cert.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endpoint-auth-token">Endpoint auth token</Label>
              <Input
                id="endpoint-auth-token"
                value={endpointAuthToken}
                onChange={(e) => setEndpointAuthToken(e.target.value)}
                placeholder="your-secret-token-here"
                maxLength={128}
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                Bearer token for custom endpoints that have "Require auth token" enabled. Clients must send{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">Authorization: Bearer &lt;token&gt;</code> or{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">?token=&lt;token&gt;</code>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ─── Key Pricing ─── */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Key pricing & defaults</CardTitle>
            <CardDescription>
              Generating a key always deducts the price from the generator's
              balance. Use limits and lifetime default to what new keys get when
              the admin leaves them blank. The prefix controls the classic
              license key format, e.g. "NS" → NS-XXXX-… or "LIC" → LIC-XXXX-…
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="key-price">Key price (balance per key)</Label>
              <Input
                id="key-price"
                type="number"
                min={0}
                value={keyPrice}
                onChange={(e) => setKeyPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-uses">Default max uses (0 = unlimited)</Label>
              <Input
                id="default-uses"
                type="number"
                min={0}
                value={defaultKeyUses}
                onChange={(e) => setDefaultKeyUses(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-hours">Default lifetime (hours, 0 = never)</Label>
              <Input
                id="default-hours"
                type="number"
                min={0}
                value={defaultKeyHours}
                onChange={(e) => setDefaultKeyHours(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-prefix">License key prefix (A-Z, 0-9)</Label>
              <Input
                id="key-prefix"
                value={keyPrefix}
                onChange={(e) => setKeyPrefix(e.target.value.toUpperCase())}
                placeholder="NS"
                maxLength={10}
              />
            </div>
          </CardContent>

          <CardContent className="border-t border-border/70 pt-5">
            <div className="space-y-2">
              <Label htmlFor="key-format">Custom key format (optional)</Label>
              <Input
                id="key-format"
                value={keyFormat}
                onChange={(e) => setKeyFormat(e.target.value.toUpperCase())}
                placeholder="NS-XXXX-XXXX-XXXX-XXXX-XXXX"
                maxLength={48}
                className="font-mono"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Template: <code className="rounded bg-muted px-1 py-0.5 font-mono">X</code>{" "}
                = random letter/digit,{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">#</code>{" "}
                = random digit, everything else stays literal. Leave empty to
                keep the classic prefix format{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                  {keyPrefix || "NS"}-XXXX-XXXX-XXXX-XXXX-XXXX
                </code>
                . Existing keys are never affected — the format only applies to
                newly generated keys.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {FORMAT_PRESETS.map((preset) => (
                  <button
                    key={preset.template}
                    type="button"
                    onClick={() => setKeyFormat(preset.template)}
                    className="cursor-pointer rounded-full border border-border bg-muted/40 px-3 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-muted"
                    title={preset.hint}
                  >
                    <code className="font-mono">{preset.template}</code>
                  </button>
                ))}
              </div>
              {sample.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Example key:
                  </span>
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">
                    {sample}
                  </code>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ─── Maintenance ─── */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Maintenance</CardTitle>
            <CardDescription>
              While maintenance is on, every /connect call is rejected with the
              message below — useful for updates or downtime.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Block all connects</p>
                <p className="text-xs text-muted-foreground">
                  Clients get 503 with your message.
                </p>
              </div>
              <Switch
                checked={maintenance}
                onCheckedChange={setMaintenance}
                aria-label="Maintenance mode"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="down-message">Message shown to clients</Label>
              <Input
                id="down-message"
                value={downMessage}
                onChange={(e) => setDownMessage(e.target.value)}
                placeholder="Server is under maintenance, come back later"
                maxLength={200}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={busy} className="cursor-pointer">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save settings
          </Button>
        </div>
      </form>

      {/* ─── Custom Endpoints (separate from settings form) ─── */}
      <CustomEndpointsSection />
    </div>
  );
}
