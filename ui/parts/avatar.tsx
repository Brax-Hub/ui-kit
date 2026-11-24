import type { ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

/* Initials in a pill (.av, hub.css 161-163): 32px on bg-3 in the display face at 12px, 48px (.av-lg) at 16px, 96px
   (.av-xl, admin.css 60); `accent` is the inverted one (.av-acc: ink on paper), the signed-in person. No photos on
   the hub, so no image slot; the initials come from the name. */
export function initialsOf(name: string): string {
  return (
    name
      .split(/[\s._@-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function Avatar({ name, initials, accent, size = "md", className, ...props }: ComponentProps<"span"> & { name: string; initials?: string; accent?: boolean; size?: "md" | "lg" | "xl" }) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill font-display font-strong tracking-button",
        accent ? "bg-ink-1 text-bg" : "bg-bg-3 text-ink-1",
        size === "xl" ? "size-24 text-h2-small" : size === "lg" ? "size-avatar-lg text-h3" : "size-control-sm text-small",
        className,
      )}
      {...props}
    >
      {initials ?? initialsOf(name)}
    </span>
  );
}
