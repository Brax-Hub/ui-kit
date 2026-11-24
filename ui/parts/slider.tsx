import { Slider as SliderPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* The prototype draws no slider; this one is the meter (4px on bg-3) with the accent as the range and the switch's
   18px knob as the thumb, in the page's surface with an accent border. */
export function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn("relative flex w-full touch-none items-center select-none data-[disabled]:opacity-(--disabled-opacity)", className)} {...props}>
      <SliderPrimitive.Track className="relative h-meter w-full grow overflow-hidden bg-bg-3">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-knob cursor-pointer rounded-pill border-2 border-accent bg-bg transition-colors focus-visible:shadow-glow focus-visible:outline-none" />
    </SliderPrimitive.Root>
  );
}
