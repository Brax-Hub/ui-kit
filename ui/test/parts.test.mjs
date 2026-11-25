/* FE02: every part the four apps use exists in the kit and renders. The list is what each app imports from its own
   components/ui folder (read on 24 November 2026 in Brax-Hub/brax-entity-hub, Brax-Tech-Internal/brax-feedback,
   Brax-Tech-Internal/brax-guide-admin-tinbase and the console of Brax-Hub/brax-hub). The render test bundles the
   sample page's sections with esbuild and renders each to static markup with react-dom/server, so a part that throws
   on mount fails here, with no browser. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));

const used = {
  "Entity Hub (the module kit's app)": ["badge", "button", "alert", "card", "page", "table", "input", "dialog", "tooltip", "copyable", "dropdown-menu"],
  Feedback: ["button", "input", "skeleton", "label", "dialog", "select", "textarea", "card", "badge", "alert-dialog", "switch", "checkbox", "tooltip", "toggle", "tabs", "sonner", "sheet", "separator", "progress", "dropdown-menu", "collapsible"],
  "the Guide's admin": ["button", "label", "input", "textarea", "select", "dialog", "alert-dialog", "switch", "popover", "command", "checkbox", "tabs", "tooltip", "toggle", "skeleton", "sheet", "separator"],
  "Hub administration": ["button", "badge", "toast", "input", "select", "switch", "label", "dialog", "tabs", "card", "tooltip", "checkbox", "textarea", "dropdown-menu", "sheet", "skeleton", "popover", "avatar", "toggle-group", "alert-dialog", "slider", "separator", "resizable", "kbd", "command"],
};

test("every part the four apps use exists in ui/parts", () => {
  const missing = [];
  for (const [app, parts] of Object.entries(used)) for (const p of parts) if (!existsSync(join(root, "parts", `${p}.tsx`))) missing.push(`${app}: ${p}`);
  assert.deepEqual(missing, []);
  const index = readFileSync(join(root, "parts", "index.ts"), "utf8");
  const unexported = [...new Set(Object.values(used).flat())].filter((p) => !index.includes(`./${p}.tsx`));
  assert.deepEqual(unexported, [], "parts/index.ts leaves a part out");
});

/* Parts an app imports by name from inside one of those files (Entity Hub's input.tsx and card.tsx). */
const usedByName = { "label.tsx": ["HelpText"], "card.tsx": ["StatTile"], "badge.tsx": ["Badge", "Tag", "CountBadge"], "alert.tsx": ["Alert", "EmptyState"] };

test("every part an app imports by name is exported", () => {
  const missing = [];
  for (const [file, names] of Object.entries(usedByName)) {
    const src = readFileSync(join(root, "parts", file), "utf8");
    for (const n of names) if (!new RegExp(`export (function|const) ${n}\\b`).test(src)) missing.push(`${file}: ${n}`);
  }
  assert.deepEqual(missing, []);
});

test("every section of the parts page renders to markup", async () => {
  // inside node_modules so that the bundle resolves react from the kit's own install (and git ignores it)
  const dir = join(root, "..", "node_modules", ".cache", "ui-parts");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, "sections.cjs");
  await build({
    entryPoints: [join(root, "sample", "sections.tsx")],
    bundle: true,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    outfile: out,
    external: ["react", "react-dom", "react-dom/server"],
    logLevel: "silent",
  });
  const { sections } = createRequire(import.meta.url)(out);
  const { renderToStaticMarkup } = await import("react-dom/server");
  const React = await import("react");
  const failures = [];
  for (const section of sections) {
    try {
      const html = renderToStaticMarkup(React.createElement(section.render));
      if (!html.includes("<")) failures.push(`${section.title}: empty`);
    } catch (e) {
      failures.push(`${section.title}: ${e.message}`);
    }
  }
  rmSync(dir, { recursive: true, force: true });
  assert.ok(sections.length >= 12, `only ${sections.length} sections`);
  assert.deepEqual(failures, [], "a section failed to render");
});
