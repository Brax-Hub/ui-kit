import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Button } from "./button.tsx";

/* The prototype's notice (.notice, hub.css 220-223): a flat band, 12px 16px padding, bg-2 by default, the warn or
   risk tint, or the accent tint; no icon, no border; one link on the right. shadcn's `variant` names map to tones.
   `info` is the tint of the info state since 0.3.0 (it was bg-2 before the kit had that state); `neutral` is bg-2. */
const tones = {
  neutral: "bg-bg-2",
  info: "bg-info-bg",
  accent: "bg-accent-tint text-ink-1",
  ok: "bg-ok-bg",
  warn: "bg-warn-bg",
  risk: "bg-risk-bg",
} as const;
const aliases: Record<string, keyof typeof tones> = { default: "neutral", success: "ok", warning: "warn", danger: "risk", destructive: "risk" };

export type AlertProps = ComponentProps<"div"> & { tone?: keyof typeof tones; variant?: string; title?: ReactNode; action?: ReactNode };

export function Alert({ tone, variant, title, children, action, className, ...props }: AlertProps) {
  const t = tone ?? (variant ? (aliases[variant] ?? (variant as keyof typeof tones)) : "neutral");
  return (
    <div role={t === "risk" ? "alert" : "status"} data-tone={t} className={cn("flex items-start gap-3 px-4 py-3 text-body text-ink-1", tones[t], className)} {...props}>
      <div className="min-w-0 flex-1">
        {title ? <div className="font-display font-strong text-title tracking-row-title">{title}</div> : null}
        {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("font-display font-strong text-title tracking-row-title", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("text-body", className)} {...props} />;
}

/* The empty state (.empty, hub.css 237; Components "Trash is empty."): one sentence, left-aligned, 64px 32px
   padding, then the one button if there is a way out. */
export function EmptyState({ children, action, className, compact }: { children: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-start gap-4", compact ? "p-7" : "px-8 py-16", className)}>
      <p className="max-w-170 text-body">{children}</p>
      {action}
    </div>
  );
}

/* The banner over the content (.banner, hub.css 227): the warn tint, an icon, the sentence, one link. */
export function Banner({ icon, children, action, className, ...props }: ComponentProps<"div"> & { icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-3 border-b border-line bg-warn-bg px-6 py-2.5 text-body", className)} {...props}>
      {icon ? <span className="shrink-0 [&_svg]:size-icon">{icon}</span> : null}
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

/* The inline caps link the notices and rows use (.link, hub.css 114). */
export function Link({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button variant="link" className={className} {...props} />;
}
