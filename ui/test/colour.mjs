/* Colour math for the tests and the sample page's readout. It mirrors, in JavaScript, what values.css asks the
   browser to compute in CSS, so the rules can be proven without a browser and compared with one.
   sRGB ↔ OKLab/OKLCH after Björn Ottosson (the matrices CSS Color 4 uses); WCAG 2 relative luminance and contrast. */

export const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
}
export const rgbToHex = (rgb) =>
  "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();

export function linToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function oklabToLin([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
export function oklabToOklch([L, a, b]) {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, C < 1e-7 ? 0 : h];
}
export const oklchToOklab = ([L, C, h]) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
export const hexToOklch = (hex) => oklabToOklch(linToOklab(hexToRgb(hex).map(lin)));

const inGamut = (rgb) => rgb.every((c) => c >= -1e-6 && c <= 1 + 1e-6);
const clip01 = (rgb) => rgb.map((c) => Math.min(1, Math.max(0, c)));

/* Two ways a browser brings an out-of-gamut oklch() result onto the screen: clipping each channel, or reducing
   chroma until the colour fits (CSS Color 4 §13.2, which keeps the lightness). The tests prove the rules under
   both. Returns linear sRGB. */
export function oklchToLin(lch, mapping = "reduce") {
  let rgb = oklabToLin(oklchToOklab(lch));
  if (inGamut(rgb)) return clip01(rgb);
  if (mapping === "clip") return clip01(rgb);
  let [L, C, h] = lch, lo = 0, hi = C;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToLin(oklchToOklab([L, mid, h])))) lo = mid; else hi = mid;
  }
  return clip01(oklabToLin(oklchToOklab([L, lo, h])));
}

export const luminance = (linRgb) => 0.2126 * linRgb[0] + 0.7152 * linRgb[1] + 0.0722 * linRgb[2];
export function contrast(y1, y2) {
  const [hi, lo] = y1 > y2 ? [y1, y2] : [y2, y1];
  return (hi + 0.05) / (lo + 0.05);
}
export const isWhite = (hex) => hexToRgb(hex).every((c) => c === 1);
/* what the sample page asks CSS.supports() for: relative colour syntax with math, and light-dark() */
export const supportProbes = ["oklch(from red calc(l - 0.1) c h)", "light-dark(red, blue)"];
export const contrastHex = (a, b) => contrast(luminance(hexToRgb(a).map(lin)), luminance(hexToRgb(b).map(lin)));

/* alpha over a background, composited in gamma sRGB as browsers do */
export function over(fgHex, alpha, bgHex) {
  const f = hexToRgb(fgHex), b = hexToRgb(bgHex);
  return f.map((c, i) => alpha * c + (1 - alpha) * b[i]);
}

