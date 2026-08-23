import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import { formatRelative } from "@/lib/format";
import { motion } from "framer-motion";
import { useQuery } from "convex/react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Coins,
  Gamepad2,
  KeyRound,
  Loader2,
  Server,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
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

function AnimatedStatCard({
  icon,
  label,
  value,
  hint,
  color,
  index,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  hint?: string;
  color?: string;
  index: number;
}) {
  const Icon = icon;
  return (
    <motion.div custom={index} variants={cardVariants} initial="hidden" animate="visible">
      <div className="rounded-xl border border-border bg-card p-5 transition-all hover:border-border/80 hover:shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <div className={`flex size-8 items-center justify-center rounded-md ${color ?? "bg-accent text-accent-foreground"}`}>
            <Icon className="size-4" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </motion.div>
  );
}

export default function OwnerOverview() {
  const navigate = useNavigate();
  const stats = useQuery(api.nameserver.overviewStats);
  const connections = useQuery(api.nameserver.listConnections);
  const chartData = useQuery(api.nameserver.chartStats);

  if (stats === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const recent = (connections ?? []).slice(0, 8);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <PageHeader
          title="Owner overview"
          description="Full control of every server, key, member and setting."
          actions={
            <Button className="cursor-pointer" onClick={() => navigate("/owner/settings")}>
              <Settings className="size-4" />
              Settings
            </Button>
          }
        />
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnimatedStatCard
          icon={Server}
          label="Servers"
          value={stats.serverCount}
          hint="active nameservers"
          color="bg-blue-500/10 text-blue-500"
          index={0}
        />
        <AnimatedStatCard
          icon={KeyRound}
          label="Keys"
          value={stats.keyCount}
          hint={`${stats.activeKeyCount} active`}
          color="bg-emerald-500/10 text-emerald-500"
          index={1}
        />
        <AnimatedStatCard
          icon={Activity}
          label="Connects"
          value={stats.connectCount}
          hint={`${stats.successCount} successful`}
          color="bg-violet-500/10 text-violet-500"
          index={2}
        />
        <AnimatedStatCard
          icon={Users}
          label="Members"
          value={stats.memberCount}
          hint="accounts on the panel"
          color="bg-amber-500/10 text-amber-500"
          index={3}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AnimatedStatCard
          icon={Wallet}
          label="Your balance"
          value={stats.unlimited ? "∞" : stats.balance.toLocaleString()}
          hint={stats.unlimited ? "unlimited — never deducted" : "deducted per generated key"}
          color="bg-emerald-500/10 text-emerald-500"
          index={4}
        />
        <AnimatedStatCard
          icon={Coins}
          label="Total balances"
          value={stats.totalBalance.toLocaleString()}
          hint="across all members"
          color="bg-amber-500/10 text-amber-500"
          index={5}
        />
      </div>

      {/* Charts */}
      {chartData && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.35 }}>
            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BarChart3 className="size-4 text-violet-500" />
                  Connections (Last 7 Days)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {chartData.daily.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData.daily}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="date" fontSize={11} tickLine={false} />
                      <YAxis fontSize={11} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                        labelStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="success" name="Success" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.35 }}>
            <Card className="border-border/70">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Gamepad2 className="size-4 text-blue-500" />
                  Connections by Game
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {chartData.games.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={chartData.games} dataKey="total" nameKey="game" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} label={({ game, percent }) => `${game} ${(percent * 100).toFixed(0)}%`}>
                        {chartData.games.map((_, i) => (
                          <Cell key={i} fill={["#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"][i % 6]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No game data yet</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.35 }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {[
          { label: "Create server", icon: Server, path: "/owner/servers", color: "hover:border-blue-500/30" },
          { label: "Generate key", icon: KeyRound, path: "/owner/keys", color: "hover:border-emerald-500/30" },
          { label: "View members", icon: Users, path: "/owner/members", color: "hover:border-amber-500/30" },
          { label: "Manage API", icon: ShieldCheck, path: "/owner/api", color: "hover:border-violet-500/30" },
        ].map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className={`group flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4 text-left transition-all hover:bg-card ${action.color}`}
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              <action.icon className="size-4" />
            </div>
            <span className="flex-1 text-sm font-medium">{action.label}</span>
            <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
          </button>
        ))}
      </motion.div>

      {/* Latest connections */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Latest connections</h2>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer text-muted-foreground"
            onClick={() => navigate("/owner/connections")}
          >
            View all
          </Button>
        </div>

        {recent.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Activity className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No connect attempts yet — create a server, generate a key, and
                hit <code className="rounded bg-muted px-1 py-0.5">/connect</code>.
              </p>
              <Button className="cursor-pointer" onClick={() => navigate("/owner/servers")}>
                <Server className="size-4" />
                Create a server
              </Button>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.3 }}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <motion.ul
              className="divide-y divide-border"
              variants={listVariants}
              initial="hidden"
              animate="visible"
            >
              {recent.map((conn) => (
                <motion.li
                  key={conn._id}
                  variants={itemVariants}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {conn.serverName}
                      </p>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {conn.key}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {conn.ip}
                      {conn.deviceId && (
                        <span className="ml-2 text-muted-foreground/70">
                          · device: {conn.deviceId.slice(0, 20)}
                          {(conn.deviceId.length ?? 0) > 20 ? "…" : ""}
                        </span>
                      )}
                      <span className="ml-2 text-muted-foreground/70">
                        · {formatRelative(conn._creationTime)}
                      </span>
                    </p>
                  </div>
                  {conn.ok ? (
                    <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600/90">
                      connected
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-white">
                      {conn.reason?.replace(/_/g, " ") ?? "failed"}
                    </Badge>
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
