import { Badge } from "@/components/ui/badge";
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
import { CopyButton } from "@/components/panel/CopyButton";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ExternalLink,
  Link2,
  Loader2,
  MousePointerClick,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const CONVEX_SITE =
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.replace(
    /\.convex\.cloud$/,
    ".convex.site",
  ) ?? "https://your-deployment.convex.site";

const stagger = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: "easeOut" as const },
  }),
};

export default function ShortenerPage() {
  const settings = useQuery(api.nameserver.getSettings);
  const links = useQuery(api.nameserver.listShortLinks);
  const saveSettings = useMutation(api.nameserver.updateShortenerSettings);
  const createShortLink = useAction(api.shortener.createShortLink);
  const deleteShortLink = useMutation(api.nameserver.deleteShortLink);

  const [apiKey, setApiKey] = useState("");
  const [adType, setAdType] = useState("1");
  const [savingKey, setSavingKey] = useState(false);

  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setApiKey(settings.shortenerApiKey ?? "");
      setAdType(String(settings.shortenerAdType ?? 1));
    }
  }, [settings]);

  const totalClicks = (links ?? []).reduce((sum, l) => sum + l.clicks, 0);

  const handleSaveKey = async () => {
    setSavingKey(true);
    try {
      await saveSettings({
        shortenerApiKey: apiKey,
        shortenerAdType: adType === "2" ? 2 : 1,
      });
      toast.success("Shortener credentials saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save credentials");
    } finally {
      setSavingKey(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Enter a URL to shorten");
      return;
    }
    setBusy(true);
    try {
      const rec = await createShortLink({
        url: url.trim(),
        alias: alias.trim() || undefined,
        adType: adType === "2" ? 2 : 1,
      });
      toast.success(`Short link created: ${rec.shortUrl}`);
      setUrl("");
      setAlias("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not shorten that URL");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteShortLink({ id: id as never });
      toast.success("Short link removed from the panel");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Shortener"
        description="Monetize links with ShrtFly — every short link is tracked and can be served from your own domain."
        actions={
          <Badge variant="outline" className="gap-1 font-normal">
            <MousePointerClick className="size-3" />
            {totalClicks} click{totalClicks === 1 ? "" : "s"}
          </Badge>
        }
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid gap-4 lg:grid-cols-2"
      >
        <motion.div custom={0} variants={stagger}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">ShrtFly credentials</CardTitle>
              <CardDescription>
                Get your API key from shrtfly.com → Developer → API. Stored in the database,
                never in the frontend.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="shortener-key">API key</Label>
                <Input
                  id="shortener-key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="ea3e5b3e3dcd0019ac9f395f2d8e4062"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shortener-ad">Ad type</Label>
                <Select value={adType} onValueChange={setAdType}>
                  <SelectTrigger id="shortener-ad">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — Mainstream</SelectItem>
                    <SelectItem value="2">2 — Adult</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveKey} disabled={savingKey}>
                {savingKey ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save credentials
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div custom={1} variants={stagger}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Create a short link</CardTitle>
              <CardDescription>
                Optional alias — leave empty and ShrtFly generates one. The result is stored
                so /s/&lt;alias&gt; can redirect and count clicks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="long-url">Long URL</Label>
                  <Input
                    id="long-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/download"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alias">Custom alias (optional)</Label>
                  <Input
                    id="alias"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="panxcz-loader"
                  />
                </div>
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Shorten
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API</CardTitle>
          <CardDescription>
            Call the shortener from scripts with your endpoint token or an API token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <pre className="flex-1 overflow-x-auto rounded-lg border border-border/70 bg-background/70 p-3 text-xs leading-relaxed">
              <code>{`curl -X POST ${CONVEX_SITE}/api/shorten \\
  -H 'Content-Type: application/json' \\
  -d '{"token":"YOUR_TOKEN","url":"https://example.com","alias":"my-link"}'`}</code>
            </pre>
            <CopyButton
              value={`curl -X POST ${CONVEX_SITE}/api/shorten -H 'Content-Type: application/json' -d '{"token":"YOUR_TOKEN","url":"https://example.com","alias":"my-link"}'`}
              label="Command"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Returns{" "}
            <code className="font-mono text-foreground">
              {`{ ok, result: { alias, original_url, shorten_url, stats_url } }`}
            </code>
            . Short links are served at{" "}
            <code className="font-mono text-foreground">{CONVEX_SITE}/s/&lt;alias&gt;</code>{" "}
            which 302-redirects to the monetized URL.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Short links</CardTitle>
          <CardDescription>Newest first — clicks update in real time.</CardDescription>
        </CardHeader>
        <CardContent>
          {links === undefined ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 py-10 text-center">
              <Link2 className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No short links yet.</p>
              <p className="max-w-sm text-xs text-muted-foreground/80">
                Add your ShrtFly API key above, then shorten your first URL.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {links.map((link) => (
                <div
                  key={link._id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm">{link.shortUrl}</span>
                      <Badge variant="secondary" className="font-normal">
                        {link.adType === 2 ? "adult" : "mainstream"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {link.originalUrl}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="gap-1 font-normal">
                      <MousePointerClick className="size-3" />
                      {link.clicks}
                    </Badge>
                    <CopyButton value={link.shortUrl} label="Short URL" />
                    <Button size="icon" variant="ghost" asChild>
                      <a
                        href={link.shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open short link"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(link._id)}
                      disabled={deleting === link._id}
                      aria-label="Delete short link"
                    >
                      {deleting === link._id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
