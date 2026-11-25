/* The check an app on the UI kit passes (ADR-039 rules 2 and 3; contracts TASKS FE04 "done when": it holds no copy
   of a part and no colour of its own, and it follows the hub's theme). An app runs it in its gate:

     "ui-check": "brax-ui-check"            (package.json; the kit's bin)

   and this repository runs it over the module kit's sample app (test/kit-on-ui.test.mjs).

   What it reads: the app's screens, which are every .css, .html, .js, .jsx, .ts and .tsx file under src/ except
   src/server/ (server code draws nothing) and generated files, plus index.html and public/. What it refuses:

   a colour, face, radius or length    the list in literals.mjs: the look comes from the kit's file of values
   a value of the kit set again        `--accent: …` or any other variable values.css defines
   a theme, a face or Tailwind itself  @theme, @font-face, @plugin, @config, @import "tailwindcss"
   a stylesheet from elsewhere         a font or stylesheet address on another origin
   a parts folder                      src/components/ui/, or shadcn's components.json
   a part under the kit's name         a component declared with the name of a part the kit exports
   a part's makings                    an import of Radix, cmdk, sonner, vaul, react-resizable-panels or tailwind-merge:
                                       a part that is missing is added to ui/parts, not built in the app
   its own copy of what the kit brings a dependency on Tailwind, Radix, a font package and the like in package.json

   And what it requires: the app's stylesheet imports the kit's (`@import "@brax-hub/ui/ui.css"`), and its page links
   the hub's three stylesheets (`hubStylesheets` or `hubStylesheetLinks` from "@brax-hub/ui/hub"), so the accent the
   hub's owner picked wins.

   Each problem is one line: `file:line: what, "the text found"`. An empty list passes. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { blankComments, findLiterals } from "./literals.mjs";

const kit = fileURLToPath(new URL("..", import.meta.url));
const screenExt = new Set([".css", ".html", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const skipDirs = new Set(["node_modules", "dist", ".data", ".tanstack", ".nitro", ".output"]);

/* The makings of a part: the libraries the kit's parts wrap. An app that reaches for one is building a part. */
const makings = /^(radix-ui|@radix-ui\/.+|cmdk|sonner|vaul|react-resizable-panels|tailwind-merge)$/;
/* What the kit brings, so an app that names it too can end up on another version, or with a face of its own. */
const brought = /^(tailwindcss|@tailwindcss\/.+|tailwindcss-animate|tw-animate-css|tailwind-merge|radix-ui|@radix-ui\/.+|cmdk|sonner|vaul|react-resizable-panels|@fontsource\/.+|@fontsource-variable\/.+|shadcn|shadcn-ui)$/;

/** The names of the parts the kit exports (Button, Dialog, Table …), read from the kit's own files. */
export function partNames() {
  const names = new Set();
  for (const file of readdirSync(join(kit, "parts"))) {
    if (!file.endsWith(".tsx")) continue;
    for (const m of readFileSync(join(kit, "parts", file), "utf8").matchAll(/^export (?:function|const) ([A-Z]\w*)/gm)) names.add(m[1]);
  }
  return names;
}

/** The names of the variables the kit's file of values defines (accent, bg, face-text …), without the dashes. */
export function valueNames() {
  return new Set([...readFileSync(join(kit, "values.css"), "utf8").matchAll(/^\s*--([\w-]+)\s*:/gm)].map((m) => m[1]));
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (!skipDirs.has(name)) yield* walk(path); continue; }
    yield path;
  }
}

/** The files of an app that draw its screens. */
export function screenFiles(root) {
  const server = join(root, "src", "server") + sep;
  const files = [];
  for (const path of walk(join(root, "src"))) {
    if (path.startsWith(server) || /\.gen\.\w+$/.test(path) || /\.(test|spec)\.\w+$/.test(path)) continue;
    if (screenExt.has(extname(path))) files.push(path);
  }
  for (const path of walk(join(root, "public"))) if (screenExt.has(extname(path))) files.push(path);
  if (existsSync(join(root, "index.html"))) files.push(join(root, "index.html"));
  return files;
}

