import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { fieldClass } from "./input.tsx";

/* textarea.in (hub.css 123): 88px tall, 10px 12px padding, resizes vertically. */
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "h-22 resize-y px-3 py-2.5", className)} {...props} />;
}
