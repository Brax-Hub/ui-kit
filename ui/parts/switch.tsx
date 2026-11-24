import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* .sw (hub.css 130-133): 44 x 24 pill, 3px padding, 18px knob; off on bg-3 with an ink-4 knob, on takes the accent
   with the knob in --on-accent (the prototype writes white; see values.css departure 3). */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-switch-h w-switch-w shrink-0 cursor-pointer items-center rounded-pill bg-bg-3 p-0.75 transition-colors",
        "focus-visible:shadow-glow focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-(--disabled-opacity) data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-knob rounded-pill bg-ink-4 transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-on-accent" />
    </SwitchPrimitive.Root>
  );
}
