import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { fieldClass } from "./input.tsx";
import { menuItemClass, menuPanelClass, menuSeparatorClass } from "./dropdown-menu.tsx";

/* The trigger is the prototype's field (select.in, hub.css 120, 124); the list is its menu (.menu, hub.css 202-209). */
export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger className={cn(fieldClass, "cursor-pointer items-center justify-between gap-2 data-[placeholder]:text-ink-4 [&>span]:truncate", className)} {...props}>
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-icon-sm shrink-0 text-ink-3" aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        className={cn(menuPanelClass, "max-h-80 overflow-hidden", position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1", className)}
        {...props}
      >
        <SelectPrimitive.Viewport className={cn("py-1.5", position === "popper" && "w-full min-w-(--radix-select-trigger-width)")}>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item className={cn(menuItemClass, "pr-10", className)} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-4 flex size-icon-sm items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-icon-sm" aria-hidden />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label className={cn("px-4 py-1.5 font-mono text-small uppercase tracking-caps text-ink-3", className)} {...props} />;
}

export function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator className={cn(menuSeparatorClass, className)} {...props} />;
}
