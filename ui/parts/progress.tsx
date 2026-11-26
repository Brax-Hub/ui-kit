import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../lib/cn.ts";
import { seriesBg, type SeriesNumber } from "./series.tsx";

/* The meter (.meter, hub.css 228-236): 4px on bg-3, square; the fill is ink-1 by default, warn or risk when the
   number is one, the accent when it is progress of an action. */
const tones = { ink: "bg-ink-1", accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", risk: "bg-risk", info: "bg-info", verified: "bg-verified" } as const;

export function Progress({ className, value, tone = "ink", ...props }: React.ComponentProps<typeof ProgressPrimitive.Root> & { tone?: keyof typeof tones }) {
  return (
    <ProgressPrimitive.Root className={cn("relative flex h-meter w-full overflow-hidden bg-bg-3", className)} value={value} {...props}>
      <ProgressPrimitive.Indicator className={cn("h-full transition-all", tones[tone])} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </ProgressPrimitive.Root>
  );
}

/* A meter of several parts (Components "Status and storage"): each segment a share of the whole. A segment that is
   one named part of a whole (a shareholder, a calendar) takes a series colour, in order, by its number: `series: 1`. */
export function Meter({ segments, className, ...props }: React.ComponentProps<"div"> & { segments: { value: number; tone?: keyof typeof tones | "ink-3" | "ink-4" | "line"; series?: SeriesNumber }[] }) {
  const toneClass = { ...tones, "ink-3": "bg-ink-3", "ink-4": "bg-ink-4", line: "bg-line-strong" } as const;
  return (
    <div role="img" className={cn("flex h-meter w-full overflow-hidden bg-bg-3", className)} {...props}>
      {segments.map((s, i) => (
        <i key={i} className={cn("block h-full", s.series ? seriesBg[s.series - 1] : toneClass[s.tone ?? "ink"])} style={{ width: `${Math.max(0, Math.min(100, s.value))}%` }} />
      ))}
    </div>
  );
}
