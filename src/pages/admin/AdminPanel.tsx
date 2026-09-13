import { PanelShell } from "@/components/PanelShell";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Activity,
  Braces,
  KeyRound,
  LayoutDashboard,
  Link2,
  Plug,
  Server,
  Sparkles,
} from "lucide-react";

const navItems = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/servers", label: "Servers", icon: Server, end: false },
  { to: "/admin/keys", label: "Keys", icon: KeyRound, end: false },
  { to: "/admin/connections", label: "Connections", icon: Activity, end: false },
  { to: "/admin/endpoints", label: "Endpoints", icon: Plug, end: false },
  { to: "/admin/api", label: "API", icon: Braces, end: false },
  { to: "/admin/getkey", label: "GetKey", icon: Sparkles, end: false },
  { to: "/admin/shortener", label: "Shortener", icon: Link2, end: false },
];

export default function AdminPanel() {
  const stats = useQuery(api.nameserver.overviewStats);
  return (
    <PanelShell navItems={navItems} balance={stats?.balance} roleLabel="admin" />
  );
}
