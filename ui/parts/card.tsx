import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { capClass } from "./label.tsx";

/* A card is a hairline frame on the page's surface (.msg, hub.css 285; the Components board's .cx-frame): square,
   no shadow. Its header carries a small caps label (the prototype's eyebrow, hub.css 174) and a hairline. shadcn's
   CardContent and CardFooter names are kept beside CardBody. */
export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("border border-line bg-bg text-ink-1", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<"header">) {
  return <header className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn(capClass, "font-regular tracking-caps", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-small text-ink-3", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}
export const CardContent = CardBody;

export function CardFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return <footer className={cn("flex items-center gap-3 border-t border-line px-4 py-3", className)} {...props} />;
}
