import { PanelShell } from "@/components/PanelShell";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Activity,
  KeyRound,
  LayoutDashboard,
  Server,
} from "lucide-react";

const navItems = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/servers", label: "Servers", icon: Server, end: false },
  { to: "/admin/keys", label: "Keys", icon: KeyRound, end: false },
  { to: "/admin/connections", label: "Connections", icon: Activity, end: false },
];

export default function AdminPanel() {
  const stats = useQuery(api.nameserver.overviewStats);
  return (
    <PanelShell navItems={navItems} balance={stats?.balance} roleLabel="admin" />
  );
}
