import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* .tabs and .tab (hub.css 144-146): text only, mono caps 12px 0.14em, 44px tall, 24px apart over a hairline; the
   active tab takes the accent as text. No pill, no underline. */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex w-full items-end gap-6 overflow-x-auto border-b border-line", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-control-tall shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap font-mono text-small uppercase tracking-caps text-ink-3 transition-colors",
        "hover:text-ink-1 focus-visible:shadow-glow focus-visible:outline-none disabled:pointer-events-none disabled:opacity-(--disabled-opacity) data-[state=active]:text-accent-text",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 focus-visible:outline-none", className)} {...props} />;
}
