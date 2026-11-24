import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* The prototype's buttons (hub.css 96-115): display face, 13px caps 0.04em, 40px tall, square. `primary` is the one
   verb per screen (bg accent, text --on-accent, hover and press shades); `secondary` is the outlined one (hub.css 100,
   dark 102); `ghost` only washes on hover (hub.css 104); `link` is the inline caps link (hub.css 114); `destructive`
   is the ghost in the risk colour (the menu's .mi-risk, hub.css 208). shadcn's `default` and `outline` are accepted
   as aliases of `primary` and `secondary` so an app can move its imports without a rename. */
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent font-display font-strong uppercase tracking-button transition-colors " +
    "focus-visible:shadow-glow focus-visible:outline-none disabled:cursor-default disabled:opacity-(--disabled-opacity) [&_svg]:size-icon [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press",
        default: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press",
        secondary: "border-button-2-line bg-button-2 text-ink-1 hover:bg-button-2-hover hover:text-button-2-hover-text",
        outline: "border-button-2-line bg-button-2 text-ink-1 hover:bg-button-2-hover hover:text-button-2-hover-text",
        ghost: "text-ink-1 hover:bg-wash",
        destructive: "text-risk hover:bg-risk-bg",
        link: "h-auto border-0 px-0 text-small tracking-link text-accent-text hover:underline hover:underline-offset-3",
      },
      size: {
        md: "h-control px-4.5 text-body",
        default: "h-control px-4.5 text-body",
        sm: "h-control-sm px-3 text-small",
        lg: "h-control px-6 text-body",
        icon: "size-control px-0 text-body",
        "icon-sm": "size-control-sm px-0 text-small",
      },
    },
    compoundVariants: [
      // the link is bare text (hub.css 114): no height, padding or gap whatever the size says
      { variant: "link", className: "h-auto gap-0 px-0 text-small" },
    ],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp type={asChild ? undefined : (type ?? "button")} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/* The prototype's icon button (.ib, hub.css 108-111): 40px square, ink-2, wash on hover, tint when `on`. */
export function IconButton({ className, on, size = "md", asChild = false, type, ...props }: React.ComponentProps<"button"> & { on?: boolean; size?: "md" | "sm"; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      data-state={on ? "on" : "off"}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-wash hover:text-ink-1 focus-visible:shadow-glow focus-visible:outline-none disabled:cursor-default disabled:opacity-(--disabled-opacity) [&_svg]:shrink-0",
        size === "sm" ? "size-control-sm [&_svg]:size-icon-sm" : "size-control [&_svg]:size-icon",
        on && "bg-accent-tint text-ink-1",
        className,
      )}
      {...props}
    />
  );
}
