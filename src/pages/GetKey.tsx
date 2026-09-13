import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/panel/CopyButton";
import { Turnstile } from "@/components/Turnstile";
import { api } from "@/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

const CONVEX_SITE =
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.replace(
    /\.convex\.cloud$/,
    ".convex.site",
  ) ?? "https://your-deployment.convex.site";

const FINGERPRINT_KEY = "panxcz.webid";

/** Stable per-browser id used only to count the daily free-key quota. */
function useFingerprint(): string {
  const [id, setId] = useState("");
  useEffect(() => {
    try {
      let stored = window.localStorage.getItem(FINGERPRINT_KEY);
      if (!stored) {
        stored =
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        window.localStorage.setItem(FINGERPRINT_KEY, stored);
      }
      setId(stored);
    } catch {
      setId(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    }
  }, []);
  return id;
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

export default function PublicGetKey() {
  const fingerprint = useFingerprint();
  const info = useQuery(api.public.getWebGetkeyInfo);
  const quota = useQuery(
    api.public.getWebQuota,
    fingerprint ? { fingerprint } : "skip",
  );
  const claimTrialKey = useAction(api.public.claimTrialKey);

  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{
    key: string;
    expiresAt: number;
    hours: number;
    serverName: string;
    remaining: number;
    maxPerDay: number;
  } | null>(null);

  const remaining = quota?.remaining ?? info?.maxPerDay ?? 0;
  const disabled =
    busy || token.length === 0 || remaining <= 0 || info?.enabled === false;

  const connectCommand = useMemo(
    () =>
      issued
        ? `curl -X POST ${CONVEX_SITE}/connect \\\n  -H 'Content-Type: application/json' \\\n  -d '{"license":"${issued.key}","device":"YOUR-DEVICE-ID"}'`
        : "",
    [issued],
  );

  const handleClaim = async () => {
    if (token.length === 0) {
      toast.error("Complete the human check first");
      return;
    }
    setBusy(true);
    try {
      const res = await claimTrialKey({ turnstileToken: token, fingerprint });
      setIssued({
        key: res.key,
        expiresAt: res.expiresAt,
        hours: res.hours,
        serverName: res.serverName,
        remaining: res.remaining,
        maxPerDay: res.maxPerDay,
      });
      setToken("");
      toast.success("Trial key generated — copy it now");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a key");
    } finally {
      setBusy(false);
    }
  };

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
          Panxcz · Free trial keys
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
            No account needed
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Get a free trial key
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[#a8b2c1]">
            One click, one key — valid for{" "}
            <span className="font-semibold text-white">{info?.hours ?? 5} hours</span>,
            bound to a single device. Up to{" "}
            <span className="font-semibold text-white">
              {info?.maxPerDay ?? 3} keys per day
            </span>
            .
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mx-auto mt-10 max-w-3xl"
        >
          <div className="glass rounded-2xl border border-white/10 p-6 sm:p-8">
            {info?.enabled === false ? (
              <div className="py-10 text-center">
                <ShieldCheck className="mx-auto size-8 text-[#a8b2c1]" />
                <p className="mt-4 font-medium">Free keys are paused right now</p>
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
                    <p className="text-xs text-[#a8b2c1]">Server</p>
                    <p className="font-semibold">{issued.serverName}</p>
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
                    Get another key
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <KeyRound className="size-4 text-[#4a9a8e]" />
                    <span className="font-medium">Human check required</span>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#a8b2c1]">
                    {remaining} / {quota?.maxPerDay ?? info?.maxPerDay ?? 3} left today
                  </span>
                </div>

                <Turnstile onToken={setToken} className="flex justify-center" />

                <Button
                  onClick={handleClaim}
                  disabled={disabled}
                  className="h-12 w-full cursor-pointer bg-[#4a9a8e] text-base font-semibold text-[#0f1419] transition-colors hover:bg-[#58b3a5] disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-5" />
                  )}
                  {remaining <= 0 ? "Daily limit reached" : "Generate my key"}
                </Button>

                <p className="text-center text-xs text-[#a8b2c1]">
                  Keys are capped per browser per day. Already have an account?{" "}
                  <Link to="/auth" className="text-[#7fd0c2] underline">
                    Sign in
                  </Link>
                </p>
              </div>
            )}
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
              title: "Abuse protection",
              desc: "Cloudflare Turnstile plus a strict daily cap per visitor.",
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
