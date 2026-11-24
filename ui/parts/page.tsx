import { ChevronRight } from "lucide-react";
import { Fragment, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { capClass } from "./label.tsx";

/* The page frame of Your account and Hub admin (admin.css 4-13): the title row with the accent tick (.ph, h1 24px),
   the intro in ink-3, sections with a 17px title (.sec-h), and the label/value rows (.kv, admin.css 16-20: 64px,
   a 220px label in the display face at 14px). Entity Hub's names: PageHeader, Breadcrumbs, Fact, FactGrid. */
export function Page({ className, wide, ...props }: ComponentProps<"div"> & { wide?: boolean }) {
  return <div className={cn("flex w-full flex-col gap-10 px-10 pt-7 pb-30", wide ? "max-w-290" : "max-w-240", className)} {...props} />;
}

export function PageHeader({ title, description, actions, eyebrow, className, children, ...props }: Omit<ComponentProps<"header">, "title"> & { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className={cn("flex flex-col gap-3", className)} {...props}>
      {eyebrow ? <div className={capClass}>{eyebrow}</div> : null}
      <div className="flex flex-wrap items-center gap-3.5">
        <span aria-hidden className="inline-block h-tick-h w-tick-w shrink-0 bg-accent" />
        <h1 className="min-w-0 text-h1-page">{title}</h1>
        {actions ? <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="max-w-170 text-body text-ink-3">{description}</p> : null}
      {children}
    </header>
  );
}

export function Section({ title, description, actions, className, children, ...props }: Omit<ComponentProps<"section">, "title"> & { title?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-3", className)} {...props}>
      {title ? (
        <div className="flex min-h-control-sm flex-wrap items-center gap-3">
          <h2 className="text-h2-section tracking-row-title">{title}</h2>
          {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {description ? <p className="max-w-170 text-body text-ink-3">{description}</p> : null}
      {children}
    </section>
  );
}

export type Crumb = { label: ReactNode; href?: string };

/* Breadcrumbs in the title zone. Pass `link` to render a router's Link (it gets `href` as `to` only if you map it). */
export function Breadcrumbs({ items, className, link: Link = "a" }: { items: Crumb[]; className?: string; link?: ComponentType<{ href: string; className?: string; children?: ReactNode }> | "a" }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center gap-1 text-body text-ink-3", className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 ? <ChevronRight className="size-icon-sm shrink-0 text-ink-4" aria-hidden /> : null}
            {item.href && !last ? (
              <Link href={item.href} className="truncate outline-none hover:text-ink-1 focus-visible:shadow-glow">
                {item.label}
              </Link>
            ) : (
              <span className={cn("truncate", last && "font-display font-strong text-ink-1")} aria-current={last ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

/* .kvs and .kv (admin.css 16-20): label/value rows under hairlines. */
export function KeyValueList({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("border-t border-line", className)} {...props} />;
}

export function KeyValue({ label, children, actions, className, ...props }: ComponentProps<"div"> & { label: ReactNode; actions?: ReactNode }) {
  return (
    <div className={cn("flex min-h-16 items-center gap-6 border-b border-line py-3 pr-2", className)} {...props}>
      <dt className="w-kv-label shrink-0 font-display font-strong text-title tracking-row-title">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-col gap-0.5 text-body">{children}</dd>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </div>
  );
}

/* A label over a value on a detail page; identifiers pass `mono`. */
export function Fact({ label, children, mono, className }: { label: ReactNode; children: ReactNode; mono?: boolean; className?: string }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className={capClass}>{label}</dt>
      <dd className={cn("min-w-0 truncate text-body [&>*]:max-w-full", mono && "font-mono tabular-nums", empty && "text-ink-3")}>{empty ? "Not set" : children}</dd>
    </div>
  );
}

export function FactGrid({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 lg:grid-cols-4", className)} {...props} />;
}
