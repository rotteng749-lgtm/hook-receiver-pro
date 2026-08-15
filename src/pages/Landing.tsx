import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { motion } from "framer-motion";
import {
  ArrowRight,
  FileArchive,
  Fingerprint,
  Link2,
  QrCode,
  ShieldCheck,
  TerminalSquare,
  UploadCloud,
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
    icon: FileArchive,
    title: "Any file type",
    body: "APKs, shell scripts, DLLs, shared objects, zips, docs — nothing is filtered. Bytes in, bytes out, with the right Content-Type on the way.",
  },
  {
    icon: Fingerprint,
    title: "SHA-256 verified",
    body: "Every upload is hashed server-side and served with an X-Checksum-Sha256 header, so your team can verify what they downloaded.",
  },
  {
    icon: Link2,
    title: "Public links & QR",
    body: "Each file gets a stable public URL that needs no login — copy the link or scan a QR straight from the admin panel.",
  },
  {
    icon: ShieldCheck,
    title: "Admin-protected",
    body: "Uploading, deleting, and managing files requires sign-in; the REST API uses time-limited Bearer tokens with a rate-limited login.",
  },
];

const steps = [
  {
    num: "01",
    title: "Upload",
    body: "Drag a build into the admin panel — .apk, .sh, .dll, .zip, anything up to 512 MB. Add a version and a note.",
  },
  {
    num: "02",
    title: "Checksum & link",
    body: "The server hashes the file and hands you a stable public download URL with metadata: size, version, SHA-256.",
  },
  {
    num: "03",
    title: "Share & track",
    body: "Send the link or QR code to your team. Public downloads need no auth; the panel tracks how many times each file was pulled.",
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
            <img src={logo} alt="Stash" width={30} height={30} className="rounded-md" />
            <span className="text-[15px] font-bold tracking-tight">Stash</span>
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
              File server for internal teams
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
              Upload once.
              <br />
              <span className="text-primary">Share any file.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              A dead-simple download server for APKs, scripts, libraries, and
              builds. Every file gets a public link, a verified SHA-256, and a
              QR code — with an admin panel and REST API for your pipeline.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full cursor-pointer sm:w-auto">
                <Link to={dashboardHref}>
                  {isLoading ? "Loading…" : isAuthenticated ? "Open dashboard" : "Start hosting files"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full cursor-pointer sm:w-auto">
                <Link to="/dashboard/files">Browse files</Link>
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
                  team build —→ GET /files/7hK3m…9
                </span>
              </div>
              <div className="space-y-2.5 p-5 font-mono text-[12.5px] leading-relaxed sm:text-[13px]">
                <p className="text-zinc-500">
                  <span className="text-zinc-300">$</span> curl -L -O{" "}
                  <span className="text-teal-300">https://stash.example/files/7hK3m…9</span>
                </p>
                <p className="text-zinc-500">
                  <span className="text-zinc-300">→</span> 200 OK{" "}
                  <span className="text-zinc-500">·</span>{" "}
                  <span className="text-teal-300">app-v1.0.3.apk</span> (48.2 MB)
                </p>
                <p className="text-zinc-500">
                  <span className="text-zinc-300">✓</span>{" "}
                  <span className="text-zinc-500">X-Checksum-Sha256:</span>{" "}
                  <span className="text-teal-300">a1b2c3d4…</span>
                </p>
                <div className="my-3 border-t border-dashed border-zinc-700/70" />
                <p className="text-zinc-400">
                  <span className="text-emerald-400">✓</span> saved as{" "}
                  <span className="text-zinc-300">app-v1.0.3.apk</span> — no auth, no
                  login, bytes identical
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
              From build to download in three steps
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built for internal teams that ship artifacts without standing up
              another service.
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
          <div className="flex items-center gap-3">
            <UploadCloud className="size-7 text-primary" />
            <QrCode className="size-7 text-primary" />
          </div>
          <h2 className="mt-5 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
            Stop emailing builds around.
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground">
            Upload your first file, copy the link, and let your team pull it —
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
            <img src={logo} alt="Stash" width={22} height={22} className="rounded" />
            <span className="text-sm font-semibold tracking-tight">Stash</span>
            <span className="ml-1 text-xs text-muted-foreground">— file server</span>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TerminalSquare className="size-3.5" />
            Built on Convex · deploy the admin UI to Vercel
          </p>
        </div>
      </footer>
    </div>
  );
}
