/* FE01 and FE02: no colour, face, spacing or radius is written anywhere but values.css (ui-kit AGENTS.md; ADR-039
   rule 3). Scans every source file of the kit, the parts and the sample pages, except the values file, this test
   folder, the check an app runs (check/, which holds the list of what counts and so names colours and faces), the
   documented @font-face layer in fonts/, documentation and package files. Comments are ignored; page text is not, so
   a page says "the text face", not the face's name. Tailwind's own scale names (text-sm, rounded-md, font-medium,
   shadow-lg …) are refused too: the theme drops them, so they would silently style nothing. Fails naming every
   literal it finds, with file and line. The list of what counts is check/literals.mjs, the same one an app's own
   check uses (check/app.mjs). */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findLiterals } from "../check/literals.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const skipDirs = new Set(["node_modules", "dist", "test", "check", "fonts", "public"]);
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

test("no colour, face, spacing or radius outside values.css", () => {
  const hits = [];
  for (const file of files(root)) {
    const ext = file.slice(file.lastIndexOf("."));
    for (const h of findLiterals(readFileSync(file, "utf8"), ext)) hits.push(`${relative(root, file).split(sep).join("/")}:${h.line}: ${h.rule} "${h.found}"`);
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
