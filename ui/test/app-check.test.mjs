/* FE04: the check an app runs (check/app.mjs, `brax-ui-check`) refuses what it says it refuses. One failing fixture
   per rule, as the module kit's security scanner has: a small app is written to a temporary folder, one thing is put
   wrong in it, and the check must name that thing. The clean app must pass, so a rule that fires on everything
   fails here too. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkApp, partNames, valueNames } from "../check/app.mjs";

const made = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

/* A small app that is right: the kit's stylesheet, the hub's links, parts imported, classes of the theme only. */
const clean = {
  "package.json": JSON.stringify({ name: "brax-fixture", dependencies: { "@brax-hub/ui": "git+https://github.com/Brax-Hub/ui-kit.git#ui-v0.2.0", react: "^19.0.0" } }, null, 2),
  "src/styles.css": '@import "@brax-hub/ui/ui.css";\n',
  "src/routes/__root.tsx": 'import { hubStylesheetLinks } from "@brax-hub/ui/hub";\nimport appCss from "../styles.css?url";\nexport const links = [{ rel: "stylesheet", href: appCss }, ...hubStylesheetLinks];\n',
  "src/routes/index.tsx": 'import { Button, Page } from "@brax-hub/ui/parts";\nexport function ItemsPage() {\n  return <Page><div className="flex gap-3 text-ink-3"><Button variant="primary">Add</Button></div></Page>;\n}\n',
  "src/server/report.ts": 'export const chartColour = "#2563eb"; // server code draws nothing and is not read\n',
};

