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
import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function SettingsPage() {
  const settings = useQuery(api.nameserver.getSettings);
  const updateSettings = useMutation(api.nameserver.updateSettings);

  const [keyPrice, setKeyPrice] = useState("10");
  const [defaultKeyUses, setDefaultKeyUses] = useState("0");
  const [defaultKeyHours, setDefaultKeyHours] = useState("0");
  const [keyPrefix, setKeyPrefix] = useState("NS");
  const [maintenance, setMaintenance] = useState(false);
  const [downMessage, setDownMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) {
      setKeyPrice(String(settings.keyPrice));
      setDefaultKeyUses(String(settings.defaultKeyUses));
      setDefaultKeyHours(String(settings.defaultKeyHours));
      setKeyPrefix(settings.keyPrefix);
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
              the admin leaves them blank. The prefix controls the license key
              format, e.g. "NS" → NS-XXXX-… or "LIC" → LIC-XXXX-…
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
