import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { motion } from "framer-motion";
import {
  ArrowRight,
  History,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
} from "lucide-react";
import { Link } from "react-router";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.08 * i, ease: "easeOut" as const },
  }),
};

const features = [
  {
    icon: Plug,
    title: "Custom endpoints",
    body: "Every hook gets its own public URL at /api/hook/<path> — point any script or tool at it with zero configuration.",
  },
  {
    icon: ShieldCheck,
    title: "Token-protected",
    body: "A random secret is generated per hook. Validate calls via header, Bearer token, or the ?bypass= query param.",
  },
  {
    icon: SlidersHorizontal,
    title: "Configurable responses",
    body: "Decide exactly what callers see: status code 200, 403, 404 or anything else, plus a JSON or plain-text body.",
  },
  {
    icon: History,
    title: "Full request history",
    body: "Every hit is captured with method, headers, query params, and parsed body — JSON, form data, or multipart.",
  },
];

const steps = [
  {
    num: "01",
    title: "Create a hook",
    body: "Name it, pick a path and allowed methods. A secret token is generated automatically.",
  },
  {
    num: "02",
    title: "Point your script at it",
    body: "Copy the generated URL into your cheat, script, or automation. Send the token however is easiest.",
  },
  {
    num: "03",
    title: "Watch it roll in",
    body: "Requests appear in the admin panel instantly — inspect bodies, headers, and how your caller behaves.",
  },
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const dashboardHref = isAuthenticated
    ? "/dashboard"
    : "/auth?returnTo=%2Fdashboard";
  const signInHref = isAuthenticated ? "/dashboard" : "/auth";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="Hooklog" width={30} height={30} className="rounded-md" />
            <span className="text-[15px] font-bold tracking-tight">Hooklog</span>
          </Link>
          <nav className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button asChild size="sm" className="cursor-pointer">
                <Link to="/dashboard">
                  Open dashboard <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="cursor-pointer text-muted-foreground">
                  <Link to={signInHref}>Sign in</Link>
                </Button>
                <Button asChild size="sm" className="cursor-pointer">
                  <Link to="/auth">
                    Get started <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,oklch(0.94_0.03_178/0.55),transparent)]" />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={0}
            className="mx-auto max-w-3xl text-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              Webhook receiver for scripts &amp; automation
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
              Receive webhooks.
              <br />
              <span className="text-primary">Inspect everything.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              A dead-simple admin panel that exposes public hook URLs, answers
              with the response you configure, and logs every request — method,
              headers, and body — so you can see exactly what your scripts send.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full cursor-pointer sm:w-auto">
                <Link to={dashboardHref}>
                  {isLoading ? "Loading…" : isAuthenticated ? "Open dashboard" : "Create your first hook"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full cursor-pointer sm:w-auto">
                <Link to="/dashboard/requests">View live requests</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card · deployed and ready in minutes
            </p>
          </motion.div>

          {/* Terminal mockup */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={1}
            className="mx-auto mt-14 max-w-3xl"
          >
            <div className="overflow-hidden rounded-xl border border-border bg-zinc-950 shadow-none">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
                <span className="size-2.5 rounded-full bg-red-400/80" />
                <span className="size-2.5 rounded-full bg-amber-400/80" />
                <span className="size-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-3 font-mono text-[11px] text-zinc-400">
                  script —→ POST /api/hook/license-check
                </span>
              </div>
              <div className="space-y-2.5 p-5 font-mono text-[12.5px] leading-relaxed sm:text-[13px]">
                <p className="text-zinc-500">
                  <span className="text-zinc-300">$</span> curl -X POST{" "}
                  <span className="text-teal-300">…/api/hook/license-check</span> \
                </p>
                <p className="text-zinc-500">
                  {"  "}-H <span className="text-teal-300">"x-hook-token: 8fK2mQ…"</span> \
                </p>
                <p className="text-zinc-500">
                  {"  "}-d <span className="text-teal-300">'{"{"}"hwid":"AB12-CD34","app":"build-9"{"}"}'</span>
                </p>
                <div className="my-3 border-t border-dashed border-zinc-700/70" />
                <p className="text-zinc-400">
                  <span className="text-zinc-300">→</span> 200 OK{" "}
                  <span className="text-zinc-500">·</span>{" "}
                  <span className="text-teal-300">{"{"}"ok":true,"license":"valid"{"}"}</span>
                </p>
                <p className="text-zinc-400">
                  <span className="text-emerald-400">✓</span> logged to dashboard —
                  headers, query, body captured
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          custom={0}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <feature.icon className="size-4" />
              </div>
              <h3 className="mt-4 text-sm font-semibold tracking-tight">{feature.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section className="border-y border-border/70 bg-card/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            custom={0}
            className="max-w-2xl"
          >
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              From zero to receiving in three steps
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built for internal teams that need to see what their scripts are
              actually sending — without standing up another service.
            </p>
          </motion.div>
          <div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-3">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
                custom={i}
                className="relative"
              >
                <span className="font-mono text-sm font-semibold text-primary">{step.num}</span>
                <h3 className="mt-2 text-base font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          custom={0}
          className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-14 text-center sm:px-12"
        >
          <TerminalSquare className="size-8 text-primary" />
          <h2 className="mt-5 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
            Stop guessing what your scripts send.
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground">
            Create your first hook, copy the URL, and watch requests appear —
            all in under ten minutes.
          </p>
          <Button asChild size="lg" className="mt-7 cursor-pointer">
            <Link to={dashboardHref}>
              {isLoading ? "Loading…" : isAuthenticated ? "Open dashboard" : "Get started free"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Hooklog" width={22} height={22} className="rounded" />
            <span className="text-sm font-semibold tracking-tight">Hooklog</span>
            <span className="ml-1 text-xs text-muted-foreground">— webhook receiver</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Built on Convex · deploy the admin UI to Vercel
          </p>
        </div>
      </footer>
    </div>
  );
}
