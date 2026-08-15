import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CopyButton } from "@/components/panel/CopyButton";
import { HookFormDialog } from "@/components/panel/HookFormDialog";
import { PageHeader } from "@/components/panel/PageHeader";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { getHookUrl } from "@/lib/webhook";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldOff,
  Trash2,
  Webhook,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

export default function Hooks() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hooks = useQuery(api.hooks.list);
  const removeHook = useMutation(api.hooks.remove);
  const updateHook = useMutation(api.hooks.update);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"hooks"> | null>(null);
  const [deleting, setDeleting] = useState<Doc<"hooks"> | null>(null);
  const [busy, setBusy] = useState(false);

  // ?new=1 opens the create dialog (used by the sidebar "New hook" button)
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(null);
      setDialogOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleToggle = async (hook: Doc<"hooks">, enabled: boolean) => {
    await updateHook({ id: hook._id, patch: { enabled } });
    toast(enabled ? `${hook.name} enabled` : `${hook.name} disabled`);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await removeHook({ id: deleting._id });
      toast(`Hook /${deleting.path} deleted`);
      setDeleting(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete hook");
    } finally {
      setBusy(false);
    }
  };

  if (hooks === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Hooks"
        description="Every hook exposes a public URL and answers with the response you configure."
        actions={
          <Button
            className="cursor-pointer"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            New hook
          </Button>
        }
      />

      {hooks.length === 0 ? (
        <Empty className="rounded-xl border border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Webhook />
            </EmptyMedia>
            <EmptyTitle>No hooks yet</EmptyTitle>
            <EmptyDescription>
              Create your first hook to get a public URL your scripts can call.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            className="cursor-pointer"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            Create a hook
          </Button>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-full min-w-56">Hook</TableHead>
                <TableHead className="w-36">Methods</TableHead>
                <TableHead className="w-24">Token</TableHead>
                <TableHead className="w-20">Status</TableHead>
                <TableHead className="w-24">Enabled</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hooks.map((hook) => (
                <TableRow key={hook._id} className="group cursor-pointer" onClick={() => navigate(`/dashboard/hooks/${hook._id}`)}>
                  <TableCell>
                    <p className="text-sm font-medium">{hook.name}</p>
                    <p className="mt-0.5 max-w-72 truncate font-mono text-xs text-muted-foreground">
                      /api/hook/{hook.path}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {hook.methods.map((method) => (
                        <span
                          key={method}
                          className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground"
                        >
                          {method}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {hook.requireToken ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <KeyRound className="size-3.5" /> required
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ShieldOff className="size-3.5" /> open
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{hook.responseStatus}</span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={hook.enabled}
                      onCheckedChange={(checked) => handleToggle(hook, checked)}
                      aria-label={`Toggle ${hook.name}`}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <CopyButton value={getHookUrl(hook.path)} label="Hook URL" variant="ghost" />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-pointer text-muted-foreground"
                        aria-label="Edit hook"
                        onClick={() => {
                          setEditing(hook);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="cursor-pointer text-muted-foreground hover:text-destructive"
                            aria-label="Delete hook"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleting(hook);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete /{deleting?.path}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The URL will stop working immediately and all logged requests for
                              this hook will be deleted. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="cursor-pointer"
                              onClick={handleDelete}
                              disabled={busy}
                            >
                              {busy && <Loader2 className="size-4 animate-spin" />}
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-pointer text-muted-foreground"
                        aria-label="Open hook"
                        onClick={() => navigate(`/dashboard/hooks/${hook._id}`)}
                      >
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <HookFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        hook={editing}
        onSaved={(id) => id && navigate(`/dashboard/hooks/${id}`)}
      />
    </div>
  );
}
