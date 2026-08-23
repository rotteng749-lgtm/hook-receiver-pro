import { PanelShell } from "@/components/PanelShell";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Activity,
  Braces,
  Database,
  KeyRound,
  LayoutDashboard,
  Plug,
  Send,
  Server,
  Settings,
  Users,
} from "lucide-react";

const navItems = [
  { to: "/owner", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/owner/servers", label: "Servers", icon: Server, end: false },
  { to: "/owner/keys", label: "Keys", icon: KeyRound, end: false },
  { to: "/owner/connections", label: "Connections", icon: Activity, end: false },
  { to: "/owner/databases", label: "Databases", icon: Database, end: false },
  { to: "/owner/endpoints", label: "Endpoints", icon: Plug, end: false },
  { to: "/owner/telegram", label: "Telegram", icon: Send, end: false },
  { to: "/owner/api", label: "API", icon: Braces, end: false },
  { to: "/owner/members", label: "Members", icon: Users, end: false },
  { to: "/owner/settings", label: "Settings", icon: Settings, end: false },
];

export default function OwnerPanel() {
  const stats = useQuery(api.nameserver.overviewStats);
  return (
    <PanelShell
      navItems={navItems}
      balance={stats?.balance}
      unlimited={stats?.unlimited}
      roleLabel="owner"
    />
  );
}
