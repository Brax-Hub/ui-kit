import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* The prototype's checkbox is the native one at 18px in the accent (hub.css 127). This is the same square: 18px,
   line-strong border, square corners; checked it fills with the accent and draws the check in --on-accent. */
export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer inline-flex size-knob shrink-0 cursor-pointer items-center justify-center rounded-control border border-line-strong bg-bg transition-colors",
        "focus-visible:shadow-glow focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-(--disabled-opacity)",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-on-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-on-accent",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/* .check (hub.css 126): a checkbox with its words, 10px apart. */
export function CheckField({ className, children, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root> & { children: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2.5 text-body", className)}>
      <Checkbox {...props} />
      <span>{children}</span>
    </label>
  );
}
