/* FE02: every part the four apps use exists in the kit and renders. The list is what each app imports from its own
   components/ui folder (read on 24 November 2026 in Brax-Hub/brax-entity-hub, Brax-Tech-Internal/brax-feedback,
   Brax-Tech-Internal/brax-guide-admin-tinbase and the console of Brax-Hub/brax-hub). The render test bundles the
   sample page's sections with esbuild and renders each to static markup with react-dom/server, so a part that throws
   on mount fails here, with no browser. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/* What Entity Hub lacked (TASKS FE04, the list in Brax-Hub/ui-kit-archive#6): each is a part or a name here now. */
const added = {
  "badge.tsx": ["CountBadge", "countTones"],
  "app-frame.tsx": ["Rail", "RailToggle", "RailGroup", "RailCount"],
  "series.tsx": ["SeriesSwatch", "seriesBg", "seriesFill", "seriesStroke"],
  "calendar.tsx": ["CalendarGrid", "Calendar", "DayItem", "DayMore"],
  "date-picker.tsx": ["DatePicker"],
};

test("the parts added for Entity Hub exist, are exported, and the tones are everywhere a part takes one", () => {
  const index = readFileSync(join(root, "parts", "index.ts"), "utf8");
  for (const [file, names] of Object.entries(added)) {
    const src = readFileSync(join(root, "parts", file), "utf8");
    assert.ok(index.includes(`./${file}`), `parts/index.ts leaves ${file} out`);
    for (const n of names) assert.match(src, new RegExp(`export (function|const) ${n}\\b`), `${file}: ${n}`);
  }
  assert.ok(index.includes("../lib/dates.ts"), "parts/index.ts leaves the date helpers out");
  for (const file of ["badge.tsx", "alert.tsx", "card.tsx", "progress.tsx", "calendar.tsx"]) assert.match(readFileSync(join(root, "parts", file), "utf8"), /\binfo: "/, `${file} takes no info tone`);
  for (const file of ["badge.tsx", "card.tsx", "progress.tsx", "calendar.tsx"]) assert.match(readFileSync(join(root, "parts", file), "utf8"), /\bverified: "/, `${file} takes no verified tone`);
  const pkg = JSON.parse(readFileSync(join(root, "..", "package.json"), "utf8"));
  assert.equal(pkg.exports["./dates"], "./ui/lib/dates.ts");
});

/* The sample page's sections and the parts, bundled once for the tests below. */
let bundle;
async function kit() {
  if (bundle) return bundle;
  // inside node_modules so that the bundle resolves react from the kit's own install (and git ignores it)
  const dir = join(root, "..", "node_modules", ".cache", "ui-parts");
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, "entry.ts");
  writeFileSync(entry, `export { sections } from ${JSON.stringify(join(root, "sample", "sections.tsx"))};\nexport * as parts from ${JSON.stringify(join(root, "parts", "index.ts"))};\n`);
  const out = join(dir, "kit.cjs");
  await build({ entryPoints: [entry], bundle: true, format: "cjs", platform: "node", jsx: "automatic", outfile: out, external: ["react", "react-dom", "react-dom/server"], logLevel: "silent" });
  const made = createRequire(import.meta.url)(out);
  const { renderToStaticMarkup } = await import("react-dom/server");
  const React = await import("react");
  rmSync(dir, { recursive: true, force: true });
  bundle = { ...made, React, markup: (type, props, ...children) => renderToStaticMarkup(React.createElement(type, props, ...children)) };
  return bundle;
}
const count = (html, re) => (html.match(re) ?? []).length;

test("the calendar grid is a grid of whole weeks with one day in the tab order", async () => {
  const { parts, markup } = await kit();
  const html = markup(parts.CalendarGrid, { month: "2026-11", selected: "2026-11-18", today: "2026-11-26", min: "2026-11-03" });
  assert.match(html, /<table[^>]*role="grid"[^>]*aria-label="November 2026"/);
  assert.equal(count(html, /<th scope="col"/g), 7);
  assert.match(html, /<th scope="col" abbr="Monday"[^>]*>Mon<\/th>/, "the week starts on Monday unless told otherwise");
  assert.equal(count(html, /role="gridcell"/g), 42, "November 2026 from Monday is six weeks");
  assert.equal(count(html, /data-day="/g), 42);
  assert.equal(count(html, /tabindex="0"/g), 1, "one day is in the tab order");
  assert.match(html, /data-day="2026-11-18" tabindex="0"/, "the day chosen is the one in the tab order");
  assert.match(html, /<td role="gridcell" aria-selected="true"[^>]*><button[^>]*data-day="2026-11-18"/);
  assert.equal(count(html, /aria-selected="true"/g), 1);
  assert.match(html, /data-day="2026-11-26"[^>]*aria-label="Thursday,? 26 November 2026" aria-current="date"/, "today is named in full and marked");
  assert.equal(count(html, /aria-current="date"/g), 1);
  assert.equal(count(html, /data-outside="true"/g), 12, "six days of October and six of December fill the weeks");
  assert.match(html, /data-day="2026-11-02"[^>]*aria-disabled="true"/, "a day before min cannot be chosen");
  assert.doesNotMatch(html, /data-day="2026-11-03"[^>]*aria-disabled="true"/);

  const sunday = markup(parts.CalendarGrid, { month: "2026-11", weekStartsOn: 0, outsideDays: false, weekNumbers: true, locale: "fr" });
  assert.match(sunday, /<th scope="col" abbr="dimanche"[^>]*>dim\.<\/th>/, "the names are the locale's and the week starts where asked");
  assert.equal(count(sunday, /data-day="/g), 30, "without the neighbours' days only November's are drawn");
  assert.equal(count(sunday, /role="gridcell"/g), 35);
  assert.equal(count(sunday, /<th scope="row"/g), 5, "a week number a row");
  assert.match(sunday, /data-day="2026-11-01" tabindex="0"/, "with no day chosen and no today in the month, the first is in the tab order");

  const month = markup(parts.Calendar, { size: "month", month: "2026-11", today: "2026-11-26", todayLabel: "Today", renderDay: (d) => (d.day === 12 ? d.date : null) });
  assert.match(month, /<h2[^>]*aria-live="polite"[^>]*>November 2026<\/h2>/);
  assert.match(month, /aria-label="Previous month"[\s\S]*aria-label="Next month"/);
  assert.match(month, /<table[^>]*role="grid"[^>]*aria-labelledby="/, "the grid is named by the month over it");
  assert.match(month, /data-day="2026-11-12"[^<]*>12<\/button>2026-11-12/, "what the app gives for a day sits under its number");
});

test("the date field posts a whole date and opens a month", async () => {
  const { parts, markup } = await kit();
  const html = markup(parts.DatePicker, { id: "due", name: "due_on", value: "2026-11-18", required: true });
  assert.match(html, /<input type="text"[^>]*id="due"[^>]*value="2026-11-18"/);
  assert.match(html, /<input type="text"[^>]*required=""/);
  assert.match(html, /<input type="hidden" name="due_on" value="2026-11-18"\/>/, "the form gets the date under the field's name");
  assert.equal(count(html, /name="due_on"/g), 1, "what is being typed is not posted, only the date");
  assert.match(html, /<button[^>]*aria-label="Choose a date"[^>]*aria-haspopup="dialog"|<button[^>]*aria-haspopup="dialog"[^>]*aria-label="Choose a date"/);
});

test("a collapsed rail keeps every item's name and says so", async () => {
  const { parts, markup, React } = await kit();
  const h = React.createElement;
  const rail = (collapsed) => markup(parts.Rail, { "aria-label": "Records", collapsed, onCollapsedChange() {} },
    h(parts.RailToggle, { label: "Collapse the menu" }),
    h(parts.RailItem, { on: true }, h("svg"), "Dashboard"),
    h(parts.RailGroup, { label: "Records" }, h(parts.RailItem, null, h("svg"), "Deadlines", h(parts.RailCount, { tone: "danger" }, "2")), h(parts.RailItem, null, h("svg"), "Entities", h(parts.RailCount, null, "12"))));
  const open = rail(false), shut = rail(true);
  assert.doesNotMatch(open, /<nav[^>]*data-collapsed=""/);
  assert.match(shut, /<nav[^>]*data-collapsed=""/);
  assert.match(open, /aria-label="Collapse the menu" aria-expanded="true"/);
  assert.match(shut, /aria-label="Collapse the menu" aria-expanded="false"/);
  assert.equal(open.match(/<nav id="([^"]+)"/)[1], open.match(/aria-label="Collapse the menu" aria-expanded="true" aria-controls="([^"]+)"/)[1], "the toggle names the rail it controls");
  for (const html of [open, shut]) for (const word of ["Dashboard", "Deadlines", "Entities", ">2<", ">12<", "Records"]) assert.ok(html.includes(word), `"${word}" is gone from the ${html === shut ? "collapsed" : "open"} rail`);
  assert.match(open, /<span data-tone="risk"[^>]*bg-risk[^>]*>2<\/span>/, "the danger count is the red count badge");
  assert.match(shut, /<span data-tone="risk"[^>]*size-dot[^>]*><span class="sr-only">2<\/span><\/span>/, "collapsed, the danger count is a dot that is still read out");
  assert.match(shut, /<span class="sr-only">12<\/span>/, "collapsed, a plain count is read out and not drawn");
  assert.match(open, /<button[^>]*aria-expanded="true"[^>]*>Records/, "open, the group's label opens and closes it");
  assert.doesNotMatch(shut, /<button[^>]*>Records/, "collapsed, the group's label is a line");
  assert.equal(count(shut, /aria-current="page"/g), 1);
});

test("the count badge and the status label take the tones", async () => {
  const { parts, markup } = await kit();
  assert.match(markup(parts.CountBadge, { tone: "danger" }, "2"), /data-tone="risk"[^>]*bg-risk text-on-tone/);
  assert.match(markup(parts.CountBadge, null, "9"), /data-tone="accent"[^>]*bg-accent text-on-accent/, "with no tone the count is the accent's, as before");
  assert.match(markup(parts.CountBadge, { tone: "neutral" }, "12"), /bg-bg-2 text-ink-2/);
  assert.match(markup(parts.Badge, { tone: "info", dot: true }, "Open"), /data-tone="info"[^>]*bg-info-bg[\s\S]*bg-info/);
  assert.match(markup(parts.Badge, { variant: "verified" }, "Verified"), /data-tone="verified"[^>]*bg-verified-bg/);
  assert.match(markup(parts.Alert, { tone: "info" }, "Note"), /data-tone="info"[^>]*bg-info-bg/);
  assert.match(markup(parts.SeriesSwatch, { series: 3 }), /bg-series-3/);
  assert.match(markup(parts.SeriesSwatch, { series: "rest" }), /bg-line-strong/);
  assert.match(markup(parts.Meter, { segments: [{ value: 40, series: 2 }, { value: 10, tone: "line" }] }), /bg-series-2[\s\S]*bg-line-strong/);
});

test("every section of the parts page renders to markup", async () => {
  const { sections, markup } = await kit();
  const failures = [];
  for (const section of sections) {
    try {
      const html = markup(section.render);
      if (!html.includes("<")) failures.push(`${section.title}: empty`);
    } catch (e) {
      failures.push(`${section.title}: ${e.message}`);
    }
  }
  assert.ok(sections.length >= 16, `only ${sections.length} sections`);
  for (const title of ["A rail that collapses", "Chart colours", "Calendar and date picker"]) assert.ok(sections.some((s) => s.title === title), `the parts page has no section "${title}"`);
  assert.deepEqual(failures, [], "a section failed to render");
});
