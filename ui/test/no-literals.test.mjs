/* FE01: no colour, face, spacing or radius is written anywhere but values.css (ui-kit AGENTS.md; ADR-039 rule 3).
   Scans every source file of the kit except the values file, this test folder, the documented @font-face layer in
   fonts/, documentation and package files. Comments are ignored; page text is not, so a page says "the text face",
   not the face's name. Fails naming every literal it finds, with file and line. */
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

const rules = [
  { name: "a hex colour", re: /#[0-9a-fA-F]{3,8}\b(?![-\w])/ },
  { name: "a colour function", re: /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/ },
  { name: "a named colour", re: /(^|[\s:;,("'])(white|black|red|blue|green|yellow|orange|gray|grey|purple|pink|navy|silver)([\s;,)"']|$)/i, only: [".css"] },
  { name: "a Tailwind palette class", re: /\b(bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|shadow|divide|placeholder)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)(-\d+)?\b/ },
  { name: "an arbitrary colour or size in a class", re: /-\[(#|rgb|hsl|oklch|color|\d+(\.\d+)?(px|rem|em|pt))/ },
  { name: "a font name or face", re: /\b(Inter|Kinetika|Etica|Segoe|Helvetica|Arial|Menlo|Consolas|monospace|sans-serif|system-ui)\b|font-family\s*:(?!\s*var\()/ },
  { name: "a radius", re: /border-radius|\brounded(?!-(control|pill)\b)[-\w]*/ },
  { name: "a length in px, rem or em", re: /(^|[\s:(,])-?\d+(\.\d+)?(px|rem|em)\b/, only: [".css"] },
  { name: "a length in a style attribute", re: /style\s*=\s*["'][^"']*\d(px|rem|em|%)/ },
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

test("values.css carries every colour the theme names", () => {
  const values = readFileSync(join(root, "values.css"), "utf8");
  const theme = readFileSync(join(root, "theme.css"), "utf8");
  const referenced = [...theme.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]);
  const missing = referenced.filter((v) => !new RegExp(`--${v}:`).test(values));
  assert.deepEqual(missing, [], "theme.css reads variables values.css does not define");
});
