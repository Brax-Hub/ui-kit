# ui-kit

Two things for the author of a Brax Hub app (ADR-039 in `Brax-Hub/contracts`): the module kit (`kit/`, `templates/`,
`tooling/`, `docs/design-system/`; here since 23 November 2026) and the shared UI kit (`ui/`: the file of values, the
Tailwind theme and the parts; the package `@brax-hub/ui`, whose package file is at the root).

Rules for agent sessions
- Read `Brax-Hub/contracts` first (ADRs, CONTRACT-*.md, TASKS.md); this repository implements part of it and never edits another repository's source.
- One session works in one repository. Cross-repository changes are two pull requests: the dependency first, then the consumer.
- Publish by tag. Consumers pin versions; never reference this repository's working tree from elsewhere. An app made from the module kit copies its files, as `kit/README.md` says.
- No secrets in the tree: `.env`, keys, certificates and tokens are ignored; examples end in `.example`.
- Naming: Brax Managed Hub, Brax Self-Hosted Hub, Brax network (not "edge"), the hub (its server program), Hub administration (its admin, "Admin" in the menu; ADR-035).
- In the shared UI kit, no colour, face, spacing or radius is written anywhere but the file of values. An app that imports it defines none of its own and holds no copy of a part: a part that is missing is added to `ui/parts`, with its section on the parts page. The module kit follows the same rule since TASKS FE04, and `npm test` at the root fails if it stops (`ui/test/kit-on-ui.test.mjs`).
- `kit/example` takes the UI kit from the working tree (`file:../..`); it is the only thing that may. After a change under `ui/`, run `npm ci` in `kit/example`. A new version of the UI kit is a new `version` in the root `package.json`; its tag, `ui-v<version>`, is the owner's to make.
- The root `package.json` has no script named `build`, `prepare`, `prepack` or `install`: npm would run a whole install of the kit inside every app's install.
- A change to `kit/` or `ui/` keeps the root passing (`npm test`, `npm run typecheck`) and `kit/example` passing (`npm run gate` and `npm test` there), and keeps the app's managed copies equal to the kit (`node kit/init.mjs --check example kit/example`). CI runs all of it on a pull request.
- The twelve skills that explain the kit live in `Brax-Tech-Internal/spec-central-claude-plugin`. A change here that moves or renames a path they name needs a pull request there too.
