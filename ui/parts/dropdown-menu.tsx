import { Check, ChevronRight, Circle } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* The prototype's menu (.menu, hub.css 202-209): bg, hairline border, the popover shadow, 6px vertical padding; items
   (.mi) 36px tall, 16px padding, 12px gap, wash on hover, the risk colour for a destructive one (.mi-risk), the
   shortcut (.k2) right in ink-3 12px; separators (.sep) a hairline with 6px margins. Select and Command reuse these. */
export const menuPanelClass = "z-50 min-w-menu-min border border-line bg-bg py-1.5 text-ink-1 shadow-pop animate-fade-in data-[state=closed]:animate-fade-out";
export const menuItemClass =
  "relative flex h-control-mid w-full cursor-pointer select-none items-center gap-3 px-4 text-left text-body text-ink-1 outline-none " +
  "data-[highlighted]:bg-wash focus:bg-wash data-[state=open]:bg-wash data-[disabled]:pointer-events-none data-[disabled]:text-ink-3 [&_svg]:size-icon-sm [&_svg]:shrink-0";
export const menuSeparatorClass = "my-1.5 h-hairline bg-line";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 4, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content sideOffset={sideOffset} className={cn(menuPanelClass, className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuSubTrigger({ className, inset, children, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.SubTrigger className={cn(menuItemClass, inset && "pl-11", className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" aria-hidden />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return <DropdownMenuPrimitive.SubContent className={cn(menuPanelClass, className)} {...props} />;
}

export function DropdownMenuItem({ className, inset, destructive, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { inset?: boolean; destructive?: boolean }) {
  return <DropdownMenuPrimitive.Item className={cn(menuItemClass, inset && "pl-11", destructive && "text-risk", className)} {...props} />;
}

export function DropdownMenuCheckboxItem({ className, children, checked, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem className={cn(menuItemClass, "pl-11", className)} checked={checked} {...props}>
      <span className="absolute left-4 flex size-icon-sm items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(menuItemClass, "pl-11", className)} {...props}>
      <span className="absolute left-4 flex size-icon-sm items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="size-2 fill-current" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, inset, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return <DropdownMenuPrimitive.Label className={cn("px-4 py-1.5 font-mono text-small uppercase tracking-caps text-ink-3", inset && "pl-11", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn(menuSeparatorClass, className)} {...props} />;
}

export function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("ml-auto font-mono text-small text-ink-3", className)} {...props} />;
}
