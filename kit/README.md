# The module kit

What every Brax Business App copies to run as a Brax Hub module on tinbase: one Node 22 process, no login of its own
(the hub's edge names the member in three headers), data in tinbase (Supabase-shaped Postgres 17 embedded in the
process, never on a port), tools for AI through the hub's tool gateway over MCP, and LCC reached over mTLS with the
module credential. `kit/example/` is an app made from it and the proof. Plan: `docs/entity-hub/module-implementation-plan.md` in `dominic8686/brax-business-app`
(A3, A4). Status and the open items are at the bottom.

## Files

| Path | What it is |
| --- | --- |
| `server/env.server.ts` | The only reader of the environment: `APP_ENV`, `DATA_DIR`, `TINBASE_ENGINE`, `JWT_SECRET[_FILE]`, `LCC_URL`, `MODULE_CREDENTIAL_DIR`, `GATEWAY_KEYS_URL`, `HUB_EVENTS_URL`, `JOBS` |
| `server/tinbase.server.ts` | `createBackend` once per process (globalThis-cached): `authEnabled: false`, native engine on Linux/macOS, PGlite on Windows, `supabase/` migrations and seed, buckets, `FsStorageDriver`, outbox mailer, `close()` on SIGTERM. Exports `backend`, `anonKey`, `serviceRoleKey` |
| `server/hub/identity.server.ts` | `readHubMember` (401 `hub_member_required`), `resolveMember` (upsert `memberships`; hub role on first sight and when it rises), `findMemberByHubId`, `memberToken` (the only `signJwt` call: 5-minute HS256, `sub` = memberships.id) |
| `server/db/client.server.ts` | `memberClient(ctx)` (supabase-js over `backend.fetch` with the member bearer), `serviceClient(reason)` (logged), `anonClient()` |
| `server/middleware/rbs.ts` | `requireMember()`, `requireRole(allowed)`; resolves once per request; 401/403 through `setResponseStatus` plus `AccessError`. Not `*.server.ts`: see the contradictions |
| `server/hub/lcc.server.ts` | mTLS client: `me`, `people`, `contacts`, `sendCard`, `createRequest`, `gatewayKeys`; `{ ok: false, reason: 'no_hub' | 'not_enabled' | 'error' | 'unreachable' }`, never throws |
| `server/mcp/server.ts`, `delegated-token.ts`, `manifest.ts` | The MCP server at `<entry>mcp`; `tools/list` from `module.yaml`; `tools/call` behind `verifyDelegatedToken` (Ed25519, 60 s, RFC 8785 args digest, replay log, keys refreshed on an unknown kid), then the handler as the acting member |
| `server/jobs/index.ts` | `registerJobs(backend, defs)`: `jobs` rows, `cron.schedule(name, schedule, 'select app.enqueue_job(name)')`, a poller executing queued `job_runs` under `serviceClient('job:<name>')`; `runNow(name)` |
| `server/hub/people-sync.ts` | The nightly reconcile of `memberships` from `lcc.people()`; no-op with `no_hub` |
| `server/hub/event-feed.ts`, `events.server.ts` | The client of the hub's event feed and its binding to the module credential and the database: `followHubEvents({ handlers, readAll })`, `stopHubEvents()`, `hubEventsStatus()`. See "The hub's events" below |
| `server/static.server.ts` | Serves `dist/client` under the entry prefix in production |
| `server/tools/index.ts` | The empty handler registry an app fills (one file per manifest tool) |
| `dev/dev-member.ts` | Copied to the app's `tooling/` like the other two stubs. The stub edge (Vite middleware): `DEV_MEMBER`, `?as=`, cookie; refuses outside `APP_ENV=local`; strips the headers on the MCP path. It also answers the hub's three stylesheets a page links (`/hub/assets/ui/values.css`, `/hub/assets/theme.css`, `/hub/assets/fonts/hub-fonts.css`) and names an accent as a hub's owner would: `DEV_ACCENT=2563EB` or `?accent=2563EB` |
| `dev/gateway-stub.mjs` | `serve` the keys on 38400 (LCC's `{ keys: [{kid, alg, pub}] }` shape), `call <tool> '<json>' --as owner` mints a delegated token and drives `tools/call`; `--expired`, `--bad-args`, `--replay` |
| `dev/ai-stub.mjs` | OpenAI-shaped `/v1/chat/completions` stub on 54399, plus `/services/module/contacts` and `STUB_DENY` |
| `dev/hub-events-stub.mjs` | A stand-in for the hub's event feed: `serve` on 38410, `emit <kind> --person <id> --event <id>`, `prune`; `standInHub()` for the test, which can also fail, drop connections and restart |
| `tooling/event-feed.test.mjs` | The test every module carries for the feed: the client against the stand-in hub, and against a real hub when `HUB_TEST_URL` and `HUB_TEST_CREDENTIAL_DIR` name one |
| `tooling/security-scan.ts` + `.test.ts` | The A4 rules (14) with one failing fixture per rule |
| `tooling/browser.mjs`, `kit-drift.test.mjs` | playwright-core on Edge with `?as=` for the member; the app's managed copies equal the kit |
| `example/tooling/rls-test.mjs`, `smoke.mjs`, `screenshots.mjs`, `mcp.test.mjs` | The app's own suites, scaffolded once by `init` and then the app's: owner, admin, member, viewer, a stranger, a second tenant's owner, the service and anon against a throwaway backend (95 assertions on the example); the smoke and screen runs; the verifier against stub-minted tokens |
| `tooling/ci.yml`, `release.yml`, `release.mjs`, `rollback.mjs`, `build-server.mjs`, `gen-types.mjs` | CI (gate, screens on the fresh database, then smoke and the MCP path, native engine), the tag-triggered release to GHCR by digest with its pre-install snapshot (both `.yml` files land in `.github/workflows/`), the same release from a machine with Docker, rollback and the ledger (`record --env built` for a pushed, uninstalled image), the Node entry, `tinbase gen types` |
| `example/tooling/app-scan.ts` | The app's own scanner rules, chained after the kit's in `npm run security-scan`; scaffolded once with one example rule |
| `module.yaml.example`, `Dockerfile`, `deploy/compose.MODULE.yaml`, `deploy/lcc-edge.MODULE.conf` | The templates (`{{slug}}`, `{{SLUG}}`) |
| `init.mjs` | `node kit/init.mjs <slug> <dir>` copies the example as a scaffold and the managed files on top, and names the UI kit by its tag in the new app's `package.json`; `--sync` refreshes the managed files; `--check` reports drift. The suites are not managed |

## The look: the UI kit (TASKS FE04)

An app made from this kit looks like the hub without its author doing anything (ADR-039 rule 4). It takes the Brax Hub
UI kit, `@brax-hub/ui`, from this repository by tag, and holds nothing of the look itself: no part, no colour, no
face. How, why, and the exact lines are in [`../ui/README.md`](../ui/README.md), "Taking the UI kit into an app". In
the scaffold that is:

| Where | What |
| --- | --- |
| `package.json`, `.npmrc` | `"@brax-hub/ui"` by tag, and `allow-git=root` so npm 12 will fetch it; `ui-check` in the gate; no Tailwind, Radix or font package of the app's own |
| `vite.config.ts` | `braxUi()` first in `plugins` |
| `src/styles.css` | one line, `@import "@brax-hub/ui/ui.css"` |
| `src/routes/__root.tsx` | the app's stylesheet, then `hubStylesheetLinks`: the hub's values, its theme (the accent its owner picked) and its two licensed faces; `data-theme` from the `hub.theme` message; the frame (`AppFrame`, `Rail`, `AppMain`) |
| `src/routes/*.tsx` | screens built from the parts (`Page`, `PageHeader`, `Section`, `Table`, `Toolbar`, `Input`, `Select`, `Button`, `Badge`, `Alert`) and the theme's classes |
| `Dockerfile`, `.github/workflows/*.yml` | git in the build stage, and the token that may read the UI kit's repository (`UI_KIT_TOKEN`) |

`npm run ui-check` (the UI kit's `brax-ui-check`) refuses a colour, a face, a radius or a length written in a screen, a
copy of a part, and a page that does not link the hub's theme. A part an app needs and the UI kit lacks is added to
`ui/parts` in this repository, never to the app.

`kit/example` is the one app that does not name a tag: it takes the UI kit from the working tree it sits in
(`"@brax-hub/ui": "file:../.."`, installed as a package because of `install-links` in its `.npmrc`), so a change to a
part is proven on the sample in the same pull request. Two things follow. After a change under `ui/`, run `npm ci` in
`kit/example` to take it (`npm install` keeps the copy it has). And the sample's image cannot be built from its own
folder, because the UI kit is outside that folder; an app made by `init` builds its image from its own.

## The hub's events (TASKS APM10)

A module owns its data, so it learns of a change in the hub by asking: `GET /services/module/events` on the module
API, which the hub answers when something happens or after 25 seconds (the hub server's `app/module_events.py`; ADR-046
D1). The hub never calls a module. The kit holds the client; an app writes three things.

**1. One handler a kind, and what to do when everything must be read again** (`src/server/events/register.ts`; the
example's handles the calendar's three kinds):

```ts
import { followHubEvents } from '../hub/events.server'

export function registerAppEvents() {
  return followHubEvents({
    handlers: {
      'calendar_event.created': async (event, { service, log }) => { /* event.person, event.data.event */ },
      'calendar_event.changed': async (event, { service }) => {},
      'calendar_event.deleted': async (event, { service }) => {},
    },
    readAll: async (reason, { service }) => { /* list through the module's read route, replace the copy */ },
  })
}
```

**2. One line in the server entry** (`src/server/entry.ts`): `registerAppEvents()`. It returns at once; the feed is
followed in the background, one request at a time, and SIGTERM ends the open request.

**3. The permission and the table**: the scope of each kind in `module.yaml` (`calendar.read` for the calendar kinds),
and the migration `supabase/migrations/20261125000001_hub_cursors.sql` as the example has it.

What an app can rely on, and what it must do:

- **An event holds ids only**: `{ id, kind, at, person, data }`, where `data` is for instance `{ event, uid }`. The
  handler fetches the record through the route the module already uses. Only the kinds with a handler are asked for.
- **A handler may run twice for the same event.** The cursor is written after the handlers of an answer ran, so a
  module that stops between the two gets those events again at its next start. Write by the event's ids (an upsert on
  the hub's id, as the example does), never "add one".
- **Events are handled in the order the hub gives them**, one at a time. A handler that throws is tried again after a
  pause, starting at its event; after five failures of the same event the client gives up on it, says so in the log,
  and calls `readAll('handler_failed')`.
- **`readAll(reason)`** is called before the first event ever (`start`), and whenever events may have been missed:
  `cursor_too_old`, `cursor_ahead`, `invalid_cursor`, `handler_failed`. The client takes the feed's position first and
  calls `readAll` second, so what happens while the module reads comes as events afterwards.
- **Where the cursor is kept**: the row `events` of `hub_cursors`, in the module's own database, written with the
  service role (reason `hub-events:cursor`). In the database and not in a file beside it, so a restored snapshot
  brings back the cursor that matches its data. An answer that changes nothing writes nothing.

What each answer of the hub means to the client:

| The hub answers | What it means | What the client does |
| --- | --- | --- |
| 200 with events | Something happened | Runs the handlers in order, then keeps the answer's cursor |
| 200, no events | The wait ended | Keeps the answer's cursor (it may have passed events the module is not shown) and asks again |
| 410 `cursor_too_old` | Retention (7 days) removed events after the cursor | Asks without a cursor, calls `readAll`, follows from there |
| 410 `cursor_ahead` | The cursor is past the feed's end: the hub was restored | The same |
| 422 `invalid_cursor` | The kept cursor is not one | The same |
| 429 `too_many_waiting` | Other copies of this module already hold the hub's limit of waiting requests (4) | Asks again from the same cursor after a pause |
| 403 `scope_required`, `module_not_active` | The grant holds no permission of any kind, or the module is switched off | Stops following and says why in the log; a restart of the module asks again |
| 5xx, any other refusal, no answer in 35 s, a dropped connection | The hub is restarting or unwell | Asks again from the same cursor after a pause |

The pause starts at one second, doubles up to a minute, and each is shortened by a random part up to half, so the
modules of a hub do not all come back at the same instant. `hubEventsStatus()` gives the state, the cursor and the
reason of the last pause, for a Settings page.

Locally there is no hub, and nothing is followed. To see the handlers run:

```bash
npm run hub-events                                             # the stand-in hub on 38410
HUB_EVENTS_URL=http://127.0.0.1:38410 npm run dev              # APP_ENV=local only
node tooling/hub-events-stub.mjs emit calendar_event.created --person dev-owner --event ev_1
```

`tooling/event-feed.test.mjs` (in `npm test`) proves the client against the stand-in hub: an event arrives while the
module waits, an empty answer keeps the cursor, a 410 leads to a re-read, a restart resumes from the kept cursor, a
429 backs off, a clean stop leaves no request open, and the failures above. The same file runs its first six checks
against a real hub, and skips them otherwise:

```bash
HUB_TEST_URL=https://<hub>:8443 HUB_TEST_CREDENTIAL_DIR=<module.key, module.crt, root.crt> node --test tooling/event-feed.test.mjs
```

`HUB_TEST_TLS_NAME` names the hub's certificate when it is not the URL's host; `HUB_TEST_AWAIT_EVENT_S=120` makes the
last check wait that long for someone to change a calendar event. It writes nothing on the hub.

An app made before this takes it with `node kit/init.mjs --sync <slug> <dir>`, then adds by hand what `--sync` does
not own: the migration above, `npm run gen-types`, `tooling/event-feed.test.mjs` in its `test` script, its own
`src/server/events/register.ts` and the line in the entry.

Not here yet: the kit's hub client has no route to read a calendar event, so the example only notes that one changed
(`calendar_changes`); the kinds beyond the calendar's come with the hub (APM11, APM12).

## Local commands (in an app, e.g. `kit/example`)

```bash
npm install
npm run dev            # http://localhost:3310/modules/<slug>/ as DEV_MEMBER=owner; ?as=admin|member|viewer; ?accent=2563EB
npm run gate           # typecheck && security-scan && ui-check && test-rls && build
npm test               # scanner fixtures, token verifier, the hub's event feed, kit drift
node tooling/gateway-stub.mjs call list_items '{}' --as owner
npm run smoke          # against the dev server, on Edge
npm run gen-types      # after a migration change
PYTHONPATH=<lcc at origin/main> python <hub-bundle>/hubctl.py validate .
```

## Where the sources contradicted the plan or the task

- **Alpine runtime**: tinbase's native engine runs theseus-rs postgresql-binaries, glibc builds; the Dockerfile uses
  `node:22-bookworm-slim` for both stages, not `node:22-alpine`.
- **The MCP SDK**: `@modelcontextprotocol/sdk` 1.32 supports revision 2025-11-25, but the server is hand-written: the
  gateway (`crates/tool-gateway/src/mcp/client.rs`) speaks one JSON-RPC message per POST with a JSON answer, the SDK
  generates `tools/list` from its own registry (the manifest must be the one source) and wraps the path in sessions.
- **`aud` of the delegated token** is the module slug as declared (`allowed.module`), not the registry prefix.
- **Gateway keys route shape**: LCC returns `{ "keys": [...] }` with entries `{ kid, alg: "EdDSA", pub }` (`pub`, not
  `public`), the document's `gateway_keys`; the stub mirrors that.
- **`tool_version`**: the gateway binds the registry's version; the manifest's `version` is optional, so the server
  verifies against `version ?? 1`.
- **Mail**: LCC has no module mail route; the mailer writes to `<DATA_DIR>/outbox/` always.
- **People roles**: LCC's `/people` lists roles beyond owner/admin/member; others map to `member`.
- **Validator**: the `C:\git\lcc` checkout is behind origin/main (validator 0.1, no `mcp`/`tools`/`cards`, old
  scopes), so `hubctl.py validate` fails there; with `app/module_manifest.py` from origin/main the example validates
  (rating 7/8).
- **A thrown `Response` in middleware** 500s during server rendering (seroval); the middleware sets the status and
  throws an `AccessError` instead.
- **Port 54400** is inside a Windows reserved range on this PC; the gateway stub listens on 38400.
- **`rbs.server.ts` cannot exist**: the middleware shell is part of the client bundle (the server-function chain is
  built there) and TanStack Start's import-protection plugin refuses any `*.server.*` file that reaches the client, so
  the file is `middleware/rbs.ts`; the compiler strips its `.server()` callbacks and the identity import with them.
- **Playwright clicks on the dev server** wait for a navigation that never settles (Vite's HMR socket); the suites
  click with `noWaitAfter`.

## Status (2026-11-04)

Green on this PC (Windows, PGlite): `npm run gate` (typecheck, 14 scanner rules, 74 RLS assertions with the cross-tenant section, build), `npm test`
(17 scanner fixtures, 5 token tests, kit drift), `npm run dev` for all four roles, `npm run smoke` (21 checks on Edge),
`npm run screens` (6 files), the MCP path end to end through the gateway stub (owner's rows, viewer limited, RLS
refusing the viewer's `add_item`, expired/tampered/replayed/unknown-member refused), the built server in lab mode (401
without the headers, 200 with, assets and MCP served), the manifest with the origin/main validator (rating 7/8).
Verified on 2026-11-04 by the reviewer: `docker build` of `kit/example` (bookworm-slim, Postgres 17.7 binaries baked
in, `libgssapi-krb5-2` added for initdb) and a read-only run with a `/data` volume: `healthz` 200 within 5 s, 401
without the member headers, 200 with them, 401 on `tools/call` without a token, container healthy. Not run here: the
native engine outside Docker (Linux only; `ci.yml`'s `native` job covers it), the overlay (no
Docker on this PC), an install on a hub.

## Status of the hub's events (2026-11-25, TASKS APM10)

Green on this PC (Windows, Node 24, PGlite): `npm run gate` in `kit/example` (typecheck, 14 scanner rules, 95 RLS
assertions, build) and `npm test` (15 checks of the feed against the stand-in hub, 6 more skipped without a hub).
Tried by hand in `kit/example`: the dev server following the stand-in hub wrote the calendar notes and the cursor to
its database, was killed, and at its next start asked after the kept cursor and received what had happened meanwhile,
in order. The six checks for a real hub were run once against the stand-in behind a TLS listener that demands a client
certificate (five passed, the sixth waits for a person to change a calendar event), and a certificate of another
authority was refused. Not run: anything against a real hub (the lab hub needs a hub release with the feed), and the
manifest validator on the example's new `calendar.read`.
