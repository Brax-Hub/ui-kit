# ui-kit

The shared UI kit for the Brax Hub: one file of colours and faces, a Tailwind theme that reads it, and the parts
(buttons, tables, dialogs and the rest) every app and admin screen imports.

**Status: empty.** Nothing is built yet. This repository was created on 23 November 2026 to hold the work of
`Brax-Hub/contracts` TASKS FE01 and FE02.

## What it is for

Decided by the owner on 23 November 2026 (`Brax-Hub/contracts`, `decisions/ADR-039-one-front-end.md`):

- One stack for every app and admin screen: React 19, TypeScript, Vite, Tailwind 4, TanStack.
- The shadcn/ui parts on Radix are kept once, here, and imported by every app. No app holds its own copy.
- The accent colour and the logo are the hub's theme, set by its owner. Every app follows it; no app defines a colour
  or a face of its own.
- Inter for reading text; the mono face for codes and small labels; Kinetika for titles.

## The three layers (planned)

1. **Values:** one file of CSS variables, taken from the design of record (the owner's prototype of 23 October 2026).
   Screens that are not React read this layer only.
2. **Theme:** a Tailwind 4 theme that reads the values. The accent's shades are computed from one value, so any
   accent a hub's owner picks stays readable.
3. **Parts:** the React components, taken once from the copies in the business-app kit, Feedback, the Guide's admin
   and Hub administration.

## Open

- Whether the kit for writing modules and its skills move into this repository (ADR-039 "Open" 2).
