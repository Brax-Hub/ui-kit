import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { menuItemClass, menuSeparatorClass } from "./dropdown-menu.tsx";
import { DialogOverlay, DialogPortal } from "./dialog.tsx";

/* A command list in the look of the prototype's search box and menu: the input is the search box (hub.css 153,
   40px, bg-2), the items are menu items (.mi), the group heading a small caps label. CommandDialog opens it as a
   popover under the header (.pop, hub.css 201), 560px wide, not a centred dialog. */
export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn("flex h-full w-full flex-col overflow-hidden bg-bg text-ink-1", className)} {...props} />;
}

export function CommandDialog({ children, title, className, ...props }: React.ComponentProps<typeof DialogPrimitive.Root> & { title: string; className?: string }) {
  return (
    <DialogPrimitive.Root {...props}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className={cn("fixed top-header left-1/2 z-50 w-sheet-wide max-w-full -translate-x-1/2 overflow-hidden border border-line bg-bg shadow-pop outline-none animate-fade-in", className)}>
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <Command>{children}</Command>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex h-control items-center gap-2.5 border-b border-line bg-bg-2 px-3 text-ink-3" cmdk-input-wrapper="">
      <Search className="size-icon shrink-0" aria-hidden />
      <CommandPrimitive.Input className={cn("h-full w-full bg-transparent text-body text-ink-1 outline-none placeholder:text-ink-3 disabled:cursor-not-allowed", className)} {...props} />
    </div>
  );
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn("max-h-90 overflow-x-hidden overflow-y-auto py-1.5", className)} {...props} />;
}

export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="px-4 py-6 text-center text-body text-ink-3" {...props} />;
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn("overflow-hidden text-ink-1 [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-small [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-caps [&_[cmdk-group-heading]]:text-ink-3", className)}
      {...props}
    />
  );
}

export function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className={cn(menuSeparatorClass, className)} {...props} />;
}

export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item className={cn(menuItemClass, "data-[selected=true]:bg-wash data-[disabled=true]:pointer-events-none data-[disabled=true]:text-ink-3", className)} {...props} />;
}

export function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("ml-auto font-mono text-small text-ink-3", className)} {...props} />;
}
