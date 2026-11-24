import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* Merges utility classes so a part's caller can override one. The theme's own names are declared, or tailwind-merge
   would read `text-body` as a colour and drop it beside `text-ink-3`. The names are theme.css's. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["tiny", "small", "body", "title", "lead", "h3", "h2-small", "h2", "h1", "h1-page", "h2-section"] }],
      "font-weight": [{ font: ["regular", "strong"] }],
      "font-family": [{ font: ["text", "mono", "display"] }],
      tracking: [{ tracking: ["caps", "button", "link", "chip", "seg", "title", "row-title", "h3"] }],
      rounded: [{ rounded: ["control", "pill"] }],
      shadow: [{ shadow: ["pop", "glow"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
