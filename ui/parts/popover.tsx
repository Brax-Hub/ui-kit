import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* .pop (hub.css 201): bg, hairline border, the popover shadow, fades in. 16px padding inside unless the caller sets
   its own. */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({ className, align = "start", sideOffset = 4, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 w-72 border border-line bg-bg p-4 text-ink-1 shadow-pop outline-none animate-fade-in data-[state=closed]:animate-fade-out", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
