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
  Copy,
  Globe,
  KeyRound,
  Loader2,
  Save,
  User,
  Lock,
  Wifi,
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

export default function SettingsPage() {
  const settings = useQuery(api.nameserver.getSettings);
  const updateSettings = useMutation(api.nameserver.updateSettings);
  const profile = useQuery(api.nameserver.getMyProfile);
  const updateMyProfile = useMutation(api.nameserver.updateMyProfile);
  const changeMyPassword = useMutation(api.nameserver.changeMyPassword);

  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setProfileName(profile.name ?? "");
    }
  }, [profile]);

  const [keyPrice, setKeyPrice] = useState("10");
  const [defaultKeyUses, setDefaultKeyUses] = useState("0");
  const [defaultKeyHours, setDefaultKeyHours] = useState("0");
  const [keyPrefix, setKeyPrefix] = useState("NS");
  const [keyFormat, setKeyFormat] = useState("");
  const [maintenance, setMaintenance] = useState(false);
  const [downMessage, setDownMessage] = useState("");
  const [serverDomain, setServerDomain] = useState("");
  const [endpointAuthToken, setEndpointAuthToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
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
      setWebhookUrl(settings.webhookUrl ?? "");
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

  const handleProfileSave = async () => {
    setProfileBusy(true);
    try {
      await updateMyProfile({ name: profileName });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setProfileBusy(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Please fill in all password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 4) {
      toast.error("New password must be at least 4 characters");
      return;
    }
    setPasswordBusy(true);
    try {
      await changeMyPassword({ currentPassword, newPassword });
      toast.success("Password changed — sign in again with the new password");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPasswordBusy(false);
    }
  };

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
        webhookUrl: webhookUrl || undefined,
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
          {/* ─── Profile ─── */}
          <motion.div variants={cardVariants}>
            <Card className="border-border/70 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="size-4 text-primary" />
                  My Profile
                </CardTitle>
                <CardDescription>
                  Manage your display name and login credentials.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Name */}
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="profile-name">Display name</Label>
                    <Input
                      id="profile-name"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your name"
                      maxLength={80}
                    />
                  </div>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={profileBusy || profileName === (profile?.name ?? "")}
                      onClick={handleProfileSave}
                      className="cursor-pointer gap-1.5"
                    >
                      {profileBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                      Save
                    </Button>
                  </motion.div>
                </div>
                {/* Role & info */}
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                  <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">Username / Role</p>
                    <p className="truncate font-mono text-xs">
                      {profile?.email ?? "—"} <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">{profile?.role ?? "—"}</span>
                    </p>
                  </div>
                </div>
                {/* Change password */}
                <div className="space-y-3 border-t border-border/70 pt-5">
                  <p className="text-sm font-medium">Change password</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="current-pw">Current password</Label>
                      <Input
                        id="current-pw"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-pw">New password</Label>
                      <Input
                        id="new-pw"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-pw">Confirm</Label>
                      <div className="flex gap-2">
                        <Input
                          id="confirm-pw"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                        />
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={passwordBusy || !currentPassword || !newPassword}
                            onClick={handlePasswordChange}
                            className="cursor-pointer gap-1.5 shrink-0"
                          >
                            {passwordBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
                            Update
                          </Button>
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ─── Access URLs ─── */}
          <motion.div variants={cardVariants}>
            <Card className="border-border/70 overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wifi className="size-4 text-emerald-400" />
                  Access URLs
                </CardTitle>
                <CardDescription>
                  Your panel is accessible via the URLs below. IP-based access works on the local network.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const host = typeof window !== "undefined" ? window.location.hostname : "";
                  const port = typeof window !== "undefined" ? window.location.port : "";
                  const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";
                  const isLocal = host === "localhost" || host === "127.0.0.1" || /^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./.test(host);
                  const baseUrl = `${protocol}//${host}${port ? `:${port}` : ""}`;
                  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
                  const urls = [
                    { label: "Current session", url: baseUrl, isCurrent: true },
                    ...(convexUrl ? [{ label: "Convex backend", url: convexUrl, isCurrent: false }] : []),
                  ];
                  if (isLocal) {
                    urls.push({ label: "Network access (share this)", url: `${protocol}//${host}${port ? `:${port}` : ""}`, isCurrent: false });
                  }
                  return urls.map((u) => (
                    <div key={u.url} className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                      <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-muted-foreground">{u.label}</p>
                        <p className="truncate font-mono text-xs">{u.url}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard.writeText(u.url); toast.success("Copied!"); }}
                        className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        title="Copy URL"
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </div>
                  ));
                })()}
                <p className="text-[11px] text-muted-foreground pt-1">
                  The /connect endpoint is always public. Access the panel at <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">/owner</code> (owner) or <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">/admin</code> (admin) after sign-in.
                </p>
              </CardContent>
            </Card>
          </motion.div>

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
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="webhook-url">Webhook URL</Label>
                  <Input
                    id="webhook-url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://your-webhook-url.com/hook"
                    maxLength={512}
                  />
                  <p className="text-xs text-muted-foreground">
                    POST connect event data (key, IP, device, game) to this URL on every successful /connect. Leave empty to disable.
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

    </div>
  );
}
