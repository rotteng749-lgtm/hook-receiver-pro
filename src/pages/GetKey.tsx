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
  Gamepad2,
  Gift,
  IdCard,
  Link2,
  Loader2,
  MonitorSmartphone,
  MousePointerClick,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserRound,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

const HANDLE_STORAGE_KEY = "panxcz.getkey.handle";

// Public HTTP routes (/connect, /getkey) live on the Convex site URL.
const CONNECT_BASE = (import.meta.env.VITE_CONVEX_URL as string | undefined)
  ?.replace(/\.convex\.cloud$/, ".convex.site")
  .replace(/\/$/, "");

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut" as const },
  },
};

/** The handle is the user's own identity — keep it on their device. */
function useStoredHandle(): [string, (v: string) => void] {
  const [value, setValue] = useState("");
  useEffect(() => {
    try {
      setValue(window.localStorage.getItem(HANDLE_STORAGE_KEY) ?? "");
    } catch {
      /* private mode */
    }
  }, []);
  const update = (v: string) => {
    setValue(v);
    try {
      if (v.trim()) window.localStorage.setItem(HANDLE_STORAGE_KEY, v.trim());
      else window.localStorage.removeItem(HANDLE_STORAGE_KEY);
    } catch {
      /* private mode */
    }
  };
  return [value, update];
}

interface IssuedKey {
  key: string;
  expiresAt: number;
  hours: number;
  serverName: string;
  remaining: number;
  maxPerDay: number;
  coins: number;
}

interface AccountStatus {
  found: boolean;
  handle: string;
  coins: number;
  price: number;
  hours: number;
  usedToday: number;
  maxPerDay: number;
  remaining: number;
  banned: boolean;
  welcomeCoins: number;
  earnCoins: number;
  earnMaxPerDay: number;
  earnedToday: number;
  earnRemaining: number;
}

