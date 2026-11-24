import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* Three small labels of the prototype:
   - Badge, the status label (.st, admin.css 42-47; .pill, store.css 41-46): 24px, mono 12px, a tinted background
     (ok, warn, risk, the accent) with the word always and a 6px dot when asked; neutral is bg-2 and ink-2.
   - Tag, the outlined label (.lab, hub.css 281): 22px, line-strong border, mono 11px caps 0.06em.
   - CountBadge, the count on an icon button (.badge, hub.css 112): 18px pill in the accent.
   shadcn's `variant` names are accepted: default and secondary are neutral, outline is the Tag look, destructive is risk. */
export const badgeVariants = cva("inline-flex h-status-label shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-2 font-mono text-small", {
  variants: {
    tone: {
      neutral: "bg-bg-2 text-ink-2",
      ok: "bg-ok-bg text-ink-1",
      warn: "bg-warn-bg text-ink-1",
      risk: "bg-risk-bg text-ink-1",
      accent: "bg-accent-tint text-ink-1",
      outline: "border border-line-strong bg-transparent text-ink-2",
    },
  },
  defaultVariants: { tone: "neutral" },
});

const dotTone = { neutral: "bg-ink-4", ok: "bg-ok", warn: "bg-warn", risk: "bg-risk", accent: "bg-accent", outline: "bg-ink-3" } as const;
const aliases: Record<string, keyof typeof dotTone> = { default: "neutral", secondary: "neutral", destructive: "risk", success: "ok", safe: "ok", warning: "warn", danger: "risk", risky: "risk", info: "accent" };

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean; variant?: string };

export function Badge({ className, tone, variant, dot, children, ...props }: BadgeProps) {
  const t = tone ?? (variant ? (aliases[variant] ?? (variant as keyof typeof dotTone)) : "neutral");
  return (
    <span data-tone={t} className={cn(badgeVariants({ tone: t }), className)} {...props}>
      {dot && <span aria-hidden className={cn("size-dot-sm shrink-0 rounded-pill", dotTone[t])} />}
      {children}
    </span>
  );
}

export function Tag({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("inline-flex h-5.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border border-line-strong px-2 font-mono text-tiny uppercase tracking-link text-ink-2", className)} {...props} />;
}

export function CountBadge({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("inline-flex h-knob min-w-knob items-center justify-center rounded-pill bg-accent px-1.25 font-mono text-tiny text-on-accent", className)} {...props} />;
}
