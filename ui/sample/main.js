/* The sample page's controls and readout. Theme: writes data-theme on <html>, as a module does on hub.theme.
   Accent: writes the one variable --accent on <html>, as FE03 will. Readout: reads the shades the browser computed
   from values.css (getComputedStyle on probe elements) and shows them with their contrast, so the page is evidence
   of what the CSS does, not of what the test predicts. */
import accents from "../test/accents.json";
import { contrast, isWhite, luminance, parseCssColor, rgbToHex, gam, supportProbes } from "../test/colour.mjs";

const html = document.documentElement;
const root = document.getElementById("sample");

// ---- theme ----
for (const b of root.querySelectorAll("[data-theme-pick]")) {
  b.addEventListener("click", () => setTheme(b.dataset.themePick));
}
function setTheme(name) {
  if (name === "system") html.removeAttribute("data-theme"); else html.dataset.theme = name;
  for (const b of root.querySelectorAll("[data-theme-pick]")) b.setAttribute("aria-pressed", String(b.dataset.themePick === name));
  readout();
}

// ---- accent ----
const chips = document.getElementById("accent-chips");
for (const a of accents) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = chips.dataset.chipClass;
  b.dataset.accent = a.hex;
  b.setAttribute("aria-pressed", "false");
  b.innerHTML = `<i class="${chips.dataset.swatchClass}"></i>${a.hex}`;
  b.firstChild.style.setProperty("--accent", a.hex);
  b.addEventListener("click", () => setAccent(a.hex));
  chips.append(b);
}
function setAccent(hex) {
  html.style.setProperty("--accent", hex);
  for (const b of chips.children) b.setAttribute("aria-pressed", String(b.dataset.accent === hex));
  readout();
}

// ---- readout ----
const probeBox = document.getElementById("probes");
function computed(theme, name) {
  // :scope keeps <html data-theme> out of the match: the two probe regions are the direct children
  const el = probeBox.querySelector(`:scope > [data-theme="${theme}"] > [data-probe="${name}"]`);
  return parseCssColor(getComputedStyle(el).backgroundColor);
}
function hex(c) { return rgbToHex(c.lin.map(gam)); }
function ratio(a, b) { return contrast(luminance(a.lin), luminance(b.lin)); }
function overBg(fg, bg) { // alpha composite in gamma sRGB, as the browser paints the tint over its background
  const f = fg.lin.map(gam), g = bg.lin.map(gam);
  return { lin: f.map((c, i) => (fg.alpha * c + (1 - fg.alpha) * g[i])).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)), alpha: 1 };
}
const r2 = (x) => (Math.round(x * 100) / 100).toFixed(2);

function measure() {
  const m = {};
  for (const theme of ["light", "dark"]) {
    const bgs = ["bg", "bg-2", "bg-3"].map((n) => computed(theme, n));
    const ink = computed(theme, "ink-1");
    const text = computed(theme, "accent-text");
    const tint = computed(theme, "accent-tint");
    m[theme] = {
      text: hex(text),
      textContrast: Math.min(...bgs.map((b) => ratio(text, b))),
      tintContrast: Math.min(...bgs.map((b) => ratio(ink, overBg(tint, b)))),
    };
  }
  const accent = computed("light", "accent"), on = computed("light", "on-accent");
  return {
    accent: hex(accent), hover: hex(computed("light", "accent-hover")), press: hex(computed("light", "accent-press")),
    onAccent: hex(on), onAccentContrast: ratio(on, accent), ...m,
  };
}

function readout() {
  const m = measure();
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  set("r-accent", m.accent); set("r-hover", m.hover); set("r-press", m.press);
  set("r-text-light", `${m.light.text} · ${r2(m.light.textContrast)}:1`);
  set("r-text-dark", `${m.dark.text} · ${r2(m.dark.textContrast)}:1`);
  set("r-on", `${isWhite(m.onAccent) ? "white" : "ink"} · ${r2(m.onAccentContrast)}:1`);
  set("r-tint", `ink on tint ${r2(m.light.tintContrast)}:1 light · ${r2(m.dark.tintContrast)}:1 dark`);
  for (const el of document.querySelectorAll("[data-ok]")) {
    const v = Number(el.dataset.ok === "on" ? m.onAccentContrast : el.dataset.ok === "light" ? m.light.textContrast : m.dark.textContrast);
    el.textContent = v >= 4.5 ? "passes 4.5:1" : "below 4.5:1";
    el.classList.toggle("text-risk", v < 4.5);
  }
}

// the table of all seven accents, measured in this browser
function table() {
  const body = document.getElementById("accent-table");
  const current = html.style.getPropertyValue("--accent");
  const rows = [];
  for (const a of accents) {
    html.style.setProperty("--accent", a.hex);
    const m = measure();
    rows.push(`<tr class="${body.dataset.rowClass}"><td class="${body.dataset.cellClass}"><i class="${body.dataset.swatchClass}" style="--accent: ${a.hex}"></i>${a.hex}</td>` +
      `<td class="${body.dataset.cellClass}">${m.hover}</td><td class="${body.dataset.cellClass}">${m.press}</td>` +
      `<td class="${body.dataset.cellClass}">${m.light.text} <span class="${body.dataset.metaClass}">${r2(m.light.textContrast)}:1</span></td>` +
      `<td class="${body.dataset.cellClass}">${m.dark.text} <span class="${body.dataset.metaClass}">${r2(m.dark.textContrast)}:1</span></td>` +
      `<td class="${body.dataset.cellClass}">${isWhite(m.onAccent) ? "white" : "ink"} <span class="${body.dataset.metaClass}">${r2(m.onAccentContrast)}:1</span></td>` +
      `<td class="${body.dataset.cellClass}">${r2(m.light.tintContrast)}:1 · ${r2(m.dark.tintContrast)}:1</td></tr>`);
  }
  if (current) html.style.setProperty("--accent", current); else html.style.removeProperty("--accent");
  body.innerHTML = rows.join("");
}

// ---- start: ?theme=light|dark|system and ?accent=RRGGBB (no #) pick the start state, for compare.html and screenshots ----
const query = new URLSearchParams(location.search);
const supported = supportProbes.every((p) => CSS.supports("color", p));
document.getElementById("support").hidden = supported;
setTheme(query.get("theme") ?? html.dataset.theme ?? "system");
const wanted = accents.find((a) => a.hex.slice(1).toLowerCase() === (query.get("accent") ?? "").toLowerCase());
setAccent((wanted ?? accents[0]).hex);
table();
window.hubSample = { measure, setAccent, setTheme };