/* The constants of the colour math, read from values.css so that the test and the CSS share one source. */
export function readConstants(css) {
  const num = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*([-\\d.]+)(%?)\\s*;`));
    if (!m) throw new Error(`values.css has no --${name}`);
    return m[2] ? Number(m[1]) / 100 : Number(m[1]);
  };
  const pair = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*light-dark\\((#[0-9A-Fa-f]{6}),\\s*(#[0-9A-Fa-f]{6})\\)`));
    if (!m) throw new Error(`values.css has no light-dark --${name}`);
    return { light: m[1].toUpperCase(), dark: m[2].toUpperCase() };
  };
  const accent = css.match(/^\s*--accent:\s*(#[0-9A-Fa-f]{6});/m);
  if (!accent) throw new Error("values.css has no --accent");
  return {
    stepHover: num("accent-step-hover"), stepPress: num("accent-step-press"), flipL: num("accent-flip-l"),
    textMaxL: num("accent-text-max-l"), textMinL: num("accent-text-min-l"), onAccentFlipY: num("on-accent-flip-y"),
    inkY: num("ink-y"), controlFlipY: num("on-accent-control-flip-y"), tintAlpha: num("accent-tint-alpha"), ringAlpha: num("accent-ring-alpha"),
    accent: accent[1].toUpperCase(),
    bg: pair("bg"), bg2: pair("bg-2"), bg3: pair("bg-3"), ink1: pair("ink-1"),
  };
}

/* The shades values.css derives from one accent, as hex, under the given gamut mapping. Each line names the CSS it
   mirrors. */
export function derive(accentHex, k, mapping = "reduce") {
  const [L, C, h] = hexToOklch(accentHex);
  const sign = Math.max(-1, Math.min(1, (L - k.flipL) * 1000));      // clamp(-1, (l - flip) * 1000, 1)
  const to = (lch) => rgbToHex(oklchToLin(lch, mapping).map(gam));
  // c' = c * min(L'/L, (1 - L')/(1 - L)): chroma follows the lightness toward black or white, as values.css does
  const scaled = (L2) => C * Math.min(L2 / Math.max(L, 0.001), (1 - L2) / Math.max(1 - L, 0.001));
  const shade = (L2) => to([L2, scaled(L2), h]);
  const Y = luminance(hexToRgb(accentHex).map(lin));
  const onY = k.inkY + (1 - k.inkY) * Math.max(0, Math.min(1, (k.onAccentFlipY - Y) * 1000000)); // --on-accent, in linear sRGB
  const controlY = k.inkY + (1 - k.inkY) * Math.max(0, Math.min(1, (k.controlFlipY - Y) * 1000000)); // --on-accent-control
  return {
    accent: accentHex.toUpperCase(),
    L, C, h,
    hover: shade(L - k.stepHover * sign),                           // --accent-hover
    press: shade(L - k.stepPress * sign),                           // --accent-press
    textLight: shade(Math.min(L, k.textMaxL)),                      // --accent-text-light
    textDark: shade(Math.max(L, k.textMinL)),                       // --accent-text-dark
    onAccent: rgbToHex([onY, onY, onY].map(gam)),                   // --on-accent
    control: rgbToHex([controlY, controlY, controlY].map(gam)),     // --on-accent-control: the switch knob
    tintAlpha: k.tintAlpha,                                         // --accent-tint: the accent at this alpha
    ringAlpha: k.ringAlpha,                                         // --accent-ring
  };
}

/* A computed colour as a browser reports it (getComputedStyle), to linear sRGB with alpha. Chrome reports a
   relative-colour result in the space it was written in, so oklch(), color(srgb …) and rgb() all occur. */
export function parseCssColor(text) {
  const t = text.trim();
  let m;
  if ((m = t.match(/^rgba?\(([^)]*)\)$/))) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    return { lin: p.slice(0, 3).map((c) => lin(c / 255)), alpha: p[3] ?? 1 };
  }
  if ((m = t.match(/^color\(srgb ([^)]*)\)$/))) {
    const p = m[1].split(/[\s\/]+/).filter(Boolean).map(parseFloat);
    return { lin: p.slice(0, 3).map(lin), alpha: p[3] ?? 1 };
  }
  if ((m = t.match(/^color\(srgb-linear ([^)]*)\)$/))) {
    const p = m[1].split(/[\s\/]+/).filter(Boolean).map(parseFloat);
    return { lin: p.slice(0, 3), alpha: p[3] ?? 1 };
  }
  if ((m = t.match(/^oklch\(([^)]*)\)$/))) {
    const p = m[1].split(/[\s\/]+/).filter(Boolean);
    const L = parseFloat(p[0]), Cc = parseFloat(p[1]), hh = p[2] === "none" ? 0 : parseFloat(p[2]);
    return { lin: oklchToLin([L, Cc, hh], "clip"), alpha: p[3] === undefined ? 1 : parseFloat(p[3]) };
  }
  if ((m = t.match(/^oklab\(([^)]*)\)$/))) {
    const p = m[1].split(/[\s\/]+/).filter(Boolean).map(parseFloat);
    return { lin: clip01(oklabToLin(p.slice(0, 3))), alpha: p[3] ?? 1 };
  }
  if ((m = t.match(/^#[0-9a-fA-F]{6}$/))) return { lin: hexToRgb(t).map(lin), alpha: 1 };
  throw new Error(`cannot parse colour "${text}"`);
}
