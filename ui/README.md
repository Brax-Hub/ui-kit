# The Brax Hub UI kit (`ui/`)

The shared UI kit of ADR-039 "one front end" (`Brax-Hub/contracts`, `decisions/ADR-039-one-front-end.md`): what every
Brax Hub app and admin screen imports so that it looks like the hub without its author doing anything. This folder is
the kit's home beside `kit/`, the module kit; the name is the one the task register uses ("the UI kit").

Three layers, two of them here (TASKS FE01); the parts come with FE02.

| Layer | File | What it is |
| --- | --- | --- |
| 1 Values | `values.css` | One file of CSS variables from the design of record, the owner's prototype of 23 October 2026. Colours for light and dark, the accent and every shade computed from it, the three faces, type sizes, letter-spacing, the spacing step, control sizes, corners, motion. Every value cites its line in the prototype. A screen that is not React links this file alone. |
| 2 Theme | `theme.css` | A Tailwind 4 theme (`@theme inline`) that reads the values: `bg-accent`, `text-ink-2`, `font-display`, `h-control`, `tracking-caps`, `rounded-pill` and the rest. It drops Tailwind's own palette, faces, sizes and radii, so an app can write only what the values file names. |
| entry | `ui.css` | What an app imports: Inter from the pinned package, then the theme. |
| 3 Parts | (FE02) | The shadcn/ui parts on Radix, kept once here. |

## Using it

```css
/* the app's one stylesheet */
@import "@brax-hub/ui/ui.css";
```

Consumers pin a tag of this repository (AGENTS.md: "Publish by tag"); nothing references its working tree.
The app writes no colour, face, spacing or radius of its own (ADR-039 rule 3); `npm test` here shows the check the kit's
own files pass, and FE04 brings the same check to the apps.

**Light and dark.** The hub shell tells a module's page its theme with the `hub.theme` message (HUB-SHELL §4.4,
`theme: "light" | "dark"`); the page writes it as `data-theme="light"` or `"dark"` on `<html>`. No attribute, or
`data-theme="system"`, follows the device. The attribute works on any element too: a dark region inside a light page.

**The accent.** One variable, `--accent`, on `<html>`; FE03 writes it from `hub.theme`. Hover, pressed, the tint, the
focus ring, the accent as text on each background and the text colour on the accent are all computed from it in CSS
at run time, with rules that keep text at 4.5:1 or better (`values.css`, "the accent and its shades"). Nothing is built.

**Faces.** Inter comes from `@fontsource-variable/inter`, pinned in `package.json`. Kinetika and LFT Etica Mono are
licensed to Brax and are not in this repository: the hub serves them as one stylesheet (`fonts/README.md`). Every stack
has system fallbacks.

## Browser support

The colour math needs CSS relative colour syntax with math in a channel (`oklch(from var(--accent) calc(l - 0.045) c h)`),
`light-dark()` and `@property`. Together that is **Chrome and Edge 123, Safari 17.5, Firefox 128** and later (relative
colours: Chrome 119, Safari 16.4, Firefox 128; `light-dark()`: Chrome 123, Safari 17.5, Firefox 120; `@property`:
Chrome 85, Safari 16.4, Firefox 128). An older browser shows the default accent with no shades and the light theme.

## The sample page and the tests

```powershell
cd ui
npm install
npm run dev          # http://localhost:4181/ : the sample page, light, dark and system, with the seven test accents
npm test             # the contrast rules over the test accents and every hue; no literal outside values.css
```

The sample page (`index.html`) is built from the theme's utilities only and reproduces the sections of the prototype's
Components page that need no React part: header, buttons, fields, switches and segmented controls, chips and tabs,
status dots and meters, rows, notices and toasts, people, keys, banners, and the app rail. Its top section switches the
theme and the accent and reads back, from the browser, every shade and its contrast.

To open the prototype beside it from the same server, copy `.env.example` to `.env.local` and point `HUB_PROTOTYPE` at
the prototype's folder: the dev server then serves it at `/prototype/Components.dc.html` and its two licensed faces at
`/prototype-fonts.css`, which the sample page picks up when present. Nothing of the prototype is copied here.
`http://localhost:4181/compare.html?theme=light` (or `dark`) shows the two pages side by side at half size, each at
its 1440px width; `&side=sample` or `&side=prototype` shows one alone. The screenshots in `docs/` were taken there.

`npm test` runs two files with Node's test runner: `test/contrast.test.mjs` (the rules under both ways a browser maps
an out-of-gamut colour, for `test/accents.json` and a sweep of every hue; it prints the table for the pull request) and
`test/no-literals.test.mjs` (no hex, colour function, palette class, font name, radius or px/rem/em length outside
`values.css`).
