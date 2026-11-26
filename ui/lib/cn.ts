import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* Merges utility classes so a part's caller can override one. The theme's own names are declared, or tailwind-merge
   would read `text-body` as a colour and drop it beside `text-ink-3`, and keep `h-control` beside `h-22`. The names
   are theme.css's: the sizes it gives the spacing scale, the type sizes, weights, faces, tracking, corners, shadows. */
const sizes = [
  "control", "control-sm", "control-mid", "control-tall", "row", "row-table", "header", "rail", "sheet", "sheet-wide", "menu-min", "toast",
  "avatar-lg", "switch-w", "switch-h", "knob", "dot", "dot-sm", "icon", "icon-sm", "icon-lg", "tick-w", "tick-h", "meter", "hairline", "skeleton",
  "kv-label", "status-label", "rail-collapsed", "day", "day-head", "day-number", "day-item", "week-number",
];
const twMerge = extendTailwindMerge({
  extend: {
    theme: { spacing: sizes },
    classGroups: {
      "font-size": [{ text: ["tiny", "small", "body", "title", "lead", "h3", "h2-small", "h2", "h1", "h1-page", "h2-section", "count"] }],
      "font-weight": [{ font: ["regular", "strong"] }],
      "font-family": [{ font: ["text", "mono", "display"] }],
      tracking: [{ tracking: ["caps", "button", "link", "chip", "seg", "title", "row-title", "h3", "count"] }],
      rounded: [{ rounded: ["control", "pill"] }],
      shadow: [{ shadow: ["pop", "glow"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
