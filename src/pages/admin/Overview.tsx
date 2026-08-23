import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/panel/PageHeader";
import { StatCard } from "@/components/panel/StatCard";
import { api } from "@/convex/_generated/api";
import { formatExpiry } from "@/lib/format";
import { motion } from "framer-motion";
import { useQuery } from "convex/react";
import {
  Activity,
  ArrowRight,
  Coins,
  KeyRound,
  Loader2,
  Plus,
  Server,
} from "lucide-react";
import { useNavigate } from "react-router";

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.35, ease: "easeOut" as const },
  }),
};

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25 } },
};

export default function AdminOverview() {
  const navigate = useNavigate();
  const stats = useQuery(api.nameserver.overviewStats);
  const keys = useQuery(api.nameserver.listKeys);

  if (stats === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const recent = (keys ?? []).slice(0, 6);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <PageHeader
          title="Overview"
          description="Your wallet and your keys. Generate keys, hand them to clients, watch them connect."
          actions={
            <Button className="cursor-pointer" onClick={() => navigate("/admin/keys")}>
              <Plus className="size-4" />
              Generate key
            </Button>
          }
        />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <StatCard icon={Coins} label="My balance" value={stats.balance.toLocaleString()} hint="per key: see settings" />
        </motion.div>
        <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
          <StatCard icon={KeyRound} label="My keys" value={stats.keyCount} hint={`${stats.activeKeyCount} active`} />
        </motion.div>
        <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
          <StatCard icon={Activity} label="My connects" value={stats.connectCount} hint={`${stats.successCount} successful`} />
        </motion.div>
        <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
          <StatCard icon={Server} label="Servers" value={stats.serverCount} hint="across the panel" />
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.35 }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {[
          { label: "Generate key", icon: KeyRound, path: "/admin/keys" },
          { label: "View servers", icon: Server, path: "/admin/servers" },
          { label: "Connections", icon: Activity, path: "/admin/connections" },
        ].map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4 text-left transition-all hover:border-primary/30 hover:bg-card"
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              <action.icon className="size-4" />
            </div>
            <span className="flex-1 text-sm font-medium">{action.label}</span>
            <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
          </button>
        ))}
      </motion.div>

      {/* Latest keys */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">My latest keys</h2>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer text-muted-foreground"
            onClick={() => navigate("/admin/keys")}
          >
            View all
          </Button>
        </div>

        {recent.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <KeyRound className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No keys yet. Generate your first one and share it with a client.
              </p>
              <Button className="cursor-pointer" onClick={() => navigate("/admin/keys")}>
                <Plus className="size-4" />
                Generate key
              </Button>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <motion.ul
              className="divide-y divide-border"
              variants={listVariants}
              initial="hidden"
              animate="visible"
            >
              {recent.map((key) => (
                <motion.li
                  key={key._id}
                  variants={itemVariants}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs">{key.key}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {key.serverName} · {key.uses}/{key.maxUses === 0 ? "∞" : key.maxUses} uses ·
                      expires {formatExpiry(key.expiresAt)}
                    </p>
                  </div>
                  {key.status === "active" ? (
                    <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600/90">
                      active
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{key.status}</Badge>
                  )}
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        )}
      </div>
    </div>
  );
}
