import type * as React from "react";
import { cn } from "../lib/cn.ts";

/* The colours of a chart's series, as classes (values.css, "the colours of a chart's series"; added with FE04 for
   Entity Hub's ownership chart). The kit holds no chart library and draws no chart: an app draws its own with
   elements or SVG and takes the colour of each part from here, by the part's place in a fixed order.

     <div className={cn("h-7", seriesBg[i])} />          a bar or a part of one
     <path className={seriesStroke[i]} />                a line
     <rect className={seriesFill[i]} />                  an SVG shape
     <span className="text-on-series">42%</span>         a number printed inside a part

   The rules that keep a chart readable, which the colours alone cannot hold:
   - The colour follows the thing, not its rank: a holder keeps its colour when a filter hides another.
   - Six at most. What is left takes `rest` (--line-strong), named "others"; a seventh colour is never made up.
   - Neighbours in the order are told apart by lightness as well as hue, so draw parts in the order of their numbers.
   - Names and numbers beside a chart stay in the text colours; the swatch carries the identity, with the name
     always written next to it.
   - A chart of one series is not coloured by series: its bars are bg-line-strong and the one in front bg-accent
     (the prototype's health.css 2). The states (ok, warn, risk, info) are not series either. */
export type SeriesNumber = 1 | 2 | 3 | 4 | 5 | 6;
export const seriesCount = 6;
export const seriesBg = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-5", "bg-series-6"] as const;
export const seriesFill = ["fill-series-1", "fill-series-2", "fill-series-3", "fill-series-4", "fill-series-5", "fill-series-6"] as const;
export const seriesStroke = ["stroke-series-1", "stroke-series-2", "stroke-series-3", "stroke-series-4", "stroke-series-5", "stroke-series-6"] as const;

/* The key of a legend: a 12px square in the series' colour. The name is written beside it by the caller. */
export function SeriesSwatch({ series, className, ...props }: React.ComponentProps<"span"> & { series: SeriesNumber | "rest" }) {
  return <span aria-hidden data-series={series} className={cn("inline-block size-3 shrink-0", series === "rest" ? "bg-line-strong" : seriesBg[series - 1], className)} {...props} />;
}
