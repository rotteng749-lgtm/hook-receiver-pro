import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const STATUS_PRESETS = [200, 201, 204, 400, 401, 403, 404, 500];
const CONTENT_TYPES = [
  "application/json",
  "text/plain",
  "text/html",
  "application/xml",
];

const PATH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

type FormState = {
  name: string;
  path: string;
  methods: string[];
  requireToken: boolean;
  responseStatus: number;
  responseContentType: string;
  responseBody: string;
};

export function HookFormDialog({
  open,
  onOpenChange,
  hook,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hook?: Doc<"hooks"> | null;
  onSaved?: (id: string) => void;
}) {
  const createHook = useMutation(api.hooks.create);
  const updateHook = useMutation(api.hooks.update);
  const isEdit = Boolean(hook);

  const [form, setForm] = useState<FormState>({
    name: "",
    path: "",
    methods: ["GET", "POST"],
    requireToken: true,
    responseStatus: 200,
    responseContentType: "application/json",
    responseBody: '{"ok":true}',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(
        hook
          ? {
              name: hook.name,
              path: hook.path,
              methods: hook.methods,
              requireToken: hook.requireToken,
              responseStatus: hook.responseStatus,
              responseContentType: hook.responseContentType,
              responseBody: hook.responseBody,
            }
          : {
              name: "",
              path: "",
              methods: ["GET", "POST"],
              requireToken: true,
              responseStatus: 200,
              responseContentType: "application/json",
              responseBody: '{"ok":true}',
            },
      );
    }
  }, [open, hook]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleMethod = (method: string) =>
    set(
      "methods",
      form.methods.includes(method)
        ? form.methods.filter((m) => m !== method)
        : [...form.methods, method],
    );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError(null);

    if (!isEdit) {
      if (form.path.trim().length < 2 || !PATH_PATTERN.test(form.path.trim())) {
        setError("Path must be 2+ chars using letters, numbers, dashes or underscores.");
        return;
      }
    }
    if (form.methods.length === 0) {
      setError("Select at least one method.");
      return;
    }
    if (
      form.responseContentType.includes("json") &&
      form.responseBody.trim().length > 0
    ) {
      try {
        JSON.parse(form.responseBody);
      } catch {
        setError("Response body is not valid JSON.");
        return;
      }
    }

    setSaving(true);
    try {
      if (hook) {
        await updateHook({
          id: hook._id,
          patch: {
            name: form.name.trim() || hook.path,
            methods: form.methods,
            requireToken: form.requireToken,
            responseStatus: form.responseStatus,
            responseContentType: form.responseContentType,
            responseBody: form.responseBody,
          },
        });
        toast("Hook updated");
        onSaved?.(hook._id);
      } else {
        const created = await createHook({
          name: form.name.trim(),
          path: form.path.trim(),
          methods: form.methods,
          requireToken: form.requireToken,
          responseStatus: form.responseStatus,
          responseContentType: form.responseContentType,
          responseBody: form.responseBody,
        });
        toast("Hook created — copy the URL and start sending requests");
        onSaved?.(created?._id ?? "");
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const statusIsPreset = STATUS_PRESETS.includes(form.responseStatus);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit hook" : "Create a new hook"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this hook's methods and response settings."
              : "Pick a path — your hook will live at /api/hook/<path>."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hook-name">Name</Label>
              <Input
                id="hook-name"
                placeholder="License check"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hook-path">
                Path {isEdit ? "(locked)" : ""}
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">/api/hook/</span>
                <Input
                  id="hook-path"
                  placeholder="license-check"
                  value={form.path}
                  onChange={(e) => set("path", e.target.value)}
                  disabled={isEdit}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Allowed methods</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => toggleMethod(method)}
                  className={cn(
                    "cursor-pointer rounded-md border px-2.5 py-1 font-mono text-xs font-semibold transition-colors",
                    form.methods.includes(method)
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Response</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={statusIsPreset ? String(form.responseStatus) : "custom"}
                onValueChange={(value) =>
                  set("responseStatus", value === "custom" ? 200 : Number(value))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Status code" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_PRESETS.map((status) => (
                    <SelectItem key={status} value={String(status)}>
                      {status}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
              {!statusIsPreset && (
                <Input
                  type="number"
                  min={100}
                  max={599}
                  value={form.responseStatus}
                  onChange={(e) => set("responseStatus", Number(e.target.value))}
                  className="font-mono"
                />
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Select
                value={form.responseContentType}
                onValueChange={(value) => set("responseContentType", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Content type" />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="hidden sm:block" />
            </div>
            <Textarea
              className="mt-1 min-h-24 font-mono text-[13px]"
              value={form.responseBody}
              onChange={(e) => set("responseBody", e.target.value)}
              placeholder='{"ok":true}'
            />
            <p className="text-xs text-muted-foreground">
              Returned verbatim to every caller. JSON is validated before saving.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3.5 py-3">
            <div>
              <p className="text-sm font-medium">Require secret token</p>
              <p className="text-xs text-muted-foreground">
                Callers must pass the hook token (header, Bearer, or ?bypass=).
              </p>
            </div>
            <Switch
              checked={form.requireToken}
              onCheckedChange={(checked) => set("requireToken", checked)}
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="cursor-pointer">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create hook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
