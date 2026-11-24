# The Brax Hub UI kit (`ui/`)

The shared UI kit of ADR-039 "one front end" (`Brax-Hub/contracts`, `decisions/ADR-039-one-front-end.md`): what every
Brax Hub app and admin screen imports so that it looks like the hub without its author doing anything. This folder is
the kit's home beside `kit/`, the module kit; the name is the one the task register uses ("the UI kit").

Three layers (TASKS FE01 and FE02).

| Layer | Where | What it is |
| --- | --- | --- |
| 1 Values | `values.css` | One file of CSS variables from the design of record, the owner's prototype of 23 October 2026. Colours for light and dark, the accent and every shade computed from it, the three faces, type sizes, letter-spacing, the spacing step, control sizes, corners, motion. Every value cites its line in the prototype. A screen that is not React links this file alone. |
| 2 Theme | `theme.css` | A Tailwind 4 theme (`@theme inline`) that reads the values: `bg-accent`, `text-ink-2`, `font-display`, `h-control`, `tracking-caps`, `rounded-pill` and the rest. It drops Tailwind's own palette, faces, sizes and radii, so an app can write only what the values file names. |
| entry | `ui.css` | What an app imports: Inter from the pinned package, then the theme. |
| 3 Parts | `parts/` | The shadcn/ui parts on Radix, kept once, in the prototype's look: every part the module kit's app (Entity Hub), Feedback, the Guide's admin and Hub administration use. `lib/cn.ts` merges classes. |

## Using it

```css
/* the app's one stylesheet */
@import "@brax-hub/ui/ui.css";
```

```tsx
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Table, TR, TD } from "@brax-hub/ui/parts";
```

Consumers pin a tag of this repository (AGENTS.md: "Publish by tag"); nothing references its working tree. The parts
are TypeScript source (`parts/*.tsx`), compiled by the app's own Vite, as shadcn copies are; the app needs React 19.
The app writes no colour, face, spacing or radius of its own (ADR-039 rule 3); `npm test` here shows the check the kit's
own files and parts pass, and FE04 brings the same check to the apps.

**Light and dark.** The hub shell tells a module's page its theme with the `hub.theme` message (HUB-SHELL §4.4,
`theme: "light" | "dark"`); the page writes it as `data-theme="light"` or `"dark"` on `<html>`. No attribute, or
`data-theme="system"`, follows the device. The attribute works on any element too: a dark region inside a light page.

**The accent.** One variable, `--accent`, on `<html>`; FE03 writes it from `hub.theme`. Hover, pressed, the tint, the
focus ring, the accent as text on each background and the text colour on the accent are all computed from it in CSS
at run time, with rules that keep text at 4.5:1 or better (`values.css`, "the accent and its shades"). Nothing is built.

**Faces.** Inter comes from `@fontsource-variable/inter`, pinned in `package.json`. Kinetika and LFT Etica Mono are
licensed to Brax and are not in this repository: the hub serves them as one stylesheet, decided by the owner on
24 November 2026 (`fonts/README.md`; ADR-039 "Open" 8, task FE08). Every stack has system fallbacks.

## The parts

Each file in `parts/` says which rule of the prototype it draws (`hub.css` and `admin.css` lines). What a reader of
shadcn's names should know:

- **No centred dialog.** The prototype has none ("dialogs are right-hand sheets, confirmations are bottom sheets, menus
  anchor to what opened them"). `Dialog` is the right-hand sheet (`DialogHeader`, `DialogBody`, `DialogFooter`; `Sheet`
  is the same part with `side` and `wide`), `AlertDialog` is the bottom sheet, `CommandDialog` a panel under the header.
- **Buttons** are display-face caps, 40px, square: `primary` (the one verb per screen), `secondary` (outlined), `ghost`,
  `link`, `destructive`; `default` and `outline` are accepted as aliases. `IconButton` is the 40px icon button.
- **Badge** is the status label (tint and dot, with the word); `Tag` the outlined label; `CountBadge` the count on an
  icon button. `Toggle` is the chip, `ToggleGroup` the segmented control, `Tabs` the text-only tabs.
- **Alert** is the flat notice (no icon, no border); `EmptyState`, `Banner` and `Link` sit beside it.
- **Toast** is the one bar at the bottom left on Radix Toast with a small store (`toast.show`, `Toaster`), which the
  hub's CSP allows; `SonnerToaster` gives sonner the same look for an app that already uses it.
- **Table** uses real table elements with Entity Hub's names (`TR`, `TH`, `TD`, `TableFrame`, `SkeletonRows`) and
  shadcn's; `Page` carries `PageHeader`, `Section`, `Breadcrumbs`, `KeyValue` rows and `Fact` grids from the admin pages.
- The parts carry no text of their own except "Not set" and the close button's label, which every part takes as a prop.

## Browser support

The colour math needs CSS relative colour syntax with math in a channel (`oklch(from var(--accent) calc(l - 0.045) c h)`),
`light-dark()` and `@property`. Together that is **Chrome and Edge 123, Safari 17.5, Firefox 128** and later (relative
colours: Chrome 119, Safari 16.4, Firefox 128; `light-dark()`: Chrome 123, Safari 17.5, Firefox 120; `@property`:
Chrome 85, Safari 16.4, Firefox 128). An older browser shows the default accent with no shades and the light theme.

## The sample pages and the tests

```powershell
cd ui
npm install
npm run dev          # http://localhost:4181/ the values and theme; /parts.html the parts; light, dark, system; the seven accents
npm test             # the contrast rules, no literal outside values.css, every used part exists and renders
npm run typecheck    # the parts and the sample pages under TypeScript
```

`index.html` is built from the theme's utilities only and reproduces the sections of the prototype's Components page
that need no React part. `parts.html` shows every part in `parts/` with a theme and accent switch and, in a wide
window, the prototype's Components page in a pane on the right, scrolled to the section a part is compared with.

To open the prototype beside the samples from the same server, copy `.env.example` to `.env.local` and point
`HUB_PROTOTYPE` at the prototype's folder: the dev server then serves it at `/prototype/Components.dc.html` and its two
licensed faces at `/prototype-fonts.css`, which the sample pages pick up when present. Nothing of the prototype is
copied here. `http://localhost:4181/compare.html?theme=light` (or `dark`) shows the values sample and the prototype
side by side at half size, each at its 1440px width; `&side=sample` or `&side=prototype` shows one alone. The
screenshots in `docs/` were taken there and on `parts.html`.

`npm test` runs Node's test runner over `test/contrast.test.mjs` (the rules under both ways a browser maps an
out-of-gamut colour, for `test/accents.json` and a sweep of every hue; it prints the table for the pull request),
`test/no-literals.test.mjs` (no hex, colour function, palette class, Tailwind scale name, font name, radius or
px/rem/em length outside `values.css`, in the theme, the parts and the sample pages alike) and `test/parts.test.mjs`
(every part the four apps import exists and is exported, and every section of the parts page renders to markup).
