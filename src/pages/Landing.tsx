/**
 * Landing — complete multi-section e-commerce storefront for Panxcz.
 *
 * Sections:
 *   1. Hero (particle background + CTA)
 *   2. Features grid
 *   3. How it works (3 steps)
 *   4. Pricing table
 *   5. Animated stats counter
 *   6. Testimonials carousel
 *   7. Team
 *   8. Contact form
 *   9. Newsletter
 *  10. Footer (sticky bottom bar)
 *
 * Design: Glassmorphism + Deep Ocean palette + Framer Motion animations.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { roleHome } from "@/lib/roles";
import logo from "@/assets/logo.svg";
import ParticleHero from "@/components/ParticleHero";
import StatsCounter from "@/components/StatsCounter";
import BackToTop from "@/components/BackToTop";
import { motion, useInView } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Blocks,
  Braces,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  ExternalLink,
  Gamepad2,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Network,
  Phone,
  Rocket,
  Send,
  Server,
  Shield,
  ShieldCheck,
  Star,
  TerminalSquare,
  User,
  Users,
  Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Suspense, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.08 * i, ease: "easeOut" as const },
  }),
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.4 } },
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { icon: KeyRound, title: "Key-Gated Access", desc: "Every client needs a valid license key. Invalid, expired, or revoked keys are rejected instantly." },
  { icon: Shield, title: "1 Key = 1 Device", desc: "Keys bind to a specific device, preventing sharing and unauthorized access." },
  { icon: Coins, title: "Balance System", desc: "Generating keys costs balance from the admin's wallet. Full control over pricing." },
  { icon: Globe, title: "Custom Endpoints", desc: "Create arbitrary HTTP endpoints with file or text responses — PHP, CSS, JS, any format." },
  { icon: Gamepad2, title: "Game Integration", desc: "Track connections by game — MLBB, FreeFire, PUBG, and more with per-game analytics." },
  { icon: Send, title: "Telegram Bot", desc: "Manage keys, servers, and monitor stats directly from Telegram with inline buttons." },
  { icon: Activity, title: "Live Request Log", desc: "Every connection attempt is logged with IP, device, server, and rejection reason." },
  { icon: Blocks, title: "Webhook Support", desc: "Get real-time notifications on every connect via external webhook URL." },
];

const STEPS = [
  { num: "01", title: "Create a Server", desc: "Name it, give it a code (e.g. eu-main), and share the connect URL with your clients." },
  { num: "02", title: "Generate Keys", desc: "Admins generate keys for the server — each one costs balance, with optional usage limits." },
  { num: "03", title: "Clients Connect", desc: "Your app calls /connect with the key. Valid keys get a green light, everything else is logged." },
];

const PRICING = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    desc: "Perfect for testing and personal projects",
    features: ["1 Server", "10 Keys/month", "Basic logging", "Community support", "Custom endpoints"],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Professional",
    price: "$29",
    period: "/month",
    desc: "For developers who need more power",
    features: ["5 Servers", "500 Keys/month", "Advanced analytics", "Priority support", "Telegram bot", "Webhook integrations", "IP whitelist/blacklist"],
    cta: "Start Pro",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "$99",
    period: "/month",
    desc: "For teams and high-volume operations",
    features: ["Unlimited servers", "Unlimited keys", "Full analytics dashboard", "24/7 support", "Custom domain", "API access", "White-label branding", "Dedicated infrastructure"],
    cta: "Contact Sales",
    popular: false,
  },
];

const TESTIMONIALS = [
  { name: "Alex Chen", role: "Game Dev", avatar: "https://picsum.photos/seed/alex/80/80", text: "Panxcz made licensing our game scripts incredibly simple. The Telegram bot is a game-changer — I manage everything from my phone.", rating: 5 },
  { name: "Sarah Kim", role: "Security Researcher", avatar: "https://picsum.photos/seed/sarah/80/80", text: "The device binding feature is exactly what we needed. No more shared keys floating around. Clean, fast, reliable.", rating: 5 },
  { name: "Marcus Johnson", role: "Indie Developer", avatar: "https://picsum.photos/seed/marcus/80/80", text: "Set up in under 10 minutes. The custom endpoints let me serve exactly the responses my clients expect. Brilliant.", rating: 5 },
  { name: "Yuki Tanaka", role: "Mod Community Lead", avatar: "https://picsum.photos/seed/yuki/80/80", text: "We moved from a DIY solution to Panxcz and haven't looked back. The connection logs and game tracking are invaluable.", rating: 4 },
];

const TEAM = [
  { name: "Panxcz", role: "Founder & Lead Dev", avatar: "https://picsum.photos/seed/panxcz/200/200", bio: "Built Panxcz from the ground up. Passionate about creating tools that make developer lives easier." },
  { name: "DevOps", role: "Infrastructure", avatar: "https://picsum.photos/seed/devops/200/200", bio: "Keeps everything running smooth. 99.9% uptime is the minimum standard." },
  { name: "QA Team", role: "Quality Assurance", avatar: "https://picsum.photos/seed/qateam/200/200", bio: "Tests every feature before it ships. If it's broken, we'll find it." },
];

const STATS = [
  { label: "Active Keys", value: 12847, suffix: "+" },
  { label: "Connections Today", value: 4892, suffix: "" },
  { label: "Servers Online", value: 156, suffix: "" },
  { label: "Uptime", value: 99, suffix: ".9%" },
];

/* ------------------------------------------------------------------ */
/*  Login Form (hero sidebar)                                          */
/* ------------------------------------------------------------------ */

