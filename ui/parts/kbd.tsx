import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

/* A key (.kbd, hub.css 164): mono 12px, line-strong border, 6px padding, 20px line, ink-3. */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return <kbd className={cn("inline-block border border-line-strong bg-bg px-1.5 font-mono text-small leading-5 text-ink-3", className)} {...props} />;
}
