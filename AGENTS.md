# ui-kit

The shared UI kit for the Brax Hub (ADR-039 in `Brax-Hub/contracts`): the file of values, the Tailwind theme and the
parts. Empty until TASKS FE01 and FE02.

Rules for agent sessions
- Read `Brax-Hub/contracts` first (ADRs, CONTRACT-*.md, TASKS.md); this repository implements part of it and never edits another repository's source.
- One session works in one repository. Cross-repository changes are two pull requests: the dependency first, then the consumer.
- Publish by tag. Consumers pin versions; never reference this repository's working tree from elsewhere.
- No secrets in the tree: `.env`, keys, certificates and tokens are ignored; examples end in `.example`.
- Naming: Brax Managed Hub, Brax Self-Hosted Hub, Brax network (not "edge"), the hub (its server program), Hub administration (its admin, "Admin" in the menu; ADR-035).
- No colour, face, spacing or radius is written anywhere but the file of values. An app that imports this kit defines none of its own.
