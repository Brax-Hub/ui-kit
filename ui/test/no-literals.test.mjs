/* FE01 and FE02: no colour, face, spacing or radius is written anywhere but values.css (ui-kit AGENTS.md; ADR-039
   rule 3). Scans every source file of the kit, the parts and the sample pages, except the values file, this test
   folder, the documented @font-face layer in fonts/, documentation and package files. Comments are ignored; page
   text is not, so a page says "the text face", not the face's name. Tailwind's own scale names (text-sm, rounded-md,
   font-medium, shadow-lg …) are refused too: the theme drops them, so they would silently style nothing. Fails
   naming every literal it finds, with file and line. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const skipDirs = new Set(["node_modules", "dist", "test", "fonts", "public"]);
const skipFiles = new Set(["values.css", "package.json", "package-lock.json"]);
const sourceExt = new Set([".css", ".html", ".js", ".mjs", ".ts", ".tsx", ".jsx"]);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!skipDirs.has(name) && !name.startsWith(".")) yield* files(p); continue; }
    const ext = name.slice(name.lastIndexOf("."));
    if (sourceExt.has(ext) && !skipFiles.has(name)) yield p;
  }
}

/* blank out comments but keep every line, so line numbers stay right */
const blankComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " ")).replace(/^(\s*)\/\/.*$/gm, "$1");

const prefixes = "bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|shadow|divide|placeholder";
const rules = [
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

test("no colour, face, spacing or radius outside values.css", () => {
  const hits = [];
  for (const file of files(root)) {
    const ext = file.slice(file.lastIndexOf("."));
    const lines = blankComments(readFileSync(file, "utf8")).split(/\r?\n/);
    lines.forEach((code, i) => {
      for (const rule of rules) {
        if (rule.only && !rule.only.includes(ext)) continue;
        const m = code.match(rule.re);
        if (m) hits.push(`${relative(root, file).split(sep).join("/")}:${i + 1}: ${rule.name} "${m[0].trim()}"`);
      }
    });
  }
  assert.deepEqual(hits, [], `literals outside values.css:\n${hits.join("\n")}`);
});

test("values.css carries every variable the theme and the parts name", () => {
  const values = readFileSync(join(root, "values.css"), "utf8");
  const theme = readFileSync(join(root, "theme.css"), "utf8");
  const referenced = [...theme.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]);
  const missing = referenced.filter((v) => !new RegExp(`--${v}:`).test(values) && !new RegExp(`--${v}:`).test(theme));
  assert.deepEqual(missing, [], "theme.css reads variables values.css does not define");
  const partVars = new Set();
  for (const file of files(join(root, "parts"))) for (const m of readFileSync(file, "utf8").matchAll(/\(--([\w-]+)\)/g)) partVars.add(m[1]);
  const missingInParts = [...partVars].filter((v) => !v.startsWith("radix-") && !new RegExp(`--${v}:`).test(values));
  assert.deepEqual(missingInParts, [], "a part reads a variable values.css does not define");
});
