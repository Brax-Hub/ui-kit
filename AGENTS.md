# ui-kit

Two things for the author of a Brax Hub app (ADR-039 in `Brax-Hub/contracts`): the module kit (`kit/`, `templates/`,
`tooling/`, `docs/design-system/`; here since 23 November 2026) and the shared UI kit (the file of values, the
Tailwind theme and the parts; empty until TASKS FE01 and FE02).

Rules for agent sessions
- Read `Brax-Hub/contracts` first (ADRs, CONTRACT-*.md, TASKS.md); this repository implements part of it and never edits another repository's source.
- One session works in one repository. Cross-repository changes are two pull requests: the dependency first, then the consumer.
- Publish by tag. Consumers pin versions; never reference this repository's working tree from elsewhere. An app made from the module kit copies its files, as `kit/README.md` says.
- No secrets in the tree: `.env`, keys, certificates and tokens are ignored; examples end in `.example`.
- Naming: Brax Managed Hub, Brax Self-Hosted Hub, Brax network (not "edge"), the hub (its server program), Hub administration (its admin, "Admin" in the menu; ADR-035).
- In the shared UI kit, no colour, face, spacing or radius is written anywhere but the file of values. An app that imports it defines none of its own. `kit/example` still carries its own copy of the parts and colours until TASKS FE04.
- A change to `kit/` keeps `kit/example` passing (`npm run gate` there) and keeps the app's managed copies equal to the kit (`node kit/init.mjs --check <slug> kit/example`).
- The twelve skills that explain the kit live in `Brax-Tech-Internal/spec-central-claude-plugin`. A change here that moves or renames a path they name needs a pull request there too.
