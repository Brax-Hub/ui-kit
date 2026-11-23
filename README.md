# ui-kit

Two things an author of a Brax Hub app needs, in one repository:

1. **The module kit** (here now): what every Brax Business App copies to run as a hub module on tinbase.
2. **The shared UI kit** (not built yet): one file of colours and faces, a Tailwind theme that reads it, and the parts
   (buttons, tables, dialogs and the rest) every app and admin screen imports.

The owner decided on 23 November 2026 that both live here (`Brax-Hub/contracts`,
`decisions/ADR-039-one-front-end.md`, "Open" 2: "A new Brax-Hub one", "Yes, create ui-kit", "Yes, move it in").

## What is here

| Path | What it is |
| --- | --- |
| `kit/` | The module kit: tinbase boot, the hub identity bridge, member and service clients, the MCP server, jobs, dev stubs, the security scanner, CI and release tooling, and `kit/example`, a working app made from it. Start at [`kit/README.md`](kit/README.md). |
| `templates/AI_RULES.md` | The starting point the root skill copies into an app that has no `AI_RULES.md`. |
| `tooling/` | The editor-side pieces: the Vite source tagger, the dev inspector, the root dev snippet, and the hub identity helpers. |
| `docs/design-system/` | The preview page of the Brax brand for apps (`style-guide.html`) and its two screenshots. |

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

## The shared UI kit (planned, nothing built)

`Brax-Hub/contracts` TASKS FE01 and FE02. Decided in ADR-039:

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
3. **Parts:** the React components, taken once from the copies in `kit/example`, Feedback, the Guide's admin and Hub
   administration.

Where these three sit in this repository, beside `kit/`, is for FE01 to settle.

## Not done

- No check runs here on a pull request. The kit's `tooling/ci.yml` is a template an app copies; it is not active in
  this repository.
- `kit/example` was not run after the move. Its files are byte-for-byte the ones that passed in the old repository.
