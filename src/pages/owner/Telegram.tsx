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
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Bot,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Unplug,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const COMMANDS = [
  { cmd: "/stats", desc: "Panel overview — servers, keys, connects, revenue" },
  { cmd: "/balance", desc: "Your balance and the key price" },
  { cmd: "/servers", desc: "List all servers with status" },
  { cmd: "/keys", desc: "Last 5 generated keys" },
  { cmd: "/server <code>", desc: "Server detail + recent connect results" },
  { cmd: "/genkey <code> [uses] [hours]", desc: "Generate a key — deducted from your balance" },
  { cmd: "/maintenance on|off [message]", desc: "Block or allow all /connect calls" },
  { cmd: "/id", desc: "Show your chat id (use this when binding)" },
];

export default function TelegramPage() {
  const status = useQuery(api.telegram.status);
  const refreshBotInfo = useMutation(api.telegram.refreshBotInfo);
  const enable = useMutation(api.telegram.enable);
  const disable = useMutation(api.telegram.disable);

  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState(false);

  if (status === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const botUrl = status.botUsername ? `https://t.me/${status.botUsername}` : null;
  const bound = status.ownerChatId !== null || status.envChatId !== null;

  const handleRefresh = async () => {
    setBusy(true);
    try {
      const r = await refreshBotInfo();
      toast.success(r.botUsername ? `Bot @${r.botUsername}` : "Bot info refreshed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch bot info");
    } finally {
      setBusy(false);
    }
  };

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await enable({ chatId });
      toast.success(
        `Bot bound to chat ${r.chatId}${r.webhookSet ? " · webhook set" : ""}`,
      );
      setChatId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to bind bot");
    } finally {
      setBusy(false);
    }
  };

  const handleUnbind = async () => {
    setBusy(true);
    try {
      await disable();
      toast.success("Bot unbound — webhook removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unbind bot");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Telegram bot"
        description="Control the panel from Telegram — bound to your chat at owner level."
      />

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Bot status</CardTitle>
          <CardDescription>
            The bot only answers the bound owner chat. All commands run with
            owner permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {status.botUsername ? (
                  <>
                    @{status.botUsername}
                    {botUrl && (
                      <a
                        href={botUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Open in Telegram <ExternalLink className="size-3" />
                      </a>
                    )}
                  </>
                ) : (
                  "Bot not configured yet"
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Token: configured (override with{" "}
                <code className="rounded bg-muted px-1 py-0.5">TELEGRAM_BOT_TOKEN</code>)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={handleRefresh}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Check bot
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Owner chat</span>
            </div>
            {bound ? (
              <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600/90">
                bound · {status.maskedOwnerChatId ?? status.envChatId}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-muted-foreground">
                not bound
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {bound ? (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Unbind</CardTitle>
            <CardDescription>
              Removes the webhook and stops the bot from answering your chat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="cursor-pointer text-destructive"
                  disabled={busy}
                >
                  <Unplug className="size-4" />
                  Unbind bot
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unbind the Telegram bot?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The webhook is deleted and the bound chat is cleared. You can
                    bind it again anytime.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
                    onClick={handleUnbind}
                  >
                    Unbind
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Connect the bot</CardTitle>
            <CardDescription>
              The bot only listens to one chat — yours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                Click{" "}
                <span className="font-medium text-foreground">Check bot</span> to
                fetch the bot username, then open it in Telegram (or press{" "}
                <span className="font-medium text-foreground">Open in Telegram</span>).
              </li>
              <li>
                Send <code className="rounded bg-muted px-1 py-0.5 text-xs">/id</code> to
                the bot and copy the number it replies with.
              </li>
              <li>Paste it below — the webhook is registered automatically.</li>
            </ol>
            <form onSubmit={handleBind} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="telegram-chat-id">Your Telegram chat id</Label>
                <Input
                  id="telegram-chat-id"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="e.g. 123456789"
                  inputMode="numeric"
                  required
                />
              </div>
              <Button type="submit" className="cursor-pointer" disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Bind as owner
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Tip: you can also pre-bind with the{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                TELEGRAM_OWNER_CHAT_ID
              </code>{" "}
              environment variable — no panel step needed.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Commands</CardTitle>
          <CardDescription>
            Owner-level — only your bound chat can run these.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border">
            {COMMANDS.map((c) => (
              <li
                key={c.cmd}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <code className="w-52 shrink-0 font-mono text-xs">{c.cmd}</code>
                <span className="text-xs text-muted-foreground">{c.desc}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
