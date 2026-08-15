import { CopyButton } from "@/components/panel/CopyButton";
import { cn } from "@/lib/utils";

/** Dark code block with a copy button, used for the API client examples. */
export function CodeBlock({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-zinc-950",
        className,
      )}
    >
      <div className="absolute right-2 top-2 z-10">
        <CopyButton
          value={code}
          label="Code"
          variant="ghost"
          size="icon"
          className="text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
        />
      </div>
      <pre className="max-h-[480px] overflow-auto p-4 font-mono text-[12px] leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}
