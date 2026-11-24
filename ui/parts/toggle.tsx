import { Toggle as TogglePrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* A toggle is the prototype's chip (.chip, hub.css 141-143): 32px, line-strong border, mono caps 12px 0.08em; on, it
   takes the tint and the accent border. */
export const chipClass =
  "inline-flex h-control-sm shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control border border-line-strong bg-bg px-3 font-mono text-small uppercase tracking-chip text-ink-2 transition-colors " +
  "hover:border-ink-2 focus-visible:shadow-glow focus-visible:outline-none disabled:pointer-events-none disabled:opacity-(--disabled-opacity) [&_svg]:size-icon-sm [&_svg]:shrink-0";
export const chipOnClass = "data-[state=on]:border-accent data-[state=on]:bg-accent-tint data-[state=on]:text-ink-1";

export function Toggle({ className, ...props }: React.ComponentProps<typeof TogglePrimitive.Root>) {
  return <TogglePrimitive.Root className={cn(chipClass, chipOnClass, className)} {...props} />;
}

/* The chip as a plain element, for a filter that is a link or a static label. */
export function Chip({ className, on, ...props }: React.ComponentProps<"span"> & { on?: boolean }) {
  return <span data-state={on ? "on" : "off"} className={cn(chipClass, chipOnClass, className)} {...props} />;
}
