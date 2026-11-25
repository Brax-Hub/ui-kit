import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { capClass } from "./label.tsx";

/* An app's frame under the hub's header (hub.css 167-178, "layout"): the body is a row (.body, 167), the rail on its
   left holds the app's own navigation (.rail, 169: 240px, a hairline on its right, items 2px apart, 16px 12px of
   padding), the main column takes the rest (.main, 175). Added with FE04: the module kit's sample app and Entity Hub
   each drew this frame themselves. The hub draws the header above a module's page, so the frame has none. */
export function AppFrame({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-h-screen bg-bg text-ink-1", className)} {...props} />;
}

/* .rail (hub.css 169). A landmark: give it the name of what it navigates (aria-label="Mail folders"). */
export function Rail({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav className={cn("flex w-rail shrink-0 flex-col gap-0.5 border-r border-line bg-bg px-3 py-4", className)} {...props} />;
}

/* .ri (hub.css 170-172): 40px, 12px between the icon and the word, ink-2, the wash on hover; the item of the view in
   front takes the accent tint and ink-1 (.ri.on). In the text face, as the kit's values sample sets it (ADR-039 D5).
   `asChild` hands the look to a router's link, which marks the page in front itself (aria-current="page"); `on` marks
   it by hand. */
export function RailItem({ className, on, asChild = false, type, ...props }: React.ComponentProps<"button"> & { on?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex h-control w-full shrink-0 cursor-pointer items-center gap-3 rounded-control px-3 text-left text-body text-ink-2 transition-colors hover:bg-wash focus-visible:shadow-glow focus-visible:outline-none " +
          "aria-[current=page]:bg-accent-tint aria-[current=page]:text-ink-1 [&_svg]:size-icon [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

/* .ri .n (hub.css 173): the count at the right of a rail item, in the mono face. */
export function RailCount({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("ml-auto font-mono text-small text-ink-3", className)} {...props} />;
}

/* .eyebrow (hub.css 174): the small uppercase label over a group of rail items. */
export function RailLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(capClass, "px-3 pt-4 pb-1.5", className)} {...props} />;
}

/* .main (hub.css 175): the column beside the rail; it scrolls with the page. */
export function AppMain({ className, ...props }: React.ComponentProps<"main">) {
  return <main className={cn("flex min-w-0 flex-1 flex-col", className)} {...props} />;
}

/* .toolbar (hub.css 178): the controls over a list, 8px apart, wrapping. The gutter is the page's, not the toolbar's. */
export function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="toolbar" className={cn("flex flex-wrap items-center gap-2", className)} {...props} />;
}
