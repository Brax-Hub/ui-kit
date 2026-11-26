import { ChevronDown, PanelLeft } from "lucide-react";
import { Collapsible, Slot } from "radix-ui";
import * as React from "react";
import { cn } from "../lib/cn.ts";
import { CountBadge, type CountTone } from "./badge.tsx";
import { IconButton } from "./button.tsx";
import { capClass } from "./label.tsx";
import { Tooltip, TooltipProvider } from "./tooltip.tsx";

/* An app's frame under the hub's header (hub.css 167-178, "layout"): the body is a row (.body, 167), the rail on its
   left holds the app's own navigation (.rail, 169: 240px, a hairline on its right, items 2px apart, 16px 12px of
   padding), the main column takes the rest (.main, 175). Added with FE04: the module kit's sample app and Entity Hub
   each drew this frame themselves. The hub draws the header above a module's page, so the frame has none.

   The rail can be drawn as a column of icons (`collapsed`; 0.3.0, for Entity Hub's sidebar): 52px, the width of the
   prototype's own column of icons (.srail, hub.css 250), each item its icon alone with its words in a tooltip on the
   right. The rail remembers nothing: the app holds `collapsed` and is told when the toggle asks to change it, so the
   app decides where the choice is kept and which key flips it. */
export function AppFrame({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-h-screen bg-bg text-ink-1", className)} {...props} />;
}

type RailState = { collapsed: boolean; onCollapsedChange?: (collapsed: boolean) => void; id?: string };
const RailContext = React.createContext<RailState>({ collapsed: false });

/* .rail (hub.css 169). A landmark: give it the name of what it navigates (aria-label="Mail folders").
   `collapsed` draws it as icons; `onCollapsedChange` is what a RailToggle inside it calls. */
export function Rail({ className, collapsed = false, onCollapsedChange, id, children, ...props }: React.ComponentProps<"nav"> & { collapsed?: boolean; onCollapsedChange?: (collapsed: boolean) => void }) {
  const ownId = React.useId();
  const railId = id ?? ownId;
  const state = React.useMemo(() => ({ collapsed, onCollapsedChange, id: railId }), [collapsed, onCollapsedChange, railId]);
  return (
    <RailContext.Provider value={state}>
      <TooltipProvider>
        <nav
          id={railId}
          data-collapsed={collapsed ? "" : undefined}
          className={cn("group/rail flex w-rail shrink-0 flex-col gap-0.5 border-r border-line bg-bg px-3 py-4 transition-[width] data-collapsed:w-rail-collapsed data-collapsed:items-center data-collapsed:px-0", className)}
          {...props}
        >
          {children}
        </nav>
      </TooltipProvider>
    </RailContext.Provider>
  );
}

/* The words of a rail item, for its tooltip when the rail is icons: its text, without the count. */
function wordsOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(wordsOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return node.type === RailCount ? "" : wordsOf(node.props.children);
  return "";
}

/* .ri (hub.css 170-172): 40px, 12px between the icon and the word, ink-2, the wash on hover; the item of the view in
   front takes the accent tint and ink-1 (.ri.on). In the text face, as the kit's values sample sets it (ADR-039 D5).
   `asChild` hands the look to a router's link, which marks the page in front itself (aria-current="page"); `on` marks
   it by hand.
   In a collapsed rail the item is 40px square and shows its icon alone: the words stay in the item, cut off by its
   edge, so its name is unchanged for a screen reader, and they show in a tooltip on the right (`label` sets other
   words). So an item of a rail that collapses needs an icon, first. */
export function RailItem({ className, on, asChild = false, type, label, children, ...props }: React.ComponentProps<"button"> & { on?: boolean; asChild?: boolean; label?: string }) {
  const { collapsed } = React.useContext(RailContext);
  const Comp = asChild ? Slot.Root : "button";
  const item = (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      aria-current={on ? "page" : undefined}
      className={cn(
        "relative flex h-control w-full shrink-0 cursor-pointer items-center gap-3 rounded-control px-3 text-left text-body text-ink-2 transition-colors hover:bg-wash focus-visible:shadow-glow focus-visible:outline-none " +
          "aria-[current=page]:bg-accent-tint aria-[current=page]:text-ink-1 [&_svg]:size-icon [&_svg]:shrink-0 " +
          "group-data-collapsed/rail:w-control group-data-collapsed/rail:overflow-hidden group-data-collapsed/rail:whitespace-nowrap group-data-collapsed/rail:px-2.5",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
  if (!collapsed) return item;
  const words = label ?? wordsOf(children).trim();
  return words ? <Tooltip label={words} side="right">{item}</Tooltip> : item;
}

/* .ri .n (hub.css 173): the count at the right of a rail item, in the mono face. With a tone it is the count badge
   (badge.tsx): `risk` (or `danger`) is the danger count, for what is overdue. In a collapsed rail a plain count is
   not drawn and a toned one is an 8px dot at the icon's corner; both are still read out. */
export function RailCount({ className, tone, children, ...props }: React.ComponentProps<"span"> & { tone?: CountTone }) {
  const { collapsed } = React.useContext(RailContext);
  if (collapsed) {
    const t = tone === "danger" || tone === "destructive" ? "risk" : tone;
    const dot = t === "risk" ? "bg-risk" : t === "info" ? "bg-info" : t === "accent" ? "bg-accent" : null;
    return dot ? (
      <span data-tone={t} className={cn("absolute top-1.5 right-1.5 size-dot rounded-pill", dot, className)} {...props}><span className="sr-only">{children}</span></span>
    ) : (
      <span className="sr-only" {...props}>{children}</span>
    );
  }
  if (tone) return <CountBadge tone={tone} className={cn("ml-auto", className)} {...props}>{children}</CountBadge>;
  return <span className={cn("ml-auto font-mono text-small text-ink-3", className)} {...props}>{children}</span>;
}

/* .eyebrow (hub.css 174): the small uppercase label over a group of rail items. In a collapsed rail it is a hairline
   between the groups, and its words are kept for a screen reader. */
export function RailLabel({ className, children, ...props }: React.ComponentProps<"div">) {
  const { collapsed } = React.useContext(RailContext);
  if (collapsed) return <div className={cn("my-2 h-hairline w-control-sm shrink-0 bg-line", className)} {...props}><span className="sr-only">{children}</span></div>;
  return <div className={cn(capClass, "px-3 pt-4 pb-1.5", className)} {...props}>{children}</div>;
}

/* A group of rail items under a label that opens and closes it (Entity Hub's sidebar groups; the prototype's
   calendar rail does the same, calendar.css 6-7). Open unless told otherwise; `open` and `onOpenChange` let the app
   hold it, so it can keep the group of the page in front open. In a collapsed rail the label is the hairline and the
   group is always open. */
export function RailGroup({ label, open, defaultOpen = true, onOpenChange, className, children, ...props }: Omit<React.ComponentProps<"div">, "children"> & { label: React.ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; children?: React.ReactNode }) {
  const { collapsed } = React.useContext(RailContext);
  const [own, setOwn] = React.useState(defaultOpen);
  const shown = collapsed || (open ?? own);
  return (
    <Collapsible.Root
      open={shown}
      onOpenChange={(next) => { setOwn(next); onOpenChange?.(next); }}
      className={cn("group/railgroup flex flex-col gap-0.5 group-data-collapsed/rail:items-center", className)}
      {...props}
    >
      {collapsed ? (
        <RailLabel>{label}</RailLabel>
      ) : (
        <Collapsible.Trigger className={cn(capClass, "flex w-full cursor-pointer items-center justify-between gap-2 px-3 pt-4 pb-1.5 text-left hover:text-ink-1 focus-visible:shadow-glow focus-visible:outline-none")}>
          {label}
          <ChevronDown aria-hidden className="size-icon-sm shrink-0 transition-transform group-data-[state=closed]/railgroup:-rotate-90" />
        </Collapsible.Trigger>
      )}
      <Collapsible.Content className="flex flex-col gap-0.5 group-data-collapsed/rail:items-center">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

/* The button that collapses the rail and opens it again: the small icon button (.ib-sm, hub.css 111) with its words
   in a tooltip. Inside a Rail it reads the rail's state and calls its `onCollapsedChange`; anywhere else (a toolbar)
   give it `collapsed` and `onCollapsedChange` itself. `label` is what it does, in the app's words ("Collapse the
   menu"); the part has none of its own. */
export function RailToggle({ label, collapsed, onCollapsedChange, className, children, onClick, ...props }: React.ComponentProps<"button"> & { label: string; collapsed?: boolean; onCollapsedChange?: (collapsed: boolean) => void }) {
  const rail = React.useContext(RailContext);
  const now = collapsed ?? rail.collapsed;
  const change = onCollapsedChange ?? rail.onCollapsedChange;
  return (
    <TooltipProvider>
      <Tooltip label={label} side="right">
        <IconButton
          size="sm"
          aria-label={label}
          aria-expanded={!now}
          aria-controls={rail.id}
          onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) change?.(!now); }}
          className={cn("self-end group-data-collapsed/rail:self-center", className)}
          {...props}
        >
          {children ?? <PanelLeft aria-hidden />}
        </IconButton>
      </Tooltip>
    </TooltipProvider>
  );
}

/* .main (hub.css 175): the column beside the rail; it scrolls with the page. */
export function AppMain({ className, ...props }: React.ComponentProps<"main">) {
  return <main className={cn("flex min-w-0 flex-1 flex-col", className)} {...props} />;
}

/* .toolbar (hub.css 178): the controls over a list, 8px apart, wrapping. The gutter is the page's, not the toolbar's. */
export function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="toolbar" className={cn("flex flex-wrap items-center gap-2", className)} {...props} />;
}
