import { Check, Copy } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cn } from "../lib/cn.ts";
import { Tooltip } from "./tooltip.tsx";

/* An identifier in the mono face with a copy button that shows on hover (Entity Hub's Copyable). Needs a
   TooltipProvider above. */
export function Copyable({ value, className, children, copyLabel = "Copy", copiedLabel = "Copied", ...props }: ComponentProps<"span"> & { value: string; copyLabel?: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className={cn("text-ink-3", className)}>Not set</span>;
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // the clipboard refused (no focus, no permission): nothing to do
    }
  }
  return (
    <span className={cn("group inline-flex max-w-full min-w-0 items-center gap-1", className)} {...props}>
      <span className="min-w-0 truncate font-mono tabular-nums" title={value}>
        {children ?? value}
      </span>
      <Tooltip label={copied ? copiedLabel : copyLabel}>
        <button
          type="button"
          onClick={copy}
          aria-label={`${copyLabel} ${value}`}
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center text-ink-3 opacity-0 outline-none transition-opacity group-hover:opacity-100 hover:bg-wash focus-visible:opacity-100 focus-visible:shadow-glow"
        >
          {copied ? <Check className="size-icon-sm text-ok" aria-hidden /> : <Copy className="size-icon-sm" aria-hidden />}
        </button>
      </Tooltip>
    </span>
  );
}
