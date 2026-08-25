import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { roleHome } from "@/lib/roles";
import logo from "@/assets/logo.svg";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Coins,
  ExternalLink,
  Gamepad2,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Network,
  Server,
  ShieldCheck,
  TerminalSquare,
  User,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Suspense, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    body: "Every client asks the user to enter a license key at /connect. Invalid, revoked, expired, or exhausted keys are rejected — every attempt is logged with its IP and result.",
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
  {
    icon: Globe,
    title: "Custom endpoints",
    body: "Create custom HTTP endpoints with file or text responses. Serve PHP, CSS, JS, HTML, or any file type — auto-detect content types.",
  },
  {
    icon: Gamepad2,
    title: "Game integration",
    body: "Track connections by game (MLBB, FreeFire, etc.). Keys can be assigned to specific games with device limits.",
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

function LoginForm() {
  const { isLoading: authLoading, isAuthenticated, user, signIn } = useAuth();
  const navigate = useNavigate();
  const seedOwner = useMutation(api.nameserver.seedOwner);
  const [seeding, setSeeding] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const home = roleHome(user?.role);

  useEffect(() => {
    void seedOwner()
      .catch((err) => console.warn("seedOwner failed:", err))
      .finally(() => setSeeding(false));
  }, [seedOwner]);

  useEffect(() => {
    if (!authLoading && isAuthenticated && user !== undefined) {
      navigate(home);
    }
  }, [authLoading, isAuthenticated, user, navigate, home]);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("password", {
        username: formData.get("username") as string,
        password: formData.get("password") as string,
        flow: "signIn",
      });
      navigate(home);
    } catch {
      setError("Invalid username or password.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="landing-username" className="text-sm font-medium">Username</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="landing-username"
            name="username"
            placeholder="Enter your username"
            autoComplete="username"
            className="pl-10 h-11"
            disabled={isLoading || seeding}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="landing-password" className="text-sm font-medium">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="landing-password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            className="pl-10 h-11"
            disabled={isLoading || seeding}
            required
          />
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
      )}
      <Button
        type="submit"
        className="w-full h-11 cursor-pointer font-semibold"
        disabled={isLoading || seeding}
      >
        {isLoading || seeding ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ArrowRight className="mr-2 h-4 w-4" />
        )}
        {seeding ? "Preparing account…" : isLoading ? "Signing in…" : "Sign In"}
      </Button>
      <div className="flex items-center justify-between text-sm pt-1">
        <Link
          to="/auth?mode=register"
          className="text-primary hover:underline font-medium"
        >
          Don't have an account? Register
        </Link>
        <a
          href="https://t.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          Support <ExternalLink className="size-3" />
        </a>
      </div>
    </form>
  );
}

export default function Landing() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const home = roleHome(user?.role);
  const ctaHref = isAuthenticated ? home : "/auth";
  const signInHref = isAuthenticated ? home : "/auth";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="nameserver" width={30} height={30} className="rounded-md" />
            <span className="text-[15px] font-bold tracking-tight">Panxcz</span>
          </Link>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
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
                  <Link to="/auth?mode=register">
                    Get started <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero + Login Card */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-[radial-gradient(ellipse_70%_50%_at_50%_-15%,oklch(0.46_0.1_178/0.15),transparent)]" />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
            {/* Left: Branding + Info */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={0}
              className="text-center lg:text-left"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                Key-gated connect server for your apps & scripts
              </span>
              <h1 className="mt-6 text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
                Secure Access
                <br />
                <span className="text-primary">Portal</span>
              </h1>
              <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                A nameserver panel: create servers, generate connect keys that
                cost balance, and let your apps authenticate through a single{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">/connect</code> endpoint.
              </p>

              {/* Terminal mockup */}
              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={1}
                className="mt-8 overflow-hidden rounded-xl border border-border bg-zinc-950 shadow-none max-w-lg mx-auto lg:mx-0"
              >
                <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
                  <span className="size-2.5 rounded-full bg-red-400/80" />
                  <span className="size-2.5 rounded-full bg-amber-400/80" />
                  <span className="size-2.5 rounded-full bg-emerald-400/80" />
                  <span className="ml-3 font-mono text-[10px] text-zinc-400">terminal</span>
                </div>
                <div className="space-y-1.5 p-4 font-mono text-[11px] leading-relaxed">
                  <p className="text-zinc-500">
                    <span className="text-zinc-300">$</span> curl -X POST{" "}
                    <span className="text-teal-300">/connect</span> \
                    <br />
                    &nbsp;&nbsp;-d '{'{'}"license":"NS-XXXX…","device":"device-abc"{'}'}'
                  </p>
                  <p className="text-zinc-500">
                    <span className="text-zinc-300">→</span>{" "}
                    <span className="text-emerald-400">200</span>{" "}
                    <span className="text-zinc-500">·</span>{" "}
                    <span className="text-teal-300">{'{'}"ok":true{'}'}</span>
                  </p>
                  <div className="my-1 border-t border-dashed border-zinc-700/70" />
                  <p className="text-zinc-500">
                    <span className="text-zinc-300">$</span> curl -X POST{" "}
                    <span className="text-teal-300">/connect</span> \
                    <br />
                    &nbsp;&nbsp;-d '{'{'}"license":"EXPIRED…","device":"device-abc"{'}'}'
                  </p>
                  <p className="text-zinc-500">
                    <span className="text-zinc-300">→</span>{" "}
                    <span className="text-red-400">403</span>{" "}
                    <span className="text-zinc-400">· key has expired</span>
                  </p>
                </div>
              </motion.div>
            </motion.div>

            {/* Right: Login Card */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="show"
              custom={1}
              className="flex justify-center lg:justify-end"
            >
              <div className="w-full max-w-[400px]">
                <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
                  <div className="px-6 pt-6 pb-4 text-center">
                    <img
                      src={logo}
                      alt="Logo"
                      width={48}
                      height={48}
                      className="mx-auto rounded-xl mb-3"
                    />
                    <h2 className="text-xl font-bold tracking-tight">Sign in to your account</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Enter your credentials to access the panel
                    </p>
                  </div>
                  <div className="px-6 pb-6">
                    <LoginForm />
                  </div>
                  <div className="border-t border-border/70 bg-muted/50 px-6 py-3 text-center text-xs text-muted-foreground">
                    (c) {new Date().getFullYear()} Panxcz — Secured by{" "}
                    <a
                      href="https://freebuff.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-primary transition-colors"
                    >
                      freebuff.com
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          className="text-center mb-10"
        >
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything you need</h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            A complete key management and connection server for your applications.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              custom={i}
              className="group rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <feature.icon className="size-4" />
              </div>
              <h3 className="mt-4 text-sm font-semibold tracking-tight">{feature.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </motion.div>
          ))}
        </div>
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
          {[
            {
              icon: ShieldCheck,
              title: "Owner",
              body: "Everything: all servers, every key, member roles, balances, and global settings. Logs in at /owner with the owner username & password.",
            },
            {
              icon: Users,
              title: "Admin",
              body: "Created by the owner with their own username & password. Creates servers, generates keys from their balance, and watches their keys' connections at /admin.",
            },
            {
              icon: TerminalSquare,
              title: "Client",
              body: "No panel needed — just calls /connect with a key and a server code to get validated.",
            },
          ].map((role) => (
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
            Sign in as the owner, create your first server, generate a key, and
            connect your first client — all in under ten minutes.
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
            <span className="text-sm font-semibold tracking-tight">Panxcz</span>
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
