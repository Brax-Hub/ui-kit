import type * as React from "react";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "./dialog.tsx";

/* The right-hand sheet by its own name (hub.css 212-218); the same part as Dialog, with the side and the wide
   (560px, .sheet-w) choice spelled out. */
export const Sheet = Dialog;
export const SheetTrigger = DialogTrigger;
export const SheetClose = DialogClose;
export const SheetPortal = DialogPortal;
export const SheetOverlay = DialogOverlay;
export const SheetHeader = DialogHeader;
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;
export const SheetBody = DialogBody;
export const SheetFooter = DialogFooter;

export function SheetContent({ side = "end", ...props }: React.ComponentProps<typeof DialogContent>) {
  return <DialogContent side={side} {...props} />;
}
