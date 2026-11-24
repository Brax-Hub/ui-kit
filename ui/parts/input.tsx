import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* The prototype's field (.in, hub.css 120-125): 40px, line-strong border, square; focus takes the accent border and
   the glow; an invalid field takes the risk border. Inter, as ADR-039 D5 says for forms. */
export const fieldClass =
  "flex h-control w-full rounded-control border border-line-strong bg-bg px-3 text-body text-ink-1 placeholder:text-ink-4 " +
  "focus-visible:border-accent focus-visible:shadow-glow focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-(--disabled-opacity) aria-[invalid=true]:border-risk";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} className={cn(fieldClass, className)} {...props} />;
}
