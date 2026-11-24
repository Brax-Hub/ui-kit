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

/* A number tile (Entity Hub's StatTile): the start page's card (.ha-card, hubarea.css 13: hairline frame on the
   surface, 16px 20px padding, 12px between its lines) holding a small caps label, the count in the display face
   (.count, admin.css 81: 28px, 0.02em, tabular) and a meta note under it (.meta, hub.css 198), with the app tile
   square for an icon on the right (.apptile, hub.css 247: 40px, hairline, bg-2). A warn or risk tone colours the
   number, as the status labels colour their dot; never a chart. */
const tileTones = { default: "text-ink-1", ok: "text-ok", warn: "text-warn", risk: "text-risk", accent: "text-accent-text" } as const;
const tileAliases: Record<string, keyof typeof tileTones> = { danger: "risk", warning: "warn", success: "ok" };

export function StatTile({ label, value, subtitle, icon, tone, className, ...props }: Omit<React.ComponentProps<"div">, "title"> & { label: React.ReactNode; value: React.ReactNode; subtitle?: React.ReactNode; icon?: React.ReactNode; tone?: keyof typeof tileTones | "danger" | "warning" | "success" }) {
  const t = tone ? (tileAliases[tone] ?? (tone as keyof typeof tileTones)) : "default";
  return (
    <div data-slot="stat-tile" data-tone={t} className={cn("flex items-start justify-between gap-3 border border-line bg-bg px-5 py-4 text-ink-1", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className={capClass}>{label}</div>
        <div className={cn("font-display font-strong text-count tracking-count tabular-nums", tileTones[t])}>{value}</div>
        {subtitle ? <div className="text-small text-ink-3">{subtitle}</div> : null}
      </div>
      {icon ? <div className="flex size-control shrink-0 items-center justify-center border border-line bg-bg-2 text-ink-1 [&_svg]:size-icon">{icon}</div> : null}
    </div>
  );
}