function LoginForm() {
  const { isLoading: authLoading, isAuthenticated, user, signIn } = useAuth();
  const navigate = useNavigate();
  const seedOwner = useMutation(api.nameserver.seedOwner);
  const [seeding, setSeeding] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const home = roleHome(user?.role);

  useEffect(() => {
    void seedOwner().catch(() => {}).finally(() => setSeeding(false));
  }, [seedOwner]);

  useEffect(() => {
    if (!authLoading && isAuthenticated && user !== undefined) navigate(home);
  }, [authLoading, isAuthenticated, user, navigate, home]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      await signIn("password", { username: fd.get("username") as string, password: fd.get("password") as string, flow: "signIn" });
      navigate(home);
    } catch { setError("Invalid username or password."); setIsLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ls-user" className="text-sm font-medium text-silver">Username</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input id="ls-user" name="username" placeholder="Enter username" autoComplete="username" className="pl-10 h-11 glass border-white/10 text-foreground placeholder:text-muted-foreground" disabled={isLoading || seeding} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ls-pass" className="text-sm font-medium text-silver">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input id="ls-pass" name="password" type="password" placeholder="••••••••" autoComplete="current-password" className="pl-10 h-11 glass border-white/10 text-foreground placeholder:text-muted-foreground" disabled={isLoading || seeding} required />
        </div>
      </div>
      {error && <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-md">{error}</p>}
      <Button type="submit" className="w-full h-11 cursor-pointer font-semibold bg-[#4a9a8e] hover:bg-[#5aaa9e] text-[#0f1419] transition-all hover:glow-teal" disabled={isLoading || seeding}>
        {isLoading || seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
        {seeding ? "Preparing…" : isLoading ? "Signing in…" : "Sign In"}
      </Button>
      <div className="flex items-center justify-between text-sm pt-1">
        <Link to="/auth?mode=register" className="text-[#4a9a8e] hover:underline font-medium">Register</Link>
        <a href="https://t.me/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground flex items-center gap-1">Support <ExternalLink className="size-3" /></a>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Testimonial Carousel                                               */
/* ------------------------------------------------------------------ */

function TestimonialCarousel() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setCurrent((c) => (c + 1) % TESTIMONIALS.length), 5000);
    return () => clearTimeout(id);
  }, [current]);

  const go = (dir: number) => {
    setCurrent((c) => (c + dir + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  const t = TESTIMONIALS[current];

  return (
    <div className="relative max-w-2xl mx-auto">
      <motion.div key={current} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="glass rounded-2xl p-8 text-center">
        <div className="flex justify-center mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`size-5 ${i < t.rating ? "fill-[#4a9a8e] text-[#4a9a8e]" : "text-muted-foreground/30"}`} />
          ))}
        </div>
        <p className="text-lg text-silver leading-relaxed mb-6">"{t.text}"</p>
        <div className="flex items-center justify-center gap-3">
          <img src={t.avatar} alt={t.name} className="size-10 rounded-full border-2 border-[#4a9a8e]/30" />
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">{t.name}</p>
            <p className="text-xs text-muted-foreground">{t.role}</p>
          </div>
        </div>
      </motion.div>
      <button onClick={() => go(-1)} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 size-10 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer" aria-label="Previous testimonial">
        <ChevronLeft className="size-5" />
      </button>
      <button onClick={() => go(1)} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 size-10 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer" aria-label="Next testimonial">
        <ChevronRight className="size-5" />
      </button>
      <div className="flex justify-center gap-2 mt-6">
        {TESTIMONIALS.map((_, i) => (
          <button key={i} onClick={() => { setCurrent(i);  }} className={`size-2 rounded-full transition-all cursor-pointer ${i === current ? "bg-[#4a9a8e] w-6" : "bg-muted-foreground/30"}`} aria-label={`Go to testimonial ${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Contact Form                                                       */
/* ------------------------------------------------------------------ */

function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Invalid email";
    if (!form.subject.trim()) errs.subject = "Subject is required";
    if (!form.message.trim()) errs.message = "Message is required";
    else if (form.message.trim().length < 10) errs.message = "Message must be at least 10 characters";
    return errs;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length === 0) setSent(true);
  };

  if (sent) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass rounded-2xl p-12 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-[#4a9a8e]/15 mx-auto mb-4">
          <Check className="size-8 text-[#4a9a8e]" />
        </div>
        <h3 className="text-xl font-bold text-foreground">Message Sent!</h3>
        <p className="text-muted-foreground mt-2">We'll get back to you within 24 hours.</p>
        <Button onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "", message: "" }); }} variant="outline" className="mt-6 cursor-pointer glass border-white/10">Send another</Button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label className="text-sm text-silver">Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className="glass border-white/10 text-foreground" />
          {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm text-silver">Email</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" className="glass border-white/10 text-foreground" />
          {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm text-silver">Subject</Label>
        <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="How can we help?" className="glass border-white/10 text-foreground" />
        {errors.subject && <p className="text-xs text-red-400">{errors.subject}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm text-silver">Message</Label>
        <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} placeholder="Tell us about your project..." className="w-full rounded-lg glass border border-white/10 bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-[#4a9a8e]/50" />
        {errors.message && <p className="text-xs text-red-400">{errors.message}</p>}
      </div>
      <Button type="submit" className="w-full h-11 cursor-pointer font-semibold bg-[#4a9a8e] hover:bg-[#5aaa9e] text-[#0f1419] transition-all hover:glow-teal">
        <Send className="mr-2 size-4" /> Send Message
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Section wrapper with scroll-triggered animation                    */
/* ------------------------------------------------------------------ */

function Section({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      id={id}
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ================================================================== */
/*  MAIN LANDING PAGE                                                  */
/* ================================================================== */

export default function Landing() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const home = roleHome(user?.role);
  const ctaHref = isAuthenticated ? home : "/auth";
  const [newsletter, setNewsletter] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  return (
    <div className="min-h-screen bg-[#0f1419] text-[#a8b2c1] overflow-x-hidden">
      {/* ─── Navigation ─── */}
      <header className="sticky top-0 z-50 glass-strong">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="Panxcz" width={28} height={28} className="rounded-md" />
            <span className="text-[15px] font-bold tracking-tight text-foreground">Panxcz</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#features" className="text-[#a8b2c1] hover:text-[#4a9a8e] transition-colors">Features</a>
            <a href="#pricing" className="text-[#a8b2c1] hover:text-[#4a9a8e] transition-colors">Pricing</a>
            <a href="#testimonials" className="text-[#a8b2c1] hover:text-[#4a9a8e] transition-colors">Testimonials</a>
            <a href="#team" className="text-[#a8b2c1] hover:text-[#4a9a8e] transition-colors">Team</a>
            <a href="#contact" className="text-[#a8b2c1] hover:text-[#4a9a8e] transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Button asChild size="sm" className="cursor-pointer bg-[#4a9a8e] hover:bg-[#5aaa9e] text-[#0f1419]">
                <Link to={home}>Panel <ArrowRight className="size-4 ml-1" /></Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="cursor-pointer text-[#a8b2c1] hidden sm:flex">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm" className="cursor-pointer bg-[#4a9a8e] hover:bg-[#5aaa9e] text-[#0f1419]">
                  <Link to="/auth?mode=register">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative min-h-[90vh] flex items-center">
        <div className="absolute inset-0">
          <ParticleHero />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f1419] via-transparent to-[#0f1419]" />
        </div>
        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
              <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-medium text-[#4a9a8e]">
                <span className="size-1.5 rounded-full bg-[#4a9a8e] animate-pulse" />
                License Key Management & Connect Server
              </span>
              <h1 className="mt-6 text-4xl sm:text-6xl font-bold leading-[1.1] tracking-tight text-foreground">
                Secure Access
                <br />
                <span className="text-[#4a9a8e]">Portal</span>
              </h1>
              <p className="mt-5 max-w-lg text-base sm:text-lg leading-relaxed text-[#a8b2c1]">
                Create servers, generate license keys that cost balance, and let your
                apps authenticate through a single <code className="rounded glass px-1.5 py-0.5 font-mono text-[#4a9a8e]">/connect</code> endpoint.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button asChild size="lg" className="cursor-pointer bg-[#4a9a8e] hover:bg-[#5aaa9e] text-[#0f1419] font-semibold transition-all hover:glow-teal">
                  <Link to={ctaHref}>{isLoading ? "Loading…" : isAuthenticated ? "Open Panel" : "Start Free"} <ArrowRight className="ml-2 size-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="cursor-pointer glass border-white/10 text-[#a8b2c1] hover:text-foreground hover:border-[#4a9a8e]/50">
                  <a href="#features">Learn More</a>
                </Button>
              </div>
            </motion.div>

            {/* Login card */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1} className="flex justify-center lg:justify-end">
              <div className="w-full max-w-[420px]">
                <div className="glass-strong rounded-2xl overflow-hidden glow-teal">
                  <div className="px-6 pt-6 pb-4 text-center">
                    <img src={logo} alt="Panxcz" width={44} height={44} className="mx-auto rounded-xl mb-3" />
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Sign in to your account</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Enter your credentials to access the panel</p>
                  </div>
                  <div className="px-6 pb-6"><LoginForm /></div>
                  <div className="border-t border-white/5 px-6 py-3 text-center text-xs text-muted-foreground">
                    © {new Date().getFullYear()} Panxcz — Secured by <a href="https://freebuff.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#4a9a8e]">freebuff.com</a>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <Section id="features" className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Everything you need</h2>
          <p className="mt-4 text-[#a8b2c1] max-w-xl mx-auto">A complete key management and connection server for your applications.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} custom={i} className="glass rounded-xl p-6 transition-all hover:border-[#4a9a8e]/30 hover:glow-teal group">
              <div className="flex size-10 items-center justify-center rounded-lg bg-[#4a9a8e]/10 text-[#4a9a8e] group-hover:bg-[#4a9a8e]/20 transition-colors">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#a8b2c1]">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ─── How It Works ─── */}
      <Section className="border-y border-white/5">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <div className="max-w-2xl mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">From server to connected client in three steps</h2>
            <p className="mt-4 text-[#a8b2c1]">No client SDK required — any app that can send HTTP can connect.</p>
          </div>
          <div className="grid grid-cols-1 gap-12 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div key={s.num} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} custom={i} className="relative">
                <span className="font-mono text-4xl font-bold text-[#4a9a8e]/20">{s.num}</span>
                <h3 className="mt-3 text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#a8b2c1]">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── Pricing ─── */}
      <Section id="pricing" className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Simple, transparent pricing</h2>
          <p className="mt-4 text-[#a8b2c1]">Start free, scale as you grow. No hidden fees.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {PRICING.map((p, i) => (
            <motion.div key={p.name} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} custom={i} className={`relative glass rounded-2xl p-8 transition-all ${p.popular ? "border-[#4a9a8e]/50 glow-teal-strong scale-[1.02]" : "hover:border-white/15"}`}>
              {p.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#4a9a8e] px-4 py-1 text-xs font-bold text-[#0f1419]">Most Popular</div>}
              <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">{p.price}</span>
                {p.period && <span className="text-muted-foreground">{p.period}</span>}
              </div>
              <ul className="mt-8 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[#a8b2c1]">
                    <Check className="size-4 text-[#4a9a8e] mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button asChild className={`w-full mt-8 cursor-pointer transition-all ${p.popular ? "bg-[#4a9a8e] hover:bg-[#5aaa9e] text-[#0f1419] font-semibold" : "glass border-white/10 text-[#a8b2c1] hover:text-foreground hover:border-[#4a9a8e]/50"}`}>
                <Link to={ctaHref}>{p.cta}</Link>
              </Button>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ─── Stats ─── */}
      <Section className="border-y border-white/5">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <motion.div key={s.label} variants={scaleIn} initial="hidden" whileInView="show" viewport={{ once: true }} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-foreground">
                  <StatsCounter target={s.value} suffix={s.suffix} />
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── Testimonials ─── */}
      <Section id="testimonials" className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Loved by developers</h2>
          <p className="mt-4 text-[#a8b2c1]">See what our users have to say about Panxcz.</p>
        </div>
        <TestimonialCarousel />
      </Section>

      {/* ─── Team ─── */}
      <Section id="team" className="border-y border-white/5">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Meet the team</h2>
            <p className="mt-4 text-[#a8b2c1]">The people behind Panxcz.</p>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 max-w-4xl mx-auto">
            {TEAM.map((m, i) => (
              <motion.div key={m.name} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} custom={i} className="glass rounded-2xl p-8 text-center group hover:border-[#4a9a8e]/30 transition-all">
                <img src={m.avatar} alt={m.name} className="size-20 rounded-full mx-auto border-2 border-[#4a9a8e]/20 group-hover:border-[#4a9a8e]/50 transition-colors" />
                <h3 className="mt-4 text-lg font-bold text-foreground">{m.name}</h3>
                <p className="text-sm text-[#4a9a8e]">{m.role}</p>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{m.bio}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── Contact ─── */}
      <Section id="contact" className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Get in touch</h2>
            <p className="mt-4 text-[#a8b2c1] leading-relaxed">Have questions about Panxcz? Need help setting up? Drop us a message and we'll respond within 24 hours.</p>
            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-3 text-sm text-[#a8b2c1]"><Mail className="size-5 text-[#4a9a8e]" /> support@panxcz.com</div>
              <div className="flex items-center gap-3 text-sm text-[#a8b2c1]"><MapPin className="size-5 text-[#4a9a8e]" /> Available worldwide, remote-first</div>
              <div className="flex items-center gap-3 text-sm text-[#a8b2c1]"><Phone className="size-5 text-[#4a9a8e]" /> Telegram: @panxcz</div>
            </div>
            {/* Google Maps embed */}
            <div className="mt-8 rounded-xl overflow-hidden glass">
              <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3966.5!2d106.8!3d-6.2!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sJakarta!5e0!3m2!1sen!2sid!4v1" width="100%" height="200" style={{ border: 0, filter: "grayscale(0.8) invert(0.9) contrast(0.9)" }} allowFullScreen loading="lazy" title="Office location" />
            </div>
          </div>
          <ContactForm />
        </div>
      </Section>

      {/* ─── Newsletter ─── */}
      <Section className="border-y border-white/5">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="glass rounded-2xl p-10 sm:p-14 text-center max-w-2xl mx-auto glow-teal">
            <Zap className="size-8 text-[#4a9a8e] mx-auto mb-4" />
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Stay updated</h2>
            <p className="mt-3 text-[#a8b2c1]">Get the latest updates, features, and security patches delivered to your inbox.</p>
            {subscribed ? (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-[#4a9a8e] font-medium">✓ Thanks for subscribing!</motion.p>
            ) : (
              <div className="mt-6 flex gap-3 max-w-md mx-auto">
                <Input type="email" value={newsletter} onChange={(e) => setNewsletter(e.target.value)} placeholder="you@email.com" className="glass border-white/10 text-foreground flex-1" />
                <Button onClick={() => { if (newsletter.includes("@")) setSubscribed(true); }} className="cursor-pointer bg-[#4a9a8e] hover:bg-[#5aaa9e] text-[#0f1419] font-semibold shrink-0">Subscribe</Button>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ─── CTA ─── */}
      <Section className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <div className="flex flex-col items-center rounded-2xl glass px-6 py-16 text-center sm:px-16 glow-teal">
          <Network className="size-10 text-[#4a9a8e]" />
          <h2 className="mt-6 max-w-xl text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Gate your clients, track every connect.</h2>
          <p className="mt-4 max-w-md text-[#a8b2c1]">Sign in as the owner, create your first server, generate a key, and connect your first client — all in under ten minutes.</p>
          <Button asChild size="lg" className="mt-8 cursor-pointer bg-[#4a9a8e] hover:bg-[#5aaa9e] text-[#0f1419] font-semibold transition-all hover:glow-teal">
            <Link to={ctaHref}>{isLoading ? "Loading…" : isAuthenticated ? "Open Panel" : "Get Started Free"} <ArrowRight className="ml-2 size-4" /></Link>
          </Button>
        </div>
      </Section>

      {/* ─── Footer ─── */}
      <footer className="glass-strong border-t border-white/5">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src={logo} alt="Panxcz" width={22} height={22} className="rounded" />
                <span className="text-sm font-bold text-foreground">Panxcz</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">License key management and connect server for your apps.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-[#4a9a8e] transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-[#4a9a8e] transition-colors">Pricing</a></li>
                <li><Link to="/auth" className="hover:text-[#4a9a8e] transition-colors">Get Started</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#team" className="hover:text-[#4a9a8e] transition-colors">Team</a></li>
                <li><a href="#contact" className="hover:text-[#4a9a8e] transition-colors">Contact</a></li>
                <li><a href="https://t.me/" target="_blank" rel="noopener noreferrer" className="hover:text-[#4a9a8e] transition-colors flex items-center gap-1">Telegram <ExternalLink className="size-3" /></a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><span className="cursor-default">Privacy Policy</span></li>
                <li><span className="cursor-default">Terms of Service</span></li>
                <li><a href="https://freebuff.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#4a9a8e] transition-colors flex items-center gap-1">freebuff.com <ExternalLink className="size-3" /></a></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Panxcz. All rights reserved.</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><TerminalSquare className="size-3.5" /> POST /connect · Built on Convex</p>
          </div>
        </div>
      </footer>

      <BackToTop />
    </div>
  );
}
