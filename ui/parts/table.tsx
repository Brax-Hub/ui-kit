import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { Skeleton } from "./skeleton.tsx";

/* The prototype's table rows (admin.css 23-33): 64px rows under hairlines, a 40px header row in small caps, wash on
   hover of a clickable row, the tint on a selected one, ink-3 for a row that is off; numbers right and tabular (.num).
   Real table elements, as Entity Hub uses them, with its names (Table, THead, TBody, TR, TH, TD, TableFrame,
   TableMessage, SkeletonRows) and shadcn's (TableHeader, TableBody, TableRow, TableHead, TableCell). */
export function TableFrame({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="table-frame" className={cn("overflow-hidden border border-line bg-bg", className)} {...props} />;
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full caption-bottom border-collapse text-body", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:h-control [&_tr]:border-b [&_tr]:border-line [&_tr]:hover:bg-transparent", className)} {...props} />;
}

export function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TFoot({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot data-slot="table-footer" className={cn("border-t border-line bg-bg-2 font-strong", className)} {...props} />;
}

export function TR({ className, clickable, off, ...props }: React.ComponentProps<"tr"> & { clickable?: boolean; off?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      className={cn("h-row-table border-b border-line transition-colors data-[state=selected]:bg-accent-tint", clickable && "cursor-pointer hover:bg-wash", off && "text-ink-3", className)}
      {...props}
    />
  );
}

export function TH({ className, align, ...props }: React.ComponentProps<"th"> & { align?: "left" | "right" }) {
  return (
    <th
      data-slot="table-head"
      className={cn("h-control px-2 text-left align-middle font-mono text-small font-regular uppercase tracking-caps whitespace-nowrap text-ink-3 first:pl-4 last:pr-4", align === "right" && "text-right", className)}
      {...props}
    />
  );
}

export function TD({ className, align, mono, ...props }: React.ComponentProps<"td"> & { align?: "left" | "right"; mono?: boolean }) {
  return <td data-slot="table-cell" className={cn("px-2 py-2.5 align-middle first:pl-4 last:pr-4", align === "right" && "text-right tabular-nums", mono && "font-mono tabular-nums", className)} {...props} />;
}

export const TableHeader = THead;
export const TableBody = TBody;
export const TableFooter = TFoot;
export const TableRow = TR;
export const TableHead = TH;
export const TableCell = TD;

/* A row-spanning message inside the frame: empty, no results, an error (the prototype's .empty, hub.css 237). */
export function TableMessage({ colSpan, children, action }: { colSpan: number; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-8 py-12">
        <div className="flex flex-col items-start gap-4">
          <p className="text-body">{children}</p>
          {action}
        </div>
      </td>
    </tr>
  );
}

/* Loading is skeleton rows, never a spinner in content (Components, "Rows"). */
export function SkeletonRows({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TR key={r}>
          {Array.from({ length: columns }).map((__, c) => (
            <TD key={c}>
              <Skeleton className="w-3/4" />
            </TD>
          ))}
        </TR>
      ))}
    </>
  );
}
