/* What counts as a colour, face, spacing or radius written by hand. One list, used twice: by the kit on its own
   files (test/no-literals.test.mjs: nothing outside values.css) and by an app on its screens (app.mjs: nothing at
   all). Comments are ignored; page text is not, so a page says "the text face", not the face's name. Tailwind's own
   scale names (text-sm, rounded-md, font-medium, shadow-lg …) are refused too: the theme drops them, so they would
   silently style nothing. */

/* blank out comments but keep every line, so line numbers stay right */
export const blankComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " ")).replace(/^(\s*)\/\/.*$/gm, "$1");

const prefixes = "bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|shadow|divide|placeholder";

export const rules = [
  { name: "a hex colour", re: /#[0-9a-fA-F]{3,8}\b(?![-\w])/ },
  { name: "a colour function", re: /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/ },
  { name: "a named colour", re: /(^|[\s:;,("'])(white|black|red|blue|green|yellow|orange|gray|grey|purple|pink|navy|silver)([\s;,)"']|$)/i, only: [".css"] },
  { name: "a Tailwind palette class", re: new RegExp(`\\b(${prefixes})-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)(-\\d+)?\\b`) },
  { name: "a Tailwind colour with an alpha", re: new RegExp(`\\b(${prefixes})-[a-z-]+\\/\\d+\\b`) },
  { name: "a Tailwind scale name the theme drops", re: /\b(text-(xs|sm|base|lg|xl|\dxl)|font-(sans|serif|thin|extralight|light|normal|medium|semibold|bold|extrabold|black)|shadow-(xs|sm|md|lg|xl|2xl|none|inner)|tracking-(tighter|tight|normal|wide|wider|widest)|leading-(none|tight|snug|normal|relaxed|loose)|(bg|text|border)-(background|foreground|muted|card|popover|primary|secondary|destructive|input|ring)(-\w+)?)\b/ },
  { name: "an arbitrary colour or size in a class", re: /-\[(#|rgb|hsl|oklch|color|\d+(\.\d+)?(px|rem|em|pt))/ },
  { name: "a font name or face", re: /\b(Inter|Kinetika|Etica|Segoe|Helvetica|Arial|Menlo|Consolas|monospace|sans-serif|system-ui)\b|font-family\s*:(?!\s*var\()/ },
  { name: "a radius", re: /border-radius|\brounded(?!-(control|pill)\b)(?!\s*:)[-\w]*/ },
  { name: "a length in px, rem or em", re: /(^|[\s:(,])-?\d+(\.\d+)?(px|rem|em)\b/, only: [".css"] },
  { name: "a length in a style attribute", re: /style\s*=\s*["'][^"']*\d(px|rem|em)/ },
  { name: "a length in a style object", re: /style=\{\{[^}]*\d(px|rem|em)\b/ },
];

/** Every literal in one file's text, as `{ line, rule, found }`. `ext` is the file's extension with its dot. */
export function findLiterals(text, ext) {
  const hits = [];
  blankComments(text).split(/\r?\n/).forEach((code, i) => {
    for (const rule of rules) {
      if (rule.only && !rule.only.includes(ext)) continue;
      const m = code.match(rule.re);
      if (m) hits.push({ line: i + 1, rule: rule.name, found: m[0].trim() });
    }
  });
  return hits;
}
