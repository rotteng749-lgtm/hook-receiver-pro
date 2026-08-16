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
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { KeyRound, Loader2, Save } from "lucide-react";
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
    }
  }, [settings]);

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
      });
      toast.success("Settings saved — applied immediately");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setBusy(false);
    }
  };

  // Live sample of the custom format (recomputed as the owner types).
  const sample = useMemo(() => sampleKey(keyFormat), [keyFormat]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Owner-only. These apply to every admin and every generated key."
      />

      <form onSubmit={submit} className="space-y-6">
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
    </div>
  );
}
