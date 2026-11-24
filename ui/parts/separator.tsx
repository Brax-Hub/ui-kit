import { Separator as SeparatorPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* A hairline (.sep, hub.css 209). */
export function Separator({ className, orientation = "horizontal", decorative = true, ...props }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn("shrink-0 bg-line", orientation === "horizontal" ? "h-hairline w-full" : "h-full w-hairline", className)}
      {...props}
    />
  );
}
