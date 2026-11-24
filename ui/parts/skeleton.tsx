import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

/* .skel (hub.css 86): a 10px bar on bg-3, square. Loading is skeleton rows, never a spinner in content. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden data-slot="skeleton" className={cn("block h-skeleton animate-pulse bg-bg-3", className)} {...props} />;
}
