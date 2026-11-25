# ui-kit

Two things an author of a Brax Hub app needs, in one repository:

1. **The module kit**: what every Brax Business App copies to run as a hub module on tinbase.
2. **The shared UI kit**: one file of colours and faces, a Tailwind theme that reads it, and the parts (buttons,
   tables, dialogs and the rest) every app and admin screen imports. It is the package `@brax-hub/ui`, which an app
   names by this repository's tag; its package file is `package.json` here at the root.

The owner decided on 23 November 2026 that both live here (`Brax-Hub/contracts`,
`decisions/ADR-039-one-front-end.md`, "Open" 2: "A new Brax-Hub one", "Yes, create ui-kit", "Yes, move it in").

## What is here

| Path | What it is |
| --- | --- |
| `kit/` | The module kit: tinbase boot, the hub identity bridge, member and service clients, the MCP server, jobs, dev stubs, the security scanner, CI and release tooling, and `kit/example`, a working app made from it. Start at [`kit/README.md`](kit/README.md). |
| `templates/AI_RULES.md` | The starting point the root skill copies into an app that has no `AI_RULES.md`. |
| `tooling/` | The editor-side pieces: the Vite source tagger, the dev inspector, the root dev snippet, and the hub identity helpers. |
| `docs/design-system/` | `style-guide.html`, once the preview of a blue look for business apps. ADR-039 replaced that look with the hub's; the page now says where to see it (the UI kit's sample pages). |
| `ui/` | The shared UI kit: the file of values (`values.css`), the Tailwind 4 theme (`theme.css`), the parts (`parts/`), what an app needs to take them (`vite.js`, `lib/hub.ts`, `check/`), the sample pages and the tests. Start at [`ui/README.md`](ui/README.md). |
| `package.json`, `package-lock.json` | The UI kit's package file and lock file. They are at the root because npm installs a repository from git by its root; the package lists the kit's files under `ui/` only. |
| `.github/workflows/ci.yml` | The checks on every pull request: the UI kit's tests, the sample app's gate, and the package installed from git the way an app gets it. |

These four moved here on 23 November 2026 from `dominic8686/brax-business-app` at commit `bc96b95`, with their
history. The files are unchanged except one address in `kit/example/module.yaml` and one sentence in
`kit/README.md` that pointed at the old repository. The paths are the same as before, so the skills that name
`kit/`, `tooling/`, `templates/` and `docs/` need only the repository's name changed.

What did not move:

- **The twelve skills** for writing a business app. Their one home since 19 November 2026 is the Spec Central Claude
  Plugin (`Brax-Tech-Internal/spec-central-claude-plugin`). They name this repository as the place to copy the kit
  from.
- **Entity Hub's documents, the research notes and the retired skills.** They stay in
  `dominic8686/brax-business-app`.

## Using the kit in an app

Install the Spec Central Claude Plugin, which carries the skills:

```bash
claude plugin marketplace add Brax-Tech-Internal/spec-central-claude-plugin
claude plugin install spec-central@brax
```

The root skill (`brax-business-app`) loads its companions by name. Copy the kit, templates and tooling the skills
name from this repository into the app. The kit's own proof is `npm run gate` in `kit/example`.

## The shared UI kit (`ui/`)

`Brax-Hub/contracts` TASKS FE01, FE02 and FE04. Decided in ADR-039:

- One stack for every app and admin screen: React 19, TypeScript, Vite, Tailwind 4, TanStack.
- The shadcn/ui parts on Radix are kept once, here, and imported by every app. No app holds its own copy.
- The accent colour and the logo are the hub's theme, set by its owner. Every app follows it; no app defines a colour
  or a face of its own.
- Inter for reading text; the mono face for codes and small labels; Kinetika for titles.

Three layers:

1. **Values:** one file of CSS variables, taken from the design of record (the owner's prototype of 23 October 2026).
   Screens that are not React read this layer only.
2. **Theme:** a Tailwind 4 theme that reads the values. The accent's shades are computed from one value, so any
   accent a hub's owner picks stays readable.
3. **Parts:** the React components, taken once from the copies in Entity Hub, Feedback, the Guide's admin and Hub
   administration.

The three sit in `ui/`, beside `kit/`: `ui/values.css`, `ui/theme.css` and `ui/parts/`. Since FE04 the module kit is on
them: its sample app, templates and tooling import the parts and declare no colour or face, and a test fails if they
do (`ui/test/kit-on-ui.test.mjs`). How an app takes the UI kit is in [`ui/README.md`](ui/README.md), "Taking the UI
kit into an app".

## Not done

- The sample app's browser suites (`npm run smoke`, `npm run screens` in `kit/example`) do not run on a pull request
  here; they are run by hand. The kit's `tooling/ci.yml` is a template an app copies, and runs them in the app's CI.
- The sample app's image is not built here (`kit/README.md`, "The look").
