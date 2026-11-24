import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* The segmented control (.seg, hub.css 134-137): one line-strong border, 36px items separated by hairlines, mono caps
   12px 0.1em in ink-3; the chosen item takes the tint and ink-1. */
export function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root className={cn("inline-flex border border-line-strong", className)} {...props} />;
}

export function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        "inline-flex h-control-mid flex-1 cursor-pointer items-center justify-center gap-1.5 border-l border-line-strong bg-bg px-3 font-mono text-small uppercase tracking-seg text-ink-3 transition-colors first:border-l-0",
        "hover:text-ink-1 focus-visible:shadow-glow focus-visible:outline-none disabled:pointer-events-none disabled:opacity-(--disabled-opacity) data-[state=on]:bg-accent-tint data-[state=on]:text-ink-1 [&_svg]:size-icon-sm",
        className,
      )}
      {...props}
    />
  );
}