/** The problems in one screen file's text. `name` is how the file is called in the lines returned. */
export function checkText(text, name, { parts = partNames(), values = valueNames() } = {}) {
  const ext = extname(name);
  const problems = findLiterals(text, ext).map((h) => `${name}:${h.line}: ${h.rule}, "${h.found}"`);
  blankComments(text).split(/\r?\n/).forEach((code, i) => {
    const at = `${name}:${i + 1}:`;
    const say = (what, found) => problems.push(`${at} ${what}, "${found.trim()}"`);
    for (const m of code.matchAll(/(?:^|[\s;{("'`,[])--([\w-]+)["'`\]]?\s*:/g)) if (values.has(m[1])) say("a value of the UI kit set again", `--${m[1]}`);
    for (const m of code.matchAll(/setProperty\(\s*["'`]--([\w-]+)/g)) if (values.has(m[1])) say("a value of the UI kit set again", `--${m[1]}`);
    let m;
    if ((m = code.match(/@(theme|font-face|plugin|config)\b/))) say("a theme, a face or a Tailwind setting of the app's own", m[0]);
    if ((m = code.match(/@import\s+(?:url\()?["']tailwindcss[^"']*["']/))) say("Tailwind imported past the UI kit's theme", m[0]);
    if ((m = code.match(/(?:https?:)?\/\/[^\s"'`)]+\.(?:css|woff2?|ttf|otf|eot)\b|(?:https?:)?\/\/fonts\.(?:googleapis|gstatic)\.com[^\s"'`)]*/))) say("a stylesheet or a font from another origin", m[0]);
    if (ext !== ".css" && ext !== ".html") {
      if ((m = code.match(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']/))) {
        const spec = m[1] ?? m[2] ?? m[3];
        if (makings.test(spec)) say("the makings of a part, which belongs in the UI kit's parts", spec);
      }
      if ((m = code.match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+|(?:const|let|var)\s+)([A-Z]\w*)\b(?=\s*[(=<:])/)) && parts.has(m[1])) say("a part declared under the UI kit's name", m[1]);
    }
  });
  return problems;
}

/** Every problem in the app at `root`, as lines. An empty list passes. */
export function checkApp(root) {
  const rel = (path) => relative(root, path).split(sep).join("/");
  const parts = partNames(), values = valueNames();
  const problems = [];
  const files = screenFiles(root);
  if (!files.length) return [`${rel(join(root, "src")) || "src"}: no screen files found; is this an app's folder?`];

  let stylesheet = false, hubLinks = false;
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    const name = rel(path);
    if (/^src\/components\/ui\//.test(name)) problems.push(`${name}:1: a file in a parts folder of the app's own, "src/components/ui"`);
    problems.push(...checkText(text, name, { parts, values }));
    const code = blankComments(text);
    if (extname(path) === ".css" && /@import\s+["']@brax-hub\/ui\/(ui|theme)\.css["']/.test(code)) stylesheet = true;
    if (/["']@brax-hub\/ui\/hub["']/.test(code) && /\bhubStylesheet(s|Links)\b/.test(code)) hubLinks = true;
  }
  if (existsSync(join(root, "components.json"))) problems.push(`components.json:1: the setup file of a parts folder of the app's own, "components.json"`);
  if (!stylesheet) problems.push(`src: no stylesheet imports the UI kit, "@import \\"@brax-hub/ui/ui.css\\""`);
  if (!hubLinks) problems.push(`src: no page links the hub's theme, "hubStylesheetLinks from @brax-hub/ui/hub"`);

  const packageFile = join(root, "package.json");
  if (existsSync(packageFile)) {
    const lines = readFileSync(packageFile, "utf8").split(/\r?\n/);
    const pkg = JSON.parse(lines.join("\n"));
    const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
    for (const dep of Object.keys(all)) {
      if (!brought.test(dep)) continue;
      const line = lines.findIndex((l) => l.includes(`"${dep}"`)) + 1;
      problems.push(`package.json:${line}: a dependency the UI kit brings, "${dep}"`);
    }
    if (!all["@brax-hub/ui"]) problems.push(`package.json:1: the UI kit is not a dependency, "@brax-hub/ui"`);
  }
  return problems;
}
