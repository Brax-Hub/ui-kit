import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* The prototype has no centred dialog: "dialogs are right-hand sheets, confirmations are bottom sheets, menus anchor
   to what opened them" (Components, "Menus, sheets, selection"). So Dialog is the right-hand sheet (.sheet, hub.css
   212-218): 440px (560 wide), full height, hairline on its left, a 68px header with the title in the display face at
   16px, a scrolling body with 24px padding, a footer with the buttons right. The scrim is hub.css 32. The shadcn API
   (DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose) is kept so an app moves
   its imports without rewriting; DialogBody is the scrolling middle. sheet.tsx adds the `side` and `wide` choices. */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 bg-scrim animate-fade-in data-[state=closed]:animate-fade-out", className)} {...props} />;
}

export type SheetSide = "end" | "start" | "bottom";

export const sheetClass = (side: SheetSide, wide?: boolean) =>
  cn(
    "fixed z-50 flex max-w-full flex-col bg-bg text-ink-1 outline-none",
    side === "end" && cn("inset-y-0 right-0 border-l border-line animate-slide-in", wide ? "w-sheet-wide" : "w-sheet"),
    side === "start" && cn("inset-y-0 left-0 border-r border-line animate-slide-in", wide ? "w-sheet-wide" : "w-sheet"),
    side === "bottom" && "inset-x-0 bottom-0 border-t border-line animate-slide-up",
  );

export function DialogContent({
  className,
  children,
  side = "end",
  wide,
  hideClose,
  closeLabel = "Close",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: SheetSide; wide?: boolean; hideClose?: boolean; closeLabel?: string }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content className={cn(sheetClass(side, wide), className)} {...props}>
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className="absolute top-3.5 right-3 inline-flex size-control cursor-pointer items-center justify-center text-ink-2 hover:bg-wash hover:text-ink-1 focus-visible:shadow-glow focus-visible:outline-none"
            aria-label={closeLabel}
          >
            <X className="size-icon" aria-hidden />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/* .sheet-h (hub.css 214): 68px, hairline below, 24px left padding, room for the close button on the right. */
export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex h-header shrink-0 flex-col justify-center gap-0.5 border-b border-line pr-16 pl-6", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("truncate font-display font-strong text-h3 tracking-h3 text-ink-1", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("truncate text-small text-ink-3", className)} {...props} />;
}

/* .sheet-b (hub.css 216): the scrolling middle, 24px padding, 20px between blocks. */
export function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-6", className)} {...props} />;
}

/* .sheet-f (hub.css 218): hairline above, 16px 24px padding, buttons right with 12px between. */
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 items-center justify-end gap-3 border-t border-line px-6 py-4", className)} {...props} />;
}
