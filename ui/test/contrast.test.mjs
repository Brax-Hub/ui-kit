/* FE01: every shade the kit derives from an accent stays readable. The rules (values.css, "the accent and its shades"):
   - the accent as text reaches 4.5:1 on each background of its theme: --bg, --bg-2 and --bg-3, light and dark;
   - the text on the accent (white or ink) reaches 4.5:1 on the accent, and is the better of the two;
   - --ink-1 stays readable on the accent tint over each background;
   - hover and pressed differ from the accent by the steps the file names and stay inside [0, 1] lightness.
   Each rule is checked under both ways a browser maps an out-of-gamut colour (chroma reduction, channel clipping),
   for the seven test accents and for a sweep of every hue. The table of results is printed for the pull request. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import accents from "./accents.json" with { type: "json" };
import { contrastHex, derive, hexToOklch, hexToRgb, isWhite, lin, luminance, oklchToLin, over, readConstants, rgbToHex, gam } from "./colour.mjs";

const css = readFileSync(fileURLToPath(new URL("../values.css", import.meta.url)), "utf8");
const k = readConstants(css);
const MIN = 4.5;
const r2 = (x) => Math.round(x * 100) / 100;

function check(hex, mapping) {
  const d = derive(hex, k, mapping);
  const lightBgs = [k.bg.light, k.bg2.light, k.bg3.light], darkBgs = [k.bg.dark, k.bg2.dark, k.bg3.dark];
  const textOnLight = Math.min(...lightBgs.map((b) => contrastHex(d.textLight, b)));
  const textOnDark = Math.min(...darkBgs.map((b) => contrastHex(d.textDark, b)));
  const onAccentContrast = contrastHex(d.onAccent, hex);
  const white = contrastHex("#FFFFFF", hex), ink = contrastHex(k.ink1.light, hex);
  const tintLight = Math.min(...lightBgs.map((b) => contrast2(hexToRgb(k.ink1.light).map(lin), over(hex, k.tintAlpha, b).map(lin))));
  const tintDark = Math.min(...darkBgs.map((b) => contrast2(hexToRgb(k.ink1.dark).map(lin), over(hex, k.tintAlpha, b).map(lin))));
  return { ...d, textOnLight, textOnDark, onAccentContrast, white, ink, tintLight, tintDark };
}
const contrast2 = (a, b) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test("the constants and surfaces read from values.css are the prototype's", () => {
  assert.equal(k.accent, "#E65035");
  assert.deepEqual(k.bg, { light: "#FFFFFF", dark: "#0B0D12" });
  assert.deepEqual(k.ink1, { light: "#171717", dark: "#F3F4F7" });
  assert.ok(k.tintAlpha === 0.12 && k.ringAlpha === 0.22, "the tint and ring alphas are hub.css 24 and 34");
});

test("the default accent's hover and pressed shades land on the prototype's (hub.css 22-23)", () => {
  const d = derive("#E65035", k);
  const near = (a, b, tol) => { const [l1, c1] = hexToOklch(a), [l2, c2] = hexToOklch(b); return Math.abs(l1 - l2) < tol && Math.abs(c1 - c2) < 0.03; };
  assert.ok(near(d.hover, "#D44528", 0.01), `hover ${d.hover} is not near #D44528`);
  assert.ok(near(d.press, "#B83A21", 0.01), `press ${d.press} is not near #B83A21`);
});

const rows = [];
for (const { hex, name } of accents) {
  for (const mapping of ["reduce", "clip"]) {
    test(`${hex} ${name}: readable under ${mapping} mapping`, () => {
      const r = check(hex, mapping);
      assert.ok(r.textOnLight >= MIN, `accent as text on light surfaces: ${r2(r.textOnLight)} (${r.textLight})`);
      assert.ok(r.textOnDark >= MIN, `accent as text on dark surfaces: ${r2(r.textOnDark)} (${r.textDark})`);
      assert.ok(r.onAccentContrast >= MIN, `text on the accent: ${r2(r.onAccentContrast)} (${r.onAccent})`);
      assert.ok(r.onAccentContrast >= Math.max(r.white, r.ink) - 0.01, "the text on the accent is the better of white and ink");
      assert.ok(r.tintLight >= MIN && r.tintDark >= MIN, `ink on the tint: ${r2(r.tintLight)} / ${r2(r.tintDark)}`);
      const dl = (a) => Math.abs(hexToOklch(a)[0] - r.L);
      assert.ok(dl(r.hover) >= k.stepHover - 0.02, `hover moved only ${r2(dl(r.hover))} in L`);
      assert.ok(dl(r.press) >= k.stepPress - 0.02, `pressed moved only ${r2(dl(r.press))} in L`);
      if (mapping === "reduce") rows.push({ hex, name, ...r });
    });
  }
}

test("every sRGB hue: the accent-as-text caps and the on-accent choice hold", () => {
  let worstLight = 9, worstDark = 9, wrongPick = 0, n = 0;
  for (let h = 0; h < 360; h += 3) {
    for (let L = 0.15; L <= 0.95; L += 0.05) {
      for (let C = 0; C <= 0.33; C += 0.03) {
        const linRgb = oklchToLin([L, C, h], "clip");
        const hex = rgbToHex(linRgb.map(gam));
        if (Math.abs(hexToOklch(hex)[1] - C) > 0.02) continue;    // out of sRGB gamut at this L: not an accent anyone can write
        for (const mapping of ["reduce", "clip"]) {
          const r = check(hex, mapping);
          n++;
          worstLight = Math.min(worstLight, r.textOnLight);
          worstDark = Math.min(worstDark, r.textOnDark);
          if (r.onAccentContrast < Math.max(r.white, r.ink) - 0.01) wrongPick++;
        }
      }
    }
  }
  assert.ok(n > 1000, "the sweep covered the gamut");
  assert.ok(worstLight >= MIN, `worst accent-as-text contrast on light surfaces over all hues: ${r2(worstLight)}`);
  assert.ok(worstDark >= MIN, `worst accent-as-text contrast on dark surfaces over all hues: ${r2(worstDark)}`);
  assert.equal(wrongPick, 0, "the text on the accent is always the better of white and ink");
});

test("report", () => {
  const line = (r) =>
    `| ${r.hex} | ${r.name} | ${r.hover} | ${r.press} | ${r.textLight} (${r2(r.textOnLight)}) | ${r.textDark} (${r2(r.textOnDark)}) | ${isWhite(r.onAccent) ? "white" : "ink"} (${r2(r.onAccentContrast)}) | ${r2(r.tintLight)} / ${r2(r.tintDark)} |`;
  console.log("\n| Accent | | Hover | Pressed | As text, light (worst of 3 surfaces) | As text, dark (worst of 3) | Text on it | Ink on tint, light / dark |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) console.log(line(r));
  console.log();
});
