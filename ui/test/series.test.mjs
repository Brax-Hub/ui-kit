/* The colours of a chart's series (values.css, "the colours of a chart's series"; TASKS FE04) read on the page and
   can be told apart, whatever accent the hub's owner picks. The rules, each checked for the seven test accents and
   for a sweep of every sRGB hue, in the light and the dark theme, under both ways a browser maps an out-of-gamut
   colour (chroma reduction, channel clipping):

   - a series is a mark: 3:1 or more against each surface of its theme (--bg, --bg-2, --bg-3);
   - a number printed inside a part (--on-series) is text: 4.5:1 or more on every series;
   - neighbours in the order (1-2, 2-3 … 5-6) are told apart: their distance in OKLab, times 100, is 15 or more,
     and 8 or more as a protanope and as a deuteranope see them (Machado, Oliveira and Fernandes 2009, severity 1.0);
     these are the thresholds of the method the colours were chosen by, which asks for them between neighbours
     because a stacked bar, a legend and a set of lines put a series beside the next one in the order;
   - series 1 keeps the accent's hue, and the rest sit a sixth of the circle apart from one another.

   Not a rule, and printed so it is known: the smallest distance between any two of the six, neighbours or not. It
   falls below 15 (two series of the same lightness, a third of the circle apart), so a chart where any part can
   touch any other (a scatter plot, a map) should use the first two or three, or tell its parts apart another way. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import accents from "./accents.json" with { type: "json" };
import { contrast, deriveSeries, distance, gam, hexToOklch, hexToRgb, lin, linToOklab, luminance, oklabToOklch, oklchToLin, readConstants, rgbToHex, seenBy } from "./colour.mjs";

const css = readFileSync(fileURLToPath(new URL("../values.css", import.meta.url)), "utf8");
const k = readConstants(css);
const MARK = 3, TEXT = 4.5, APART = 15, APART_CVD = 8;
const r1 = (x) => Math.round(x * 10) / 10;
const y = (hex) => luminance(hexToRgb(hex).map(lin));
const surfaces = (theme) => [k.bg[theme], k.bg2[theme], k.bg3[theme]];

function measure(hex, theme, mapping) {
  const series = deriveSeries(hex, k, theme, mapping);
  const onSeries = y(k.onSeries[theme]);
  let mark = Infinity, text = Infinity, apart = Infinity, apartCvd = Infinity, anyTwo = Infinity;
  series.forEach((s, i) => {
    for (const surface of surfaces(theme)) mark = Math.min(mark, contrast(luminance(s), y(surface)));
    text = Math.min(text, contrast(luminance(s), onSeries));
    if (i > 0) {
      const before = series[i - 1];
      apart = Math.min(apart, distance(before, s));
      apartCvd = Math.min(apartCvd, distance(seenBy("protan", before), seenBy("protan", s)), distance(seenBy("deutan", before), seenBy("deutan", s)));
    }
    for (let j = 0; j < i; j++) anyTwo = Math.min(anyTwo, distance(series[j], s));
  });
  return { series, mark, text, apart, apartCvd, anyTwo };
}

test("the series constants read from values.css", () => {
  assert.deepEqual(k.series.turns, [0, 180, 240, 60, 120, 300], "the hue turns of series 1 to 6");
  assert.ok(k.series.light[0] > k.series.light[1] && k.series.dark[0] < k.series.dark[1], "neighbours alternate between two lightnesses in each theme");
  assert.equal(new Set(k.series.turns).size, 6);
  for (const n of [1, 2, 3, 4, 5, 6]) {
    assert.match(css, new RegExp(`--series-${n}: light-dark\\(var\\(--series-${n}-light\\), var\\(--series-${n}-dark\\)\\);`));
    // the dark set is the light set with the dark lightnesses: same turn, same chroma
    const light = css.match(new RegExp(`--series-${n}-light:[^;]*;`))[0], dark = css.match(new RegExp(`--series-${n}-dark:[^;]*;`))[0];
    assert.equal(dark, light.replaceAll("-light", "-dark"), `--series-${n}-dark is not --series-${n}-light with the dark lightness`);
  }
});

const rows = [];
for (const { hex, name } of accents) {
  for (const theme of ["light", "dark"]) {
    for (const mapping of ["reduce", "clip"]) {
      test(`${hex} ${name}: six series on the ${theme} theme under ${mapping} mapping`, () => {
        const m = measure(hex, theme, mapping);
        assert.ok(m.mark >= MARK, `a series against a ${theme} surface: ${r1(m.mark)}:1`);
        assert.ok(m.text >= TEXT, `--on-series on a series: ${r1(m.text)}:1`);
        assert.ok(m.apart >= APART, `neighbours are ${r1(m.apart)} apart`);
        assert.ok(m.apartCvd >= APART_CVD, `neighbours are ${r1(m.apartCvd)} apart for a red-green colour-blind reader`);
        if (mapping === "clip") rows.push({ hex, name, theme, ...m });
      });
    }
  }
}

test("series 1 keeps the accent's hue, and the six hues sit a sixth of the circle apart", () => {
  for (const { hex } of accents) {
    const [, C, h] = hexToOklch(hex);
    if (C < 0.03) continue;                       // an accent with no hue has none to keep
    for (const theme of ["light", "dark"]) {
      const hues = deriveSeries(hex, k, theme, "reduce").map((s) => oklabToOklch(linToOklab(s))[2]);
      const off = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
      assert.ok(off(hues[0], h) < 8, `${hex} ${theme}: series 1 has hue ${r1(hues[0])}, the accent ${r1(h)}`);
      k.series.turns.forEach((turn, i) => assert.ok(off(hues[i], (h + turn) % 360) < 25, `${hex} ${theme}: series ${i + 1} has hue ${r1(hues[i])}, wanted near ${r1((h + turn) % 360)}`));
    }
  }
});

test("every sRGB hue: the six series read and stay apart", () => {
  const worst = { mark: Infinity, text: Infinity, apart: Infinity, apartCvd: Infinity, anyTwo: Infinity };
  const where = {};
  let n = 0;
  for (let h = 0; h < 360; h += 3) {
    for (let L = 0.15; L <= 0.96; L += 0.05) {
      for (let C = 0; C <= 0.33; C += 0.03) {
        const hex = rgbToHex(oklchToLin([L, C, h], "clip").map(gam));
        if (Math.abs(hexToOklch(hex)[1] - C) > 0.02) continue;    // out of sRGB gamut at this L: not an accent anyone can write
        for (const theme of ["light", "dark"]) {
          for (const mapping of ["reduce", "clip"]) {
            const m = measure(hex, theme, mapping);
            n++;
            for (const key of Object.keys(worst)) if (m[key] < worst[key]) { worst[key] = m[key]; where[key] = `${hex} ${theme} ${mapping}`; }
          }
        }
      }
    }
  }
  assert.ok(n > 4000, "the sweep covered the gamut");
  assert.ok(worst.mark >= MARK, `worst series against a surface: ${r1(worst.mark)}:1 (${where.mark})`);
  assert.ok(worst.text >= TEXT, `worst --on-series on a series: ${r1(worst.text)}:1 (${where.text})`);
  assert.ok(worst.apart >= APART, `worst neighbours: ${r1(worst.apart)} apart (${where.apart})`);
  assert.ok(worst.apartCvd >= APART_CVD, `worst neighbours for a red-green colour-blind reader: ${r1(worst.apartCvd)} apart (${where.apartCvd})`);
  console.log(`\nEvery hue (${n} accents by theme and mapping), the worst case of each: a series against a surface ${r1(worst.mark)}:1 (${where.mark}); --on-series on a series ${r1(worst.text)}:1 (${where.text}); neighbours ${r1(worst.apart)} apart (${where.apart}); neighbours for a protanope or a deuteranope ${r1(worst.apartCvd)} apart (${where.apartCvd}); any two of the six ${r1(worst.anyTwo)} apart (${where.anyTwo}).`);
});

test("report", () => {
  console.log("\n| Accent | Theme | Series 1 to 6 | Against a surface (3:1) | Number inside (4.5:1) | Neighbours apart (15) | Neighbours, red-green colour-blind (8) | Any two |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) console.log(`| ${r.hex} ${r.name} | ${r.theme} | ${r.series.map((s) => rgbToHex(s.map(gam))).join(" ")} | ${r1(r.mark)} | ${r1(r.text)} | ${r1(r.apart)} | ${r1(r.apartCvd)} | ${r1(r.anyTwo)} |`);
  console.log();
});
