import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/panel/CopyButton";
import { Input } from "@/components/ui/input";
import { Turnstile } from "@/components/Turnstile";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Clock,
  Coins,
  ExternalLink,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  MousePointerClick,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

const TOKEN_STORAGE_KEY = "panxcz.systemToken";

/** The token is the user's own; keep it on their device for convenience. */
function useStoredToken(): [string, (v: string) => void] {
  const [value, setValue] = useState("");
  useEffect(() => {
    try {
      setValue(window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
    } catch {
      /* private mode */
    }
  }, []);
  const update = (v: string) => {
    setValue(v);
    try {
      if (v.trim()) window.localStorage.setItem(TOKEN_STORAGE_KEY, v.trim());
      else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* private mode */
    }
  };
  return [value, update];
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

interface IssuedKey {
  key: string;
  expiresAt: number;
  hours: number;
  serverName: string;
  remaining: number;
  maxPerDay: number;
  coins: number;
}

interface TokenStatus {
  valid: boolean;
  coins: number;
  price: number;
  used: number;
  maxPerDay: number;
  remaining: number;
}

export default function PublicGetKey() {
  const [searchParams, setSearchParams] = useSearchParams();
  const info = useQuery(api.public.getWebGetkeyInfo);
  const tokenStatus = useAction(api.public.getWebTokenStatus);
  const startTrialClaim = useAction(api.public.startTrialClaim);
  const redeemClaim = useMutation(api.public.redeemClaim);

  const claimParam = searchParams.get("claim");
  const [systemToken, setSystemToken] = useStoredToken();
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [pendingClaim, setPendingClaim] = useState<{
    token: string;
    shortUrl: string;
  } | null>(null);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [token, setToken] = useState("");

  const dailyLeft = status?.remaining ?? info?.maxPerDay ?? 3;
  const disabled =
    busy ||
    token.length === 0 ||
    systemToken.trim().length < 8 ||
    (status !== null && (!status.valid || status.coins < status.price)) ||
    dailyLeft <= 0 ||
    info?.enabled === false;

  // Look up the token's balance/quota whenever it changes.
  useEffect(() => {
    const t = systemToken.trim();
    if (t.length < 8) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    tokenStatus({ systemToken: t })
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [systemToken, tokenStatus]);

  // Auto-redeem when arriving back from the short link with ?claim=<token>.
  useEffect(() => {
    if (!claimParam || busy || issued) return;
    const t = systemToken.trim();
    if (t.length < 8) {
      setRedeemError("Paste your system token first, then reopen the claim link.");
      return;
    }
    setBusy(true);
    setRedeemError(null);
    redeemClaim({ claimToken: claimParam, systemToken: t })
      .then((res) => {
        setIssued({
          key: res.key,
          expiresAt: res.expiresAt,
          hours: res.hours,
          serverName: res.serverName,
          remaining: res.remaining,
          maxPerDay: res.maxPerDay,
          coins: res.coins,
        });
        setStatus((s) => (s ? { ...s, coins: res.coins } : s));
        toast.success("Trial key generated — copy it now");
      })
      .catch((err) => {
        setRedeemError(
          err instanceof Error ? err.message : "Could not redeem the claim.",
        );
      })
      .finally(() => {
        setBusy(false);
        // Clean the URL so a refresh doesn't double-redeem.
        searchParams.delete("claim");
        setSearchParams(searchParams, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimParam, systemToken]);

  const connectCommand = useMemo(
    () =>
      issued
        ? `curl -X POST https://brave-lobster-493.convex.site/connect \\\n  -H 'Content-Type: application/json' \\\n  -d '{"license":"${issued.key}","device":"YOUR-DEVICE-ID"}'`
        : "",
    [issued],
  );

  const handleStart = async () => {
    if (token.length === 0) {
      toast.error("Complete the human check first");
      return;
    }
    setBusy(true);
    setRedeemError(null);
    try {
      const res = await startTrialClaim({
        turnstileToken: token,
        systemToken: systemToken.trim(),
        origin: window.location.origin,
      });
      setToken("");
      setPendingClaim({ token: res.claimToken, shortUrl: res.shortUrl });
      // Continue immediately — the short link is the gate, not a detour.
      window.location.href = res.shortUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the claim");
    } finally {
      setBusy(false);
    }
  };

  const botLink = info?.botUsername
    ? `https://t.me/${info.botUsername}`
    : "https://t.me/";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0f1419] text-[#e7edf3]">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(74,154,142,0.22),transparent)]" />
      <div className="pointer-events-none absolute -left-32 top-1/3 size-[420px] rounded-full bg-[#4a9a8e]/10 blur-3xl" />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-[#a8b2c1] transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#a8b2c1]">
          Panxcz · Trial keys
        </span>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-20">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mx-auto mt-6 max-w-2xl text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[#4a9a8e]/30 bg-[#4a9a8e]/10 px-3 py-1 text-xs font-medium text-[#7fd0c2]">
            <Sparkles className="size-3.5" />
            Coin system — {info?.price ?? 10} coins per claim
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Get a trial key
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[#a8b2c1]">
            Paste your system token, spend{" "}
            <span className="font-semibold text-white">{info?.price ?? 10} coins</span>,
            pass through one short link — and a key valid for{" "}
            <span className="font-semibold text-white">{info?.hours ?? 5} hours</span>{" "}
            is yours.
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mx-auto mt-10 max-w-3xl"
        >
          <div className="glass space-y-6 rounded-2xl border border-white/10 p-6 sm:p-8">
            {info?.enabled === false ? (
              <div className="py-10 text-center">
                <ShieldCheck className="mx-auto size-8 text-[#a8b2c1]" />
                <p className="mt-4 font-medium">Key claims are paused right now</p>
                <p className="mt-1 text-sm text-[#a8b2c1]">
                  The owner disabled the public key page. Try again later.
                </p>
              </div>
            ) : issued ? (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium text-[#7fd0c2]">
                  <BadgeCheck className="size-4" />
                  Your trial key is ready
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-lg tracking-tight">
                    {issued.key}
                  </code>
                  <CopyButton value={issued.key} label="Key" />
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs text-[#a8b2c1]">Valid for</p>
                    <p className="font-semibold">{issued.hours} hours</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs text-[#a8b2c1]">Expires</p>
                    <p className="font-semibold">
                      {new Date(issued.expiresAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="flex items-center gap-1 text-xs text-[#a8b2c1]">
                      <Coins className="size-3" /> Coins left
                    </p>
                    <p className="font-semibold">{issued.coins}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs text-[#a8b2c1]">
                    <Terminal className="size-3.5" />
                    Connect your app with it
                  </p>
                  <div className="flex items-start gap-2">
                    <pre className="flex-1 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs leading-relaxed">
                      <code>{connectCommand}</code>
                    </pre>
                    <CopyButton value={connectCommand} label="Command" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className="text-xs text-[#a8b2c1]">
                    {issued.remaining} of {issued.maxPerDay} keys left today
                  </p>
                  <Button
                    variant="outline"
                    className="cursor-pointer border-white/15 bg-transparent text-white hover:bg-white/10"
                    onClick={() => setIssued(null)}
                  >
                    Claim another key
                  </Button>
                </div>
              </div>
            ) : claimParam ? (
              /* --- Returning from the short link: redeeming --- */
              <div className="space-y-5 py-6 text-center">
                <Loader2 className="mx-auto size-8 animate-spin text-[#4a9a8e]" />
                <p className="font-medium">Verifying your claim…</p>
                {redeemError ? (
                  <div className="space-y-4">
                    <p className="text-sm text-red-400">{redeemError}</p>
                    <Button
                      variant="outline"
                      className="cursor-pointer border-white/15 bg-transparent text-white hover:bg-white/10"
                      onClick={() => {
                        setRedeemError(null);
                        searchParams.delete("claim");
                        setSearchParams(searchParams, { replace: true });
                      }}
                    >
                      Back
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-[#a8b2c1]">
                    Almost there — your key unlocks right after this.
                  </p>
                )}
              </div>
            ) : pendingClaim ? (
              /* --- Link ready (fallback view if the redirect is blocked) --- */
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium text-[#7fd0c2]">
                  <MousePointerClick className="size-4" />
                  One more step — continue through the link
                </div>
                <p className="text-sm text-[#a8b2c1]">
                  Your claim is ready and valid for 15 minutes. If the page didn't
                  continue automatically, tap the button below to proceed.
                </p>
                <Button
                  onClick={() =>
                    pendingClaim && window.location.assign(pendingClaim.shortUrl)
                  }
                  className="h-12 w-full cursor-pointer bg-[#4a9a8e] text-base font-semibold text-[#0f1419] transition-colors hover:bg-[#58b3a5]"
                >
                  <ExternalLink className="mr-2 size-5" />
                  Continue to my key
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Step 1 — system token */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <KeyRound className="size-4 text-[#4a9a8e]" />
                      1 · System token
                    </p>
                    {status && (
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#a8b2c1]">
                        {status.valid ? (
                          <>
                            <Coins className="mr-1 inline size-3 text-[#7fd0c2]" />
                            {status.coins} coins · {status.remaining}/
                            {status.maxPerDay} today
                          </>
                        ) : (
                          "invalid token"
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={systemToken}
                      onChange={(e) => setSystemToken(e.target.value)}
                      placeholder="Paste your API token (from the panel's API page)"
                      className="h-11 border-white/10 bg-black/30 font-mono text-sm"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {checking && (
                      <Loader2 className="mt-3.5 size-5 shrink-0 animate-spin text-[#4a9a8e]" />
                    )}
                  </div>
                  {status?.valid === false && systemToken.trim().length >= 8 && (
                    <p className="text-xs text-red-400">
                      That token is invalid or expired — create one in the panel
                      (API page).
                    </p>
                  )}
                  {status && status.valid && status.coins < status.price && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      Not enough coins — a claim costs {status.price} but this token
                      has {status.coins}. Top up below.
                    </p>
                  )}
                </div>

                {/* Step 2 — human check */}
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4 text-[#4a9a8e]" />
                    2 · Human check
                  </p>
                  <Turnstile onToken={setToken} className="flex justify-center" />
                </div>

                <Button
                  onClick={handleStart}
                  disabled={disabled}
                  className="h-12 w-full cursor-pointer bg-[#4a9a8e] text-base font-semibold text-[#0f1419] transition-colors hover:bg-[#58b3a5] disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-5" />
                  )}
                  {dailyLeft <= 0
                    ? "Daily limit reached"
                    : `Generate my key — ${info?.price ?? 10} coins`}
                </Button>

                <p className="text-center text-xs text-[#a8b2c1]">
                  You'll pass through a short supported link, then your key unlocks
                  right here.
                </p>
              </div>
            )}
          </div>

          {/* Top-up card */}
          <div className="glass mt-6 rounded-2xl border border-white/10 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Coins className="mt-0.5 size-5 text-[#4a9a8e]" />
                <div>
                  <p className="font-medium">Need more coins?</p>
                  <p className="mt-1 max-w-md text-sm text-[#a8b2c1]">
                    Coins top up through the owner — open the support channel,
                    send your token label + amount, and it gets credited after
                    payment.
                  </p>
                </div>
              </div>
              <a
                href={botLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#4a9a8e] px-4 text-sm font-semibold text-[#0f1419] transition-colors hover:bg-[#58b3a5]"
              >
                <Send className="size-4" />
                Contact support
              </a>
            </div>
            <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-[#6b7a8d]">
              📌 Disclaimer: The information shared in this channel is for
              educational purposes only and is not professional advice. Please
              verify facts and consult qualified professionals for specific
              issues.
            </p>
          </div>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3"
        >
          {[
            {
              icon: Clock,
              title: `${info?.hours ?? 5}-hour access`,
              desc: "Enough to test the loader end to end before you buy.",
            },
            {
              icon: MonitorSmartphone,
              title: "1 key = 1 device",
              desc: "The key binds to the first device that connects with it.",
            },
            {
              icon: ShieldCheck,
              title: "No bypass",
              desc: "Claims burn coins from your token and pass a one-use link.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="glass rounded-xl border border-white/10 p-5"
            >
              <card.icon className="size-5 text-[#4a9a8e]" />
              <p className="mt-3 font-medium">{card.title}</p>
              <p className="mt-1 text-sm text-[#a8b2c1]">{card.desc}</p>
            </div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
