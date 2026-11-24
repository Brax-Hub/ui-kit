import { Group, Panel, Separator } from "react-resizable-panels";
import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* Resizable panes on react-resizable-panels: the handle is a hairline (the prototype's .rail and .spanel borders,
   hub.css 169, 251) that takes the accent while dragged. */
export function ResizableGroup({ className, ...props }: React.ComponentProps<typeof Group>) {
  return <Group className={cn("flex h-full w-full", className)} {...props} />;
}
export const ResizablePanel = Panel;

export function ResizableHandle({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn("relative w-hairline shrink-0 cursor-col-resize bg-line transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none data-[separator=active]:bg-accent", className)}
      {...props}
    />
  );
}