export default function PublicGetKey() {
  const [searchParams, setSearchParams] = useSearchParams();
  const info = useQuery(api.getkey.info);
  const accountStatus = useAction(api.getkey.accountStatus);
  const startClaim = useAction(api.getkey.startClaim);
  const redeemClaim = useMutation(api.getkey.redeemClaim);
  const startEarn = useAction(api.getkey.startEarn);
  const redeemEarn = useMutation(api.getkey.redeemEarn);

  const claimParam = searchParams.get("claim");
  const coinsParam = searchParams.get("coins");
  const claimHandle = searchParams.get("h");
  const [handle, setHandle] = useStoredHandle();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [productId, setProductId] = useState<string>("");
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [earnToken, setEarnToken] = useState("");
  const [earnBusy, setEarnBusy] = useState(false);
  const [earnNotice, setEarnNotice] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);

  const products = info?.products ?? [];
  const activeProduct =
    products.find((p) => p.id === productId) ?? products[0] ?? null;

  useEffect(() => {
    if (products.length > 0 && !products.some((p) => p.id === productId)) {
      setProductId(products[0].id);
    }
  }, [products, productId]);

  const coins = status?.coins ?? 0;
  const dailyLeft = status?.remaining ?? info?.maxPerDay ?? 3;
  const notEnough = status?.found === true && coins < (info?.price ?? 5);
  const disabled =
    busy ||
    token.length === 0 ||
    handle.trim().length < 3 ||
    products.length === 0 ||
    notEnough ||
    status?.banned === true ||
    dailyLeft <= 0 ||
    info?.enabled === false;

  // Look up the balance/quota whenever the handle changes.
  useEffect(() => {
    const h = handle.trim();
    if (h.length < 3) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(() => {
      accountStatus({ handle: h })
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {
          if (!cancelled) setStatus(null);
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [handle, accountStatus]);

  // Auto-redeem when arriving back from the short link with ?claim=<token>.
  useEffect(() => {
    if (!claimParam || issued) return;
    const h = (claimHandle ?? handle).trim();
    if (h.length < 3) {
      setRedeemError("Open this link in the same browser you started with.");
      return;
    }
    setBusy(true);
    setRedeemError(null);
    redeemClaim({ claimToken: claimParam, handle: h })
      .then((res) => {
        setHandle(h);
        setIssued({
          key: res.key,
          expiresAt: res.expiresAt,
          hours: res.hours,
          serverName: res.serverName,
          remaining: res.remaining,
          maxPerDay: res.maxPerDay,
          coins: res.coins,
        });
        setStatus((s) => (s ? { ...s, coins: res.coins, found: true } : s));
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
        searchParams.delete("h");
        setSearchParams(searchParams, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimParam]);

  // Auto-redeem when arriving back from the coin short link (?coins=<token>).
  useEffect(() => {
    if (!coinsParam) return;
    const h = (claimHandle ?? handle).trim();
    if (h.length < 3) {
      setEarnNotice({
        kind: "error",
        text: "Open this coin link in the same browser you started with.",
      });
      return;
    }
    setEarnBusy(true);
    setEarnNotice(null);
    redeemEarn({ claimToken: coinsParam, handle: h })
      .then((res) => {
        setHandle(h);
        setStatus((s) =>
          s
            ? {
                ...s,
                found: true,
                coins: res.coins,
                earnedToday: res.earnedToday,
                earnRemaining: res.earnRemaining,
              }
            : s,
        );
        setEarnNotice({
          kind: "ok",
          text: `+${res.added} coins added — you now have ${res.coins}.`,
        });
        toast.success(`+${res.added} Panxcz coins`);
      })
      .catch((err) => {
        setEarnNotice({
          kind: "error",
          text:
            err instanceof Error ? err.message : "Could not credit the coins.",
        });
      })
      .finally(() => {
        setEarnBusy(false);
        searchParams.delete("coins");
        searchParams.delete("h");
        setSearchParams(searchParams, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coinsParam]);

  const connectCommand = useMemo(
    () =>
      issued
        ? `curl -X POST ${CONNECT_BASE}/connect \\\n  -H 'Content-Type: application/json' \\\n  -d '{"license":"${issued.key}","device":"YOUR-DEVICE-ID"}'`
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
      const res = await startClaim({
        turnstileToken: token,
        handle: handle.trim(),
        serverId: activeProduct?.id,
        origin: window.location.origin,
      });
      setToken("");
      // Continue immediately — the short link is the gate, not a detour.
      window.location.href = res.shortUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the claim");
      setBusy(false);
    }
  };

  const handleEarn = async () => {
    const captcha = earnToken || token;
    if (captcha.length === 0) {
      toast.error("Complete the human check first");
      return;
    }
    setEarnBusy(true);
    setEarnNotice(null);
    try {
      const res = await startEarn({
        turnstileToken: captcha,
        handle: handle.trim(),
        origin: window.location.origin,
      });
      setEarnToken("");
      setToken("");
      // The short link is the gate — continue straight away.
      window.location.href = res.shortUrl;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start the coin link",
      );
      setEarnBusy(false);
    }
  };

  const botLink = info?.botUsername
    ? `https://t.me/${info.botUsername}`
    : "https://t.me/";

  const earnCoins = info?.earnCoins ?? 5;
  const earnMaxPerDay = status?.earnMaxPerDay ?? info?.earnMaxPerDay ?? 3;
  const earnLeft = status?.earnRemaining ?? earnMaxPerDay;
  // The coin flow needs its own human-check token. It can reuse the one from
  // the key step, so the widget below only shows when there isn't one yet.
  const hasCaptcha = earnToken.length > 0 || token.length > 0;
  const earnDisabled =
    earnBusy ||
    handle.trim().length < 3 ||
    earnCoins <= 0 ||
    earnMaxPerDay <= 0 ||
    earnLeft <= 0 ||
    !hasCaptcha ||
    status?.banned === true ||
    info?.enabled === false;

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
            <Coins className="size-3.5" />
            {info?.price ?? 5} Panxcz coins · {info?.hours ?? 5} hour key
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Get a trial key
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[#a8b2c1]">
            Pick your game, spend{" "}
            <span className="font-semibold text-white">
              {info?.price ?? 5} coins
            </span>
            , pass through one short link — and a key valid for{" "}
            <span className="font-semibold text-white">
              {info?.hours ?? 5} hours
            </span>{" "}
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
                    <p className="text-xs text-[#a8b2c1]">Product</p>
                    <p className="font-semibold">{issued.serverName}</p>
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
                    Expires {new Date(issued.expiresAt).toLocaleString()} ·{" "}
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
                {redeemError ? (
                  <>
                    <AlertTriangle className="mx-auto size-8 text-amber-400" />
                    <p className="text-sm text-red-400">{redeemError}</p>
                    <Button
                      variant="outline"
                      className="cursor-pointer border-white/15 bg-transparent text-white hover:bg-white/10"
                      onClick={() => {
                        setRedeemError(null);
                        searchParams.delete("claim");
                        searchParams.delete("h");
                        setSearchParams(searchParams, { replace: true });
                      }}
                    >
                      Back
                    </Button>
                  </>
                ) : (
                  <>
                    <Loader2 className="mx-auto size-8 animate-spin text-[#4a9a8e]" />
                    <p className="font-medium">Verifying your claim…</p>
                    <p className="text-sm text-[#a8b2c1]">
                      Almost there — your key unlocks right after this.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-7">
                {/* Step 1 — account (Telegram id / handle) */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <UserRound className="size-4 text-[#4a9a8e]" />
                      1 · Your account
                    </p>
                    {checking ? (
                      <Loader2 className="size-4 animate-spin text-[#4a9a8e]" />
                    ) : (
                      status && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#a8b2c1]">
                          {status.banned ? (
                            "suspended"
                          ) : status.found ? (
                            <>
                              <Coins className="mr-1 inline size-3 text-[#7fd0c2]" />
                              {status.coins} coins · {status.remaining}/
                              {status.maxPerDay} today
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-1 inline size-3 text-[#7fd0c2]" />
                              new account · +{status.welcomeCoins} coins
                            </>
                          )}
                        </span>
                      )
                    )}
                  </div>
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="Telegram ID (from the bot's /id) or @username"
                    className="h-11 border-white/10 bg-black/30 font-mono text-sm"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="flex items-start gap-1.5 text-xs text-[#6b7a8d]">
                    <IdCard className="mt-0.5 size-3.5 shrink-0" />
                    New here? Your account is created automatically with{" "}
                    {status?.welcomeCoins ?? info?.welcomeCoins ?? 5} free coins —
                    one trial key. Earn more coins below (one short link pass ={" "}
                    {info?.earnCoins ?? 5} coins) or ask the owner for a top-up.
                  </p>
                  {status?.banned === true && (
                    <p className="flex items-start gap-1.5 text-xs text-red-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      This account is suspended — contact support.
                    </p>
                  )}
                  {notEnough && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      Not enough coins — a key costs {status?.price ?? 5} but this
                      account has {coins}. Earn more with the “Get coins” button
                      below, or ask the owner for a top-up.
                    </p>
                  )}
                </div>

                {/* Step 2 — product */}
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Gamepad2 className="size-4 text-[#4a9a8e]" />
                    2 · Choose your product
                  </p>
                  {products.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-[#a8b2c1]">
                      No products are available right now — check back soon.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {products.map((product) => {
                        const active = product.id === activeProduct?.id;
                        return (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => setProductId(product.id)}
                            className={`cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                              active
                                ? "border-[#4a9a8e]/60 bg-[#4a9a8e]/10"
                                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                            }`}
                          >
                            <p className="flex items-center gap-2 font-semibold">
                              {product.name}
                              {active && (
                                <BadgeCheck className="size-4 text-[#7fd0c2]" />
                              )}
                            </p>
                            <p className="mt-1 font-mono text-xs text-[#a8b2c1]">
                              {product.code}
                            </p>
                            <p className="mt-2 text-xs text-[#6b7a8d]">
                              {info?.hours ?? 5}h key · {info?.price ?? 5} coins
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Step 3 — human check */}
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4 text-[#4a9a8e]" />
                    3 · Human check
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
                    : `Get my key — ${info?.price ?? 5} coins`}
                </Button>

                <p className="flex items-center justify-center gap-2 text-center text-xs text-[#a8b2c1]">
                  <MousePointerClick className="size-3.5" />
                  You'll pass through a short supported link, then your key unlocks
                  right here.
                </p>
              </div>
            )}
          </div>

          {/* Earn coins (short-link) card */}
          <div className="glass mt-6 rounded-2xl border border-[#4a9a8e]/25 p-6">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border border-[#4a9a8e]/30 bg-[#4a9a8e]/10 p-2">
                  <Gift className="size-5 text-[#7fd0c2]" />
                </div>
                <div>
                  <p className="font-semibold">Get coins</p>
                  <p className="mt-1 max-w-md text-sm text-[#a8b2c1]">
                    Pass one short link and earn{" "}
                    <span className="font-semibold text-white">
                      +{earnCoins} Panxcz coins
                    </span>{" "}
                    — that&apos;s one {info?.hours ?? 5}-hour key. Up to{" "}
                    {earnMaxPerDay} link{earnMaxPerDay === 1 ? "" : "s"} per day.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[#a8b2c1]">
                      <Coins className="size-3 text-[#7fd0c2]" />
                      {status?.found ? `${coins} coins` : "balance after first login"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[#a8b2c1]">
                      <Link2 className="size-3 text-[#7fd0c2]" />
                      {status?.earnedToday ?? 0}/{earnMaxPerDay} link passes today
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-col items-stretch gap-3 sm:w-56">
                {issued !== null || token.length === 0 ? (
                  <Turnstile onToken={setEarnToken} className="flex justify-center" />
                ) : null}
                <Button
                  onClick={handleEarn}
                  disabled={earnDisabled}
                  title={
                    !hasCaptcha
                      ? "Complete the human check above to earn coins"
                      : undefined
                  }
                  className="h-11 cursor-pointer bg-[#4a9a8e] font-semibold text-[#0f1419] transition-colors hover:bg-[#58b3a5] disabled:opacity-40"
                >
                  {earnBusy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Coins className="mr-2 size-4" />
                  )}
                  {earnLeft <= 0
                    ? "Daily earn limit reached"
                    : `Get +${earnCoins} coins`}
                </Button>
                {!hasCaptcha &&
                  earnCoins > 0 &&
                  earnLeft > 0 &&
                  status?.banned !== true &&
                  info?.enabled !== false && (
                    <p className="text-center text-[11px] text-[#6b7a8d]">
                      Pass the human check above, then tap to earn.
                    </p>
                  )}
                <a
                  href={botLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/15 text-sm font-medium text-white transition-colors hover:bg-white/10"
                >
                  <Send className="size-4" />
                  Telegram top-up
                </a>
              </div>
            </div>

            {earnNotice && (
              <p
                className={`mt-4 flex items-start gap-1.5 rounded-xl border p-3 text-xs ${
                  earnNotice.kind === "ok"
                    ? "border-[#4a9a8e]/40 bg-[#4a9a8e]/10 text-[#9be0d3]"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                {earnNotice.kind === "ok" ? (
                  <BadgeCheck className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                )}
                {earnNotice.text}
              </p>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-[#6b7a8d]">
              Coins are also credited by the owner after payment — open the
              Telegram bot, send your handle and you can top up there too.
            </p>
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
              desc: "Claims burn coins from your account and pass a one-use link.",
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

        {products.length > 0 && (
          <p className="mx-auto mt-8 flex max-w-3xl items-center justify-center gap-2 text-center text-xs text-[#6b7a8d]">
            <ExternalLink className="size-3.5" />
            Available now: {products.map((p) => p.name).join(" · ")}
          </p>
        )}
      </main>
    </div>
  );
}
