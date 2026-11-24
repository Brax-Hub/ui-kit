import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* The prototype draws no tooltip; this one is the toast's inverted surface (hub.css 35-36) at the small size, square. */
export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 4, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn("z-50 max-w-80 bg-toast-bg px-2.5 py-1.5 text-small text-toast-text animate-fade-in data-[state=closed]:animate-fade-out", className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/* The short form Entity Hub uses: <Tooltip label="Copy"><button/></Tooltip>. Needs a TooltipProvider above. */
export function Tooltip({ label, children, side, ...props }: { label: React.ReactNode; children: React.ReactNode; side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"] } & React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Root {...props}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </TooltipPrimitive.Root>
  );
}