function app(changes = {}) {
  const root = mkdtempSync(join(tmpdir(), "brax-ui-check-"));
  made.push(root);
  for (const [file, text] of Object.entries({ ...clean, ...changes })) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

test("an app on the UI kit with nothing of its own passes", () => {
  assert.deepEqual(checkApp(app()), []);
});

/* [what is put wrong, the files that do it, what the check must say] */
const wrong = [
  ["a hex colour in a stylesheet", { "src/styles.css": '@import "@brax-hub/ui/ui.css";\n.brand { color: #2563eb; }\n' }, /src\/styles\.css:2: a hex colour, "#2563eb"/],
  ["a colour function in a screen", { "src/routes/index.tsx": 'export const tint = "rgba(37, 99, 235, 0.12)";\n' }, /index\.tsx:1: a colour function/],
  ["a Tailwind palette class", { "src/routes/index.tsx": 'export const Row = () => <div className="bg-blue-600" />;\n' }, /a Tailwind palette class, "bg-blue-600"/],
  ["a face named in a screen", { "src/routes/index.tsx": 'export const face = { fontFamily: "Helvetica" };\n' }, /a font name or face, "Helvetica"/],
  ["a radius", { "src/routes/index.tsx": 'export const Row = () => <div className="rounded-lg" />;\n' }, /a radius, "rounded-lg"/],
  ["a length in a stylesheet", { "src/styles.css": '@import "@brax-hub/ui/ui.css";\n.wide { padding: 18px; }\n' }, /a length in px, rem or em/],
  ["the accent set again in a stylesheet", { "src/styles.css": '@import "@brax-hub/ui/ui.css";\n:root { --accent: var(--ink-1); }\n' }, /src\/styles\.css:2: a value of the UI kit set again, "--accent"/],
  ["the accent set again from a screen", { "src/routes/index.tsx": 'export const paint = (el: HTMLElement, v: string) => el.style.setProperty("--accent", v);\n' }, /a value of the UI kit set again, "--accent"/],
  ["a theme of the app's own", { "src/styles.css": '@import "@brax-hub/ui/ui.css";\n@theme { --spacing-wide: calc(var(--space) * 9); }\n' }, /a theme, a face or a Tailwind setting of the app's own, "@theme"/],
  ["a face of the app's own", { "src/styles.css": '@import "@brax-hub/ui/ui.css";\n@font-face { src: url("/fonts/mine.woff2"); }\n' }, /a theme, a face or a Tailwind setting of the app's own, "@font-face"/],
  ["Tailwind imported past the kit's theme", { "src/styles.css": '@import "tailwindcss";\n@import "@brax-hub/ui/ui.css";\n' }, /Tailwind imported past the UI kit's theme/],
  ["a font from another origin", { "src/routes/__root.tsx": clean["src/routes/__root.tsx"] + 'export const more = "https://fonts.googleapis.com/css2?family=Roboto";\n' }, /a stylesheet or a font from another origin/],
  ["a parts folder", { "src/components/ui/pill.tsx": 'export const Pill = () => <span className="rounded-pill" />;\n' }, /src\/components\/ui\/pill\.tsx:1: a file in a parts folder of the app's own/],
  ["shadcn's setup file", { "components.json": "{}\n" }, /components\.json:1: the setup file of a parts folder/],
  ["a part under the kit's name", { "src/components/items/button.tsx": 'export function Button() {\n  return <button className="h-control" />;\n}\n' }, /button\.tsx:1: a part declared under the UI kit's name, "Button"/],
  ["a part under the kit's name, as a constant", { "src/components/items/table.tsx": "const Table = () => <table />;\nexport default Table;\n" }, /a part declared under the UI kit's name, "Table"/],
  ["the makings of a part", { "src/components/items/menu.tsx": 'import { DropdownMenu } from "radix-ui";\nexport const ItemMenu = DropdownMenu.Root;\n' }, /menu\.tsx:1: the makings of a part, which belongs in the UI kit's parts, "radix-ui"/],
  ["the makings of a part, an older Radix package", { "src/components/items/tip.tsx": 'import * as Tip from "@radix-ui/react-tooltip";\nexport const ItemTip = Tip.Root;\n' }, /the makings of a part.*"@radix-ui\/react-tooltip"/],
  ["a class merger of the app's own", { "src/lib/utils.ts": 'import { twMerge } from "tailwind-merge";\nexport const merge = twMerge;\n' }, /the makings of a part.*"tailwind-merge"/],
  ["Tailwind as the app's own dependency", { "package.json": JSON.stringify({ dependencies: { "@brax-hub/ui": "x" }, devDependencies: { tailwindcss: "^4.3.4" } }, null, 2) }, /package\.json:\d+: a dependency the UI kit brings, "tailwindcss"/],
  ["a font package", { "package.json": JSON.stringify({ dependencies: { "@brax-hub/ui": "x", "@fontsource-variable/jetbrains-mono": "^5.3.0" } }, null, 2) }, /a dependency the UI kit brings, "@fontsource-variable\/jetbrains-mono"/],
  ["no UI kit in package.json", { "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }, null, 2) }, /the UI kit is not a dependency/],
  ["a stylesheet that does not import the kit", { "src/styles.css": "/* nothing */\n" }, /no stylesheet imports the UI kit/],
  ["a page that does not link the hub's theme", { "src/routes/__root.tsx": 'import appCss from "../styles.css?url";\nexport const links = [{ rel: "stylesheet", href: appCss }];\n' }, /no page links the hub's theme/],
];

for (const [what, files, expected] of wrong) {
  test(`refused: ${what}`, () => {
    const problems = checkApp(app(files));
    assert.ok(problems.some((p) => expected.test(p)), `expected ${expected}, got:\n${problems.join("\n") || "(no problem)"}`);
  });
}

test("a comment may name a colour or a part; only code counts", () => {
  assert.deepEqual(checkApp(app({ "src/routes/index.tsx": '// the old blue was #2563eb and the old Button lived in components/ui\n' + clean["src/routes/index.tsx"] })), []);
});

test("the names the check reads from the kit are the kit's", () => {
  const parts = partNames(), values = valueNames();
  for (const name of ["Button", "Dialog", "Table", "Rail", "AppFrame", "Badge", "Select"]) assert.ok(parts.has(name), `${name} is not read as a part`);
  for (const name of ["accent", "bg", "ink-1", "face-text", "corner", "space"]) assert.ok(values.has(name), `--${name} is not read as a value`);
});

test("brax-ui-check exits 1 with the lines, and 0 on a clean app", () => {
  const cli = fileURLToPath(new URL("../check/cli.mjs", import.meta.url));
  const bad = spawnSync(process.execPath, [cli, app({ "src/styles.css": '@import "@brax-hub/ui/ui.css";\n.brand { color: #2563eb; }\n' })], { encoding: "utf8" });
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stderr, /src\/styles\.css:2: a hex colour/);
  const good = spawnSync(process.execPath, [cli, app()], { encoding: "utf8" });
  assert.equal(good.status, 0, good.stdout + good.stderr);
});
