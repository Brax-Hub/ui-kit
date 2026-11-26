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
| 3 Parts | `parts/` | The shadcn/ui parts on Radix, kept once, in the prototype's look: every part the module kit's sample app, Entity Hub, Feedback, the Guide's admin and Hub administration use. `lib/cn.ts` merges classes. |
| for an app | `vite.js`, `lib/hub.ts`, `check/` | What an app needs besides the look: `braxUi()` for its Vite config, the three stylesheets of the hub its page links, and the check its gate runs (`brax-ui-check`). |

The package file of the kit, `package.json`, is at the repository's root, because npm installs a repository from git by
its root. It lists the kit's files only; the module kit beside it is not in the package.

## Taking the UI kit into an app

Decided on 25 November 2026 with the first half of TASKS FE04, by the session that built it, and open to be overruled
by the owner. Proven on the module kit's sample app, `kit/example`, and in this repository's CI (`by-tag`).

**The UI kit is a package of this repository, `@brax-hub/ui`, and an app names it by this repository's tag.** npm
installs it straight from git; nothing is published anywhere else. The repository is public since 26 November 2026
(the owner's decision that day, "Make ui-kit public"; ADR-039 "Open" 9), so the install needs no token, no secret
and no SSH key, on a PC, in CI or in an image build.

```json
"dependencies": {
  "@brax-hub/ui": "git+https://github.com/Brax-Hub/ui-kit.git#ui-v0.2.0"
}
```

Why this way:

- **The repository has no registry.** A tag is this repository's one way of publishing (AGENTS.md, "Publish by
  tag"), and npm reads a tag of a public repository from GitHub with no credential. There is no registry to keep, no
  publish step to fail or forget, and a developer, an agent session, a CI job or an image build installs the kit with
  no setup.
- **The version cannot move under an app.** The lock file records the commit the tag pointed at, so `npm ci` gets that
  commit every time, even if a tag were moved.
- **The app imports and holds no copy** (ADR-039 rule 2). The parts are in `node_modules`, never in the app's tree,
  and the check below refuses a copy.
- **One version of everything the look is made of.** The kit brings Tailwind, Radix and Inter as its own dependencies,
  so every app that pins the same tag is on the same version of each, and an app declares none of them.

Considered and not chosen:

- **GitHub Packages as an npm registry.** The usual answer for a private package, which this was when the choice was
  made. It adds a publish workflow that has to run on every tag, a token with package rights on every machine that
  installs (a developer's too: git's credentials do not count there), and access to grant per repository. The lines an
  app writes would be the same, so moving to a registry later changes one string in `package.json`.
- **A copy by tag with a test on its hash**, as the hub server keeps `values.css` (below). Right for one stylesheet
  that a server which is not Node must serve from its own origin; for an app it would be a copy of every part, which
  rule 2 rules out.
- **The address of an archive of the tag.** GitHub does not promise the bytes of a generated archive stay the same,
  and the lock file pins those bytes.

What it costs, one thing.

**The app says it wants a git dependency.** npm 12 fetches nothing from git unless the project opts in ("As of npm 12
the default is `none`", its own words for `allow-git`), so the app's `.npmrc` has one line, `allow-git=root`: the git
dependencies its own `package.json` names, and no other. Found here on npm 12.2.0, where the install is refused
without it (`EALLOWGIT`); the npm that comes with Node 22 installs with the line present (this repository's CI does).
This is npm leaning away from git dependencies, and it is the one thing that would tip the choice to a registry later.

Two things seen when the same commit was installed on Windows with npm 12 and on Linux with Node 22's npm (pull
request 6 of the repository as it was before it became public, now `Brax-Hub/ui-kit-archive`). The lock file's hash of
the package is the same on both, which `.gitattributes` (LF in every checkout) is there to keep. And the two write the
address differently: npm 12 keeps `git+https://…` as `package.json` has it, the older one writes
`git+ssh://git@github.com/…` whatever `package.json` says.

Both forms install with no credential and no SSH key. The lock file holds the commit, and npm fetches that commit
from GitHub over HTTPS whichever way the address is written. So no git setting rewrites the address any more, with a
token in it or without. Checked on 26 November 2026, each time with nothing for git to authenticate
with (no token, no credential helper, no prompt, no key):

- on a clean GitHub runner (Node 22's npm), where this repository's `by-tag` job now does it on every pull request:
  the install from git, then `npm ci` from the lock file alone under each form, from an empty npm cache, with an ssh
  that refuses and writes down that it was asked ("ssh was never asked");
- in the base image of the module kit's build stage (`node:22-bookworm-slim`, npm 10.9.9, which has no ssh program),
  each form, without git and with it;
- on Windows with npm 12.2.0, each form.

**Wherever `npm ci` runs, it needs the network and nothing else.**

| Where | What it needs |
| --- | --- |
| A developer's PC, an agent session | Nothing. |
| An app's CI | Nothing: a plain `npm ci`, as the module kit's `tooling/ci.yml` and `release.yml` have it. |
| An app's image build | Nothing: `docker build .`, no build secret. The module kit's `Dockerfile` keeps git in the build stage for the day npm clones the repository instead of downloading the commit. |

### An app that copied the module kit before 26 November 2026

Until that day the repository was private, and the module kit handed git a read-only token, the secret
`UI_KIT_TOKEN`, in CI and in the image build. The token was never made. An app made before then still carries the
lines, and they go. They are in four files the kit manages, so `node kit/init.mjs --sync <slug> <dir>`, run from a
checkout of this repository, rewrites them, along with every other managed file that changed since the app was made.
By hand:

- `.github/workflows/ci.yml` and `release.yml`: the `env:` block under every `npm ci` (`GIT_CONFIG_COUNT` and the
  four lines after it) and the comment at the top that asks for the secret; in `release.yml` also the `secrets:`
  entry of the step that builds the image;
- `Dockerfile`: the command that starts `RUN --mount=type=secret,id=ui_kit_token` becomes
  `RUN npm ci --no-audit --no-fund`;
- `tooling/release.mjs`: the `--secret` argument of `docker build`;
- the secret `UI_KIT_TOKEN` in the app's repository or organisation, if one was made after all.

`package.json`, `.npmrc` and the lock file do not change, and no new tag of the UI kit is needed: the lines were in
files an app copies from the module kit, never in the package. An app is not broken while it still has them: with the
old address rewrite and an empty token in it, `npm ci` was seen to install both forms of the address (26 November
2026, npm 12.2.0).

### The lines an app adds

An app made with `node kit/init.mjs <slug> <dir>` has all of them. For an app that exists, they are:

1. **`package.json`**: the dependency above, and the check in the gate. No Tailwind, Radix, `tailwind-merge`, font
   package or shadcn file of the app's own: the kit brings what it needs. And **`.npmrc`**: `allow-git=root`.

   ```json
   "scripts": {
     "ui-check": "brax-ui-check",
     "gate": "npm run typecheck && npm run security-scan && npm run ui-check && npm run test-rls && npm run build"
   }
   ```

2. **`vite.config.ts`**: one call, first in `plugins`. It brings the kit's Tailwind and the three build settings the
   kit needs (`vite.js` says which and why).

   ```ts
   import { braxUi } from '@brax-hub/ui/vite'

   plugins: [braxUi(), tanstackStart({ ... }), viteReact()],
   ```

3. **`src/styles.css`**, the app's one stylesheet, in full:

   ```css
   @import "@brax-hub/ui/ui.css";
   ```

4. **The root route's head**: the app's stylesheet, then the hub's three.

   ```tsx
   import { hubStylesheetLinks } from '@brax-hub/ui/hub'
   import appCss from '../styles.css?url'

   links: [{ rel: 'stylesheet', href: appCss }, ...hubStylesheetLinks],
   ```

5. **The parts**, imported wherever a screen needs one; `cn` from `@brax-hub/ui/cn` where an app merges classes.

   ```tsx
   import { AppFrame, Button, Page, PageHeader, Rail, RailItem, Table, TD, TR } from '@brax-hub/ui/parts'
   ```

6. **`tsconfig.json`**: `"moduleResolution": "bundler"`, `"noEmit": true` and `"allowImportingTsExtensions": true`.
   The parts are TypeScript source (`parts/*.tsx`), compiled by the app's own Vite as shadcn copies were, and they
   import each other by file name. The app needs React 19.

A screen then uses the theme's classes for its layout (`flex`, `gap-3`, `text-ink-3`, `h-control`) and the parts for
everything a person touches. A part the app needs and the kit lacks is added here, in `parts/`, with its section on
the parts page and under the tests below; it is not built in the app.

### What the page gets at run time: the hub's theme

The four stylesheets, in the order the page links them:

| | Stylesheet | From | What it gives |
| --- | --- | --- | --- |
| 1 | the app's own | the app's build | The kit's values, theme and every class a part uses, at the version the app pinned. With this alone the page is whole: outside a hub it shows the kit's default accent and the system faces. |
| 2 | `/hub/assets/ui/values.css` | the hub | The hub's copy of the kit's file of values, so every app on one hub shows the same values. It comes later in the document, so where both name a variable the hub's wins. |
| 3 | `/hub/assets/theme.css` | the hub | One rule, `html:root { --accent: … }`, with the accent the hub's owner picked (TASKS FE03). `html:root` outranks the kit's `:root`, so it wins whatever the order. Every shade is computed from it in the browser. |
| 4 | `/hub/assets/fonts/hub-fonts.css` | the hub | Kinetika and LFT Etica Mono (TASKS FE08; `fonts/README.md`). |

A page may link same-origin stylesheets only, and a module in its frame is same-origin with the hub, so these are
paths. The hub server keeps its copy of `values.css` by tag with a test on its hash (Brax-Hub/brax-hub#257, today at
`ui-v0.1.0`); it takes a newer tag in a pull request of its own. An app and a hub on different versions of the kit
still work: the page has both files, a variable the older one lacks keeps the newer one's value, and no part reads a
variable neither defines.

Light or dark comes in the `hub.theme` message (below); the accent does not, it comes from stylesheet 3.

Locally there is no hub. The module kit's stub edge (`kit/dev/dev-member.ts`) answers the three paths in the dev
server, so the page loads as it does on a hub, and names an accent the way an owner would: `?accent=2563EB` on any
page, or `DEV_ACCENT=2563EB`. The sample app's smoke suite checks that the accent named there is the one a button
shows.

### The check an app runs

`brax-ui-check` (`check/cli.mjs`; `check/app.mjs` says what is read). It exits 1, naming file and line, when an app's
screens hold:

- a colour, a face, a radius or a length written by hand, a Tailwind palette class or a scale name the theme drops;
- a value of the kit set again (`--accent: …`), a `@theme`, a `@font-face`, or Tailwind imported past the kit's theme;
- a stylesheet or a font from another origin;
- a parts folder (`src/components/ui/`, `components.json`), a component declared under the name of one of the kit's
  parts, or an import of what parts are made of (Radix, cmdk, sonner, vaul, react-resizable-panels, tailwind-merge);
- a dependency the kit brings (Tailwind, Radix, a font package);

or when the app's stylesheet does not import the kit's, or its page does not link the hub's three stylesheets. The
list of what counts as a colour or a face is one file, `check/literals.mjs`, the same the kit holds itself to.

### A new version, and the tag

The version is `version` in the root `package.json`; its tag is `ui-v<version>`, and the tag is the owner's to make.
The `ui-` prefix names which of the repository's two things the tag publishes: the module kit's release workflow,
which an app copies, fires on bare `v*` tags in the app's repository, so a bare `v0.2.0` here would read as the kit's
or an app's. Until the owner has made a tag, an app can name a commit of `main` instead
(`…ui-kit.git#<commit>`; `UI_KIT_REF=<commit> node kit/init.mjs …` writes it). Nothing references this repository's
working tree, with one exception inside it: `kit/example` takes the kit from the tree it sits in (`file:../..`), so a
change to a part is proven on the sample in the same pull request.

A release that changes `values.css` is followed by the hub server taking the new tag (its copy is pinned by hash).

| Version | Tag | What it added |
| --- | --- | --- |
| 0.1.0 | `ui-v0.1.0` | The values, the theme, 33 parts. Not installable as a package: the package file was in `ui/`. |
| 0.2.0 | `ui-v0.2.0` | The package at the repository's root; the app frame (`parts/app-frame.tsx`); `vite.js`, `lib/hub.ts`, `check/`. `values.css` is unchanged, so the hub server's copy stays right. |

## Light and dark, the accent, the faces

**Light and dark.** The hub shell tells a module's page its theme with the `hub.theme` message (HUB-SHELL §4.4,
`theme: "light" | "dark"`); the page writes it as `data-theme="light"` or `"dark"` on `<html>`. No attribute, or
`data-theme="system"`, follows the device. The attribute works on any element too: a dark region inside a light page.

**The accent.** One variable, `--accent`, on `<html>`; FE03 writes it from `hub.theme`. Hover, pressed, the tint, the
focus ring, the accent as text on each background and the text colour on the accent are all computed from it in CSS
at run time, with rules that keep text at 4.5:1 or better (`values.css`, "the accent and its shades"). Nothing is built.

**Faces.** Inter comes from `@fontsource-variable/inter`, pinned in `package.json`. Kinetika and LFT Etica Mono are
licensed to Brax and are not in this repository: the hub serves them as one stylesheet, decided by the owner on
24 November 2026 (`fonts/README.md`; ADR-039 "Open" 8, task FE08). Every stack has system fallbacks.

## Decisions the kit carries

Three the owner took on 24 November 2026, each asked as one question with a recommendation; the records are in
`Brax-Hub/contracts` where named.

| Asked | The owner's answer | Where it lives |
| --- | --- | --- |
| "Should the hub serve Kinetika and LFT Etica Mono as one stylesheet, `/hub/assets/fonts/hub-fonts.css`, that every app links?" | "Yes, hub serves them" (ADR-039 "Open" 8; task FE08, the hub server's) | `fonts/README.md`; the stacks in `values.css` name the families and fall back to system faces |
| "Should the switch knob keep the prototype's white on the orange accent?" | "Yes, white knob" | `values.css` `--on-accent-control`: a control mark on the accent needs 3:1 and is white wherever white reaches it; text on the accent needs 4.5:1 and takes `--on-accent` |
| "Should dialogs be the prototype's right-hand sheet, or the centred box the apps have today?" | "Right-hand sheet" | `parts/dialog.tsx` (the right-hand sheet), `parts/alert-dialog.tsx` (the bottom sheet), `parts/command.tsx` (a panel under the header); no centred box |

## The parts

Each file in `parts/` says which rule of the prototype it draws (`hub.css` and `admin.css` lines). What a reader of
shadcn's names should know:

- **No centred dialog.** The prototype has none ("dialogs are right-hand sheets, confirmations are bottom sheets, menus
  anchor to what opened them"), and the owner confirmed it on 24 November 2026 ("Right-hand sheet"). `Dialog` is the right-hand sheet (`DialogHeader`, `DialogBody`, `DialogFooter`; `Sheet`
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
- **App frame** (`AppFrame`, `Rail`, `RailLabel`, `RailItem`, `RailCount`, `AppMain`, `Toolbar`; added with FE04) is an
  app's frame under the hub's header: the 240px rail of its own navigation and the main column beside it. `RailItem`
  takes `asChild` for a router's link and shows the page in front (`aria-current="page"`) in the accent tint.
- The parts carry no text of their own except "Not set" and the close button's label, which every part takes as a prop.

## Browser support

The colour math needs CSS relative colour syntax with math in a channel (`oklch(from var(--accent) calc(l - 0.045) c h)`),
`light-dark()` and `@property`. Together that is **Chrome and Edge 123, Safari 17.5, Firefox 128** and later (relative
colours: Chrome 119, Safari 16.4, Firefox 128; `light-dark()`: Chrome 123, Safari 17.5, Firefox 120; `@property`:
Chrome 85, Safari 16.4, Firefox 128). An older browser shows the default accent with no shades and the light theme.

## The sample pages and the tests

At the repository's root, where the package file is:

```powershell
npm install
npm run dev          # http://localhost:4181/ the values and theme; /parts.html the parts; light, dark, system; the seven accents
npm test             # the contrast rules, no literal outside values.css, the parts, the app's check, the module kit on the UI kit
npm run typecheck    # the parts and the sample pages under TypeScript
npm run pages        # builds the sample pages (named "pages", not "build": see the test of the package's scripts)
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
px/rem/em length outside `values.css`, in the theme, the parts and the sample pages alike), `test/parts.test.mjs`
(every part the four apps import exists and is exported, and every section of the parts page renders to markup),
`test/app-check.test.mjs` (the check an app runs refuses what it says it refuses: a small app with one thing put
wrong per rule, and a clean one that must pass) and `test/kit-on-ui.test.mjs` (TASKS FE04: the module kit holds no
copy of a part and no colour of its own; the sample app passes the app's check; an app made by `kit/init.mjs` names
this version's tag; the package holds the kit's files and nothing else).

The same runs on every pull request (`.github/workflows/ci.yml`: `ui`, `kit` for the sample app's gate and unit
tests, and `by-tag`, which installs the package from git at the pull request's commit the way an app does: with
nothing to authenticate with).
