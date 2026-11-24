import { Label as LabelPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* A field's label (.field > span, hub.css 119) and every small uppercase label (.cap, hub.css 78): the mono face,
   12px, 0.14em, ink-3. */
export const capClass = "font-mono text-small uppercase tracking-caps text-ink-3";

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn(capClass, "peer-disabled:cursor-not-allowed peer-disabled:opacity-(--disabled-opacity)", className)} {...props} />;
}

/* .field (hub.css 118): a label over its control, 6px apart. */
export function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

/* The line under a field that failed (Components: "Wrong username or password." in the risk colour). */
export function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return <p role="alert" className={cn("text-body text-risk", className)} {...props} />;
}
