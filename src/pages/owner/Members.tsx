import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/panel/PageHeader";
import { StatCard } from "@/components/panel/StatCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { formatRelative } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { Coins, Loader2, Plus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ROLE_LABEL: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  user: "user",
  member: "member",
};

function NewMemberDialog() {
  const createMember = useMutation(api.nameserver.createMember);
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const [balance, setBalance] = useState("0");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createMember({
        username,
        password,
        role: role as "owner" | "admin" | "user" | "member",
        balance: Number(balance) || 0,
      });
      toast.success(`Account "${username}" created`);
      setOpen(false);
      setUsername("");
      setPassword("");
      setRole("admin");
      setBalance("0");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="cursor-pointer">
          <Plus className="size-4" />
          Add member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create an account</DialogTitle>
          <DialogDescription>
            The new account signs in with this username &amp; password at{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/auth</code>.
            Admins need a starting balance to generate keys; owners get an
            unlimited wallet and full control.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-username">Username</Label>
            <Input
              id="member-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin1"
              minLength={3}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-password">Password</Label>
            <Input
              id="member-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={4}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">owner</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="member">member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-balance">Starting balance</Label>
              <Input
                id="member-balance"
                type="number"
                min={0}
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "owner")
    return (
      <Badge className="bg-amber-500/90 text-white hover:bg-amber-500/90">
        owner
      </Badge>
    );
  if (role === "admin")
    return (
      <Badge className="bg-primary text-primary-foreground">admin</Badge>
    );
  return <Badge variant="secondary">{role}</Badge>;
}

function MemberRow({
  member,
  isSelf,
}: {
  member: {
    _id: string;
    name: string | null;
    email: string | null;
    isAnonymous: boolean;
    role: string;
    balance: number;
    createdAt: number;
  };
  isSelf: boolean;
}) {
  const setUserRole = useMutation(api.nameserver.setUserRole);
  const setBalance = useMutation(api.nameserver.setBalance);
  const [role, setRole] = useState(member.role);
  const [balanceInput, setBalanceInput] = useState(String(member.balance));
  const [busy, setBusy] = useState(false);

  const saveRole = async (next: string) => {
    setRole(next);
    if (next === member.role || isSelf) return;
    setBusy(true);
    try {
      await setUserRole({
        userId: member._id as Parameters<typeof setUserRole>[0]["userId"],
        role: next as "owner" | "admin" | "user" | "member",
      });
      toast.success(`Role updated to ${next}`);
    } catch (err) {
      setRole(member.role);
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setBusy(false);
    }
  };

  const saveBalance = async () => {
    const value = Number(balanceInput);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Balance must be a positive number");
      return;
    }
    setBusy(true);
    try {
      await setBalance({
        userId: member._id as Parameters<typeof setBalance>[0]["userId"],
        balance: value,
      });
      toast.success(`Balance set to ${value.toLocaleString()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set balance");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">
            {member.name ?? member.email ?? "Guest user"}
            {isSelf && (
              <span className="ml-2 text-xs text-muted-foreground">(you)</span>
            )}
          </p>
          <RoleBadge role={role} />
          {member.isAnonymous && (
            <Badge variant="outline" className="text-muted-foreground">
              guest
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {member.email ?? "no email"} · joined {formatRelative(member.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Select value={role} onValueChange={saveRole} disabled={isSelf || busy}>
          <SelectTrigger className="w-28" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_LABEL) as string[]).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {member.role === "owner" ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 font-mono text-sm font-bold tabular-nums">
            ∞{" "}
            <span className="text-[10px] font-medium text-muted-foreground">
              unlimited
            </span>
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              className="w-28 font-mono text-right tabular-nums"
              aria-label="Balance"
            />
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={saveBalance}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Set"}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

export default function Members() {
  const { user: me } = useAuth();
  const members = useQuery(api.nameserver.listMembers);
  const stats = useQuery(api.nameserver.overviewStats);

  if (members === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Members"
        description="Manage who can do what. Admins create servers and generate keys; the owner controls everything."
        actions={<NewMemberDialog />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Members" value={members.length} hint="accounts" />
        <StatCard
          icon={Coins}
          label="Total balance"
          value={(stats?.totalBalance ?? 0).toLocaleString()}
          hint="across all members"
        />
        <StatCard
          icon={Coins}
          label="Key revenue"
          value={(stats?.revenue ?? 0).toLocaleString()}
          hint="balance spent on generated keys"
        />
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
          <CardDescription>
            Set a member's role or top up / deduct their balance. New sign-ups
            default to "user" — promote them to admin to let them generate keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <MemberRow
                key={member._id}
                member={member}
                isSelf={me?._id === member._id}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
