import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { buttonVariants } from "./button.tsx";

/* A confirmation is the prototype's bottom sheet (.bsheet, hub.css 219; Components "Empty trash?"): the full width at
   the bottom, hairline above, 28px 32px padding, the title in the display face at 16px with its one line of meta,
   the buttons on the same row, Cancel as a ghost and the action as the primary, both small. */
export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;

export function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim animate-fade-in data-[state=closed]:animate-fade-out" />
      <AlertDialogPrimitive.Content
        className={cn("fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center gap-6 border-t border-line bg-bg px-8 py-7 text-ink-1 outline-none animate-slide-up", className)}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-1 basis-70 flex-col gap-1", className)} {...props} />;
}

export function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn("font-display font-strong text-h3 text-ink-1", className)} {...props} />;
}

export function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn("text-small text-ink-3", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 items-center gap-3", className)} {...props} />;
}

export function AlertDialogAction({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return <AlertDialogPrimitive.Action className={cn(buttonVariants({ variant: "primary", size: "sm" }), className)} {...props} />;
}

export function AlertDialogCancel({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: "ghost", size: "sm" }), className)} {...props} />;
}
