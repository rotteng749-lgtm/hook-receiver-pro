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
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Globe,
  KeyRound,
  Loader2,
  Plug,
  Plus,
  Save,
  Shield,
  Sparkles,
  Trash2,
  Zap,
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

function sampleKey(format: string): string {
  const template = format.trim().toUpperCase();
  if (!template.includes("X") && !template.includes("#")) return "";
  let out = "";
  for (const ch of template) {
    if (ch === "X") out += SAMPLE_ALPHABET[Math.floor(Math.random() * SAMPLE_ALPHABET.length)];
    else if (ch === "#") out += SAMPLE_DIGITS[Math.floor(Math.random() * SAMPLE_DIGITS.length)];
    else out += ch;
  }
  return out;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PATCH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  ANY: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

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
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <div className="relative overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-background to-fuchsia-500/5">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -top-24 -right-24 size-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-32 rounded-full bg-fuchsia-500/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-center justify-between border-b border-violet-500/10 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/15">
                <Plug className="size-4.5 text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Custom Endpoints</h3>
                <p className="text-xs text-muted-foreground">
                  Create your own HTTP endpoints at <code className="font-mono text-violet-400">/hook/&lt;path&gt;</code>
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant={showForm ? "destructive" : "default"}
              size="sm"
              onClick={() => setShowForm(!showForm)}
              className="cursor-pointer shrink-0 gap-1.5"
            >
              <Plus className={`size-3.5 transition-transform duration-200 ${showForm ? "rotate-45" : ""}`} />
              {showForm ? "Cancel" : "New endpoint"}
            </Button>
          </div>

          <div className="px-6 py-4 space-y-3">
            {/* Existing endpoints */}
            {!showForm && endpoints && endpoints.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/10">
                  <Zap className="size-6 text-violet-400/50" />
                </div>
                <p className="text-sm text-muted-foreground">No endpoints yet</p>
                <p className="text-xs text-muted-foreground/60">Create one to get started — each endpoint returns your configured response.</p>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {endpoints && endpoints.map((ep) => (
                <motion.div
                  key={ep._id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="group flex items-center justify-between rounded-lg border border-border/60 bg-card/50 px-4 py-3 transition-all hover:border-violet-500/30 hover:bg-card"
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
                      {ep.authRequired && (
                        <span className="flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                          <Shield className="size-2.5" /> Auth
                        </span>
                      )}
                    </div>
                    {ep.contentType && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground/50 font-mono">{ep.contentType}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-3">
                    <Switch
                      checked={ep.enabled}
                      onCheckedChange={() => handleToggle(ep._id, ep.enabled)}
                      aria-label={`Toggle ${ep.path}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(ep._id, ep.path)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* New endpoint form */}
            <AnimatePresence>
              {showForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Path</Label>
                        <div className="flex items-center gap-0">
                          <span className="rounded-l-md border border-r-0 border-border bg-muted/80 px-2 py-1.5 text-xs text-muted-foreground">
                            /hook/
                          </span>
                          <Input
                            value={epPath}
                            onChange={(e) => setEpPath(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                            placeholder="my-endpoint"
                            maxLength={64}
                            className="rounded-l-none font-mono text-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Method</Label>
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
                        <Label className="text-xs font-medium">Status code</Label>
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
                      <Label className="text-xs font-medium">Content-Type</Label>
                      <Input
                        value={epContentType}
                        onChange={(e) => setEpContentType(e.target.value)}
                        placeholder="application/json"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Response body</Label>
                      <Textarea
                        value={epBody}
                        onChange={(e) => setEpBody(e.target.value)}
                        rows={4}
                        className="font-mono text-xs"
                        placeholder='{"ok":true, "status":"success"}'
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={epAuth}
                          onChange={(e) => setEpAuth(e.target.checked)}
                          className="rounded border-border"
                        />
                        <Shield className="size-3.5 text-amber-400" />
                        Require auth token
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreate}
                        disabled={busy || epPath.length === 0}
                        className="cursor-pointer bg-violet-600 hover:bg-violet-700 text-white"
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                        Create endpoint
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
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
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
          {/* ─── Server Domain ─── */}
          <motion.div variants={cardVariants}>
            <Card className="border-border/70 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="size-4 text-blue-400" />
                  Server Domain
                </CardTitle>
                <CardDescription>
                  Set a short custom domain for your server. Leave empty to use the default Convex URL.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="server-domain">Custom domain</Label>
                  <Input
                    id="server-domain"
                    value={serverDomain}
                    onChange={(e) => setServerDomain(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ""))}
                    placeholder="panxcz"
                    maxLength={63}
                  />
                  <p className="text-xs text-muted-foreground">
                    e.g. <code className="rounded bg-muted px-1 py-0.5 font-mono">panxcz</code> → <code className="rounded bg-muted px-1 py-0.5 font-mono">https://panxcz.site</code>
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
                    Bearer token for custom endpoints with auth enabled.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── Key Pricing ─── */}
          <motion.div variants={cardVariants}>
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Key pricing & defaults</CardTitle>
                <CardDescription>
                  Generating a key always deducts the price from the generator's balance.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="key-price">Key price (balance per key)</Label>
                  <Input id="key-price" type="number" min={0} value={keyPrice} onChange={(e) => setKeyPrice(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-uses">Default max uses (0 = unlimited)</Label>
                  <Input id="default-uses" type="number" min={0} value={defaultKeyUses} onChange={(e) => setDefaultKeyUses(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-hours">Default lifetime (hours, 0 = never)</Label>
                  <Input id="default-hours" type="number" min={0} value={defaultKeyHours} onChange={(e) => setDefaultKeyHours(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="key-prefix">License key prefix (A-Z, 0-9)</Label>
                  <Input id="key-prefix" value={keyPrefix} onChange={(e) => setKeyPrefix(e.target.value.toUpperCase())} placeholder="NS" maxLength={10} />
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
                    Template: <code className="rounded bg-muted px-1 py-0.5 font-mono">X</code> = random letter/digit, <code className="rounded bg-muted px-1 py-0.5 font-mono">#</code> = random digit. Leave empty for prefix format.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {FORMAT_PRESETS.map((preset) => (
                      <motion.button
                        key={preset.template}
                        type="button"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setKeyFormat(preset.template)}
                        className="cursor-pointer rounded-full border border-border bg-muted/40 px-3 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-muted"
                        title={preset.hint}
                      >
                        <code className="font-mono">{preset.template}</code>
                      </motion.button>
                    ))}
                  </div>
                  <AnimatePresence mode="wait">
                    {sample.length > 0 && (
                      <motion.div
                        key={sample}
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
                      >
                        <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Example key:</span>
                        <code className="min-w-0 flex-1 truncate font-mono text-xs">{sample}</code>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── Maintenance ─── */}
          <motion.div variants={cardVariants}>
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Maintenance</CardTitle>
                <CardDescription>
                  Block all /connect calls during updates or downtime.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Block all connects</p>
                    <p className="text-xs text-muted-foreground">Clients get 503 with your message.</p>
                  </div>
                  <Switch checked={maintenance} onCheckedChange={setMaintenance} aria-label="Maintenance mode" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="down-message">Message shown to clients</Label>
                  <Input id="down-message" value={downMessage} onChange={(e) => setDownMessage(e.target.value)} placeholder="Server is under maintenance" maxLength={200} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        <div className="flex justify-end">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button type="submit" disabled={busy} className="cursor-pointer gap-2">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save settings
            </Button>
          </motion.div>
        </div>
      </form>

      {/* ─── Custom Endpoints (visually distinct, not inside the form) ─── */}
      <CustomEndpointsSection />
    </div>
  );
}
