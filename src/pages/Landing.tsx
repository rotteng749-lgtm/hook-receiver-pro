import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { roleHome } from "@/lib/roles";
import logo from "@/assets/logo.svg";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Coins,
  KeyRound,
  Network,
  Server,
  ShieldCheck,
  TerminalSquare,
  Users,
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
    icon: KeyRound,
    title: "Key-gated connect",
    body: "Every client presents a generated key at /connect. Invalid, revoked, expired, or exhausted keys are rejected — every attempt is logged with its IP and result.",
  },
  {
    icon: Coins,
    title: "Balance system",
    body: "Generating a key costs balance from the admin's wallet. The owner sets the price and tops up members — key generation is always paid for.",
  },
  {
    icon: Server,
    title: "Your servers",
    body: "Create any number of nameservers with their own code and status. Turn one off and its clients instantly get rejected, no code changes needed.",
  },
  {
    icon: Activity,
    title: "Live connection log",
    body: "Every connect attempt lands in the panel: which server, which key, which IP, success or the exact rejection reason.",
  },
];

const steps = [
  {
    num: "01",
    title: "Create a server",
    body: "Name it, give it a code (e.g. eu-main), and share the connect URL with your clients.",
  },
  {
    num: "02",
    title: "Generate keys",
    body: "Admins generate keys for the server — each one costs balance, with optional usage limits and a lifetime.",
  },
  {
    num: "03",
    title: "Clients connect",
    body: "Your app, .sh script, or .dll loader calls /connect with the key. Valid keys get a green light, everything else is logged.",
  },
];

const roles = [
  {
    icon: ShieldCheck,
    title: "Owner",
    body: "Everything: all servers, every key, member roles, balances, and global settings. Log in at /owner.",
  },
  {
    icon: Users,
    title: "Admin",
    body: "Creates servers, generates keys from their balance, and watches their keys' connections. Log in at /admin.",
  },
  {
    icon: TerminalSquare,
    title: "Client",
    body: "No panel needed — just calls /connect with a key and a server code to get validated.",
  },
];

export default function Landing() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const home = roleHome(user?.role);
  const ctaHref = isAuthenticated ? home : "/auth?returnTo=%2Fdashboard";
  const signInHref = isAuthenticated ? home : "/auth";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="nameserver" width={30} height={30} className="rounded-md" />
            <span className="text-[15px] font-bold tracking-tight">nameserver</span>
          </Link>
          <nav className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button asChild size="sm" className="cursor-pointer">
                <Link to={home}>
                  Open panel <ArrowRight className="size-4" />
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
              Key-gated connect server for your apps & scripts
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
              One endpoint.
              <br />
              <span className="text-primary">Every client, gated by key.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              A nameserver panel: create servers, generate connect keys that
              cost balance, and let your apps, .sh scripts, and .dll loaders
              authenticate through a single <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">/connect</code> endpoint.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full cursor-pointer sm:w-auto">
                <Link to={ctaHref}>
                  {isLoading ? "Loading…" : isAuthenticated ? "Open panel" : "Start hosting keys"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full cursor-pointer sm:w-auto">
                <Link to="/auth?returnTo=%2Fowner">Owner sign in</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              First account to sign up becomes the owner · no credit card
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
                  loader.sh —→ POST /connect
                </span>
              </div>
              <div className="space-y-2.5 p-5 font-mono text-[12.5px] leading-relaxed sm:text-[13px]">
                <p className="text-zinc-500">
                  <span className="text-zinc-300">$</span> curl -X POST{" "}
                  <span className="text-teal-300">https://ns.example/connect</span> \
                  <br />
                  &nbsp;&nbsp;-d '{"{"}"key":"NS-K4F2-X9LM-…","server":"eu-main"{"}"}'
                </p>
                <p className="text-zinc-500">
                  <span className="text-zinc-300">→</span>{" "}
                  <span className="text-emerald-400">200</span>{" "}
                  <span className="text-zinc-500">·</span>{" "}
                  <span className="text-teal-300">{"{"}"ok":true,"server":"EU Main"{"}"}</span>
                </p>
                <div className="my-3 border-t border-dashed border-zinc-700/70" />
                <p className="text-zinc-500">
                  <span className="text-zinc-300">$</span> curl -X POST{" "}
                  <span className="text-teal-300">https://ns.example/connect</span> \
                  <br />
                  &nbsp;&nbsp;-d '{"{"}"key":"NS-EXPIRED-…","server":"eu-main"{"}"}'
                </p>
                <p className="text-zinc-500">
                  <span className="text-zinc-300">→</span>{" "}
                  <span className="text-red-400">403</span>{" "}
                  <span className="text-zinc-500">·</span>{" "}
                  <span className="text-zinc-400">key has expired</span>
                </p>
                <p className="text-zinc-500">
                  <span className="text-zinc-400">✓</span> attempt logged in the
                  panel — key, IP, reason
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
              From server to connected client in three steps
            </h2>
            <p className="mt-3 text-muted-foreground">
              No client SDK required — any app or script that can send an HTTP
              request can connect.
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

      {/* Roles */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          custom={0}
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        >
          {roles.map((role) => (
            <div
              key={role.title}
              className="flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/30"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <role.icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold tracking-tight">{role.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{role.body}</p>
            </div>
          ))}
        </motion.div>
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
          <Network className="size-8 text-primary" />
          <h2 className="mt-5 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
            Gate your clients, track every connect.
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground">
            Sign up, become the owner, create your first server, and generate a
            key — all in under ten minutes.
          </p>
          <Button asChild size="lg" className="mt-7 cursor-pointer">
            <Link to={ctaHref}>
              {isLoading ? "Loading…" : isAuthenticated ? "Open panel" : "Get started free"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <img src={logo} alt="nameserver" width={22} height={22} className="rounded" />
            <span className="text-sm font-semibold tracking-tight">nameserver</span>
            <span className="ml-1 text-xs text-muted-foreground">— connect server</span>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TerminalSquare className="size-3.5" />
            POST /connect · built on Convex · deploy the panel anywhere
          </p>
        </div>
      </footer>
    </div>
  );
}
