import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/panel/PageHeader";
import { StatCard } from "@/components/panel/StatCard";
import { CopyButton } from "@/components/panel/CopyButton";
import { api } from "@/convex/_generated/api";
import { formatBytes, formatRelative, getFileUrl } from "@/lib/download";
import { useQuery } from "convex/react";
import { Download, FileArchive, HardDrive, Plus, TerminalSquare, Upload } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";

export default function Overview() {
  const navigate = useNavigate();
  const files = useQuery(api.files.list) ?? [];

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  const totalDownloads = useMemo(
    () => files.reduce((sum, f) => sum + f.downloadCount, 0),
    [files],
  );
  const latest = files[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Your internal file server at a glance."
        actions={
          <Button className="cursor-pointer" onClick={() => navigate("/dashboard/files?upload=1")}>
            <Plus className="size-4" />
            New file
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FileArchive} label="Files" value={files.length} hint="hosted on this server" />
        <StatCard icon={HardDrive} label="Total size" value={formatBytes(totalBytes)} hint="across all files" />
        <StatCard icon={Download} label="Downloads" value={totalDownloads} hint="all time" />
        <StatCard
          icon={Upload}
          label="Latest upload"
          value={latest ? formatRelative(latest._creationTime) : "—"}
          hint={latest ? latest.name : "no files yet"}
        />
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Quick start</CardTitle>
          <CardDescription>
            Upload a build, copy its public link, and share it — downloads are
            public and need no login. Admin actions require signing in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button className="cursor-pointer" onClick={() => navigate("/dashboard/files?upload=1")}>
            <Upload className="size-4" />
            Upload a file
          </Button>
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => navigate("/dashboard/api")}
          >
            <TerminalSquare className="size-4" />
            REST API docs
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Recent files</h2>
          {files.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer text-muted-foreground"
              onClick={() => navigate("/dashboard/files")}
            >
              View all
            </Button>
          )}
        </div>

        {files.length === 0 ? (
          <Card className="border-dashed border-border bg-card/50">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <FileArchive className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Nothing here yet — upload your first file to get a shareable link.
              </p>
              <Button className="cursor-pointer" onClick={() => navigate("/dashboard/files?upload=1")}>
                <Plus className="size-4" />
                Upload a file
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {files.slice(0, 6).map((file) => (
                <li
                  key={file._id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  onClick={() => navigate("/dashboard/files")}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <FileArchive className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {file.name}
                      {file.version && (
                        <span className="ml-2 rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                          v{file.version}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatBytes(file.size)} · {file.downloadCount} downloads ·{" "}
                      {formatRelative(file._creationTime)}
                    </p>
                  </div>
                  <CopyButton
                    value={getFileUrl(file._id)}
                    label="Download link"
                    variant="ghost"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
