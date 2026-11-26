# The module kit

What every Brax Business App copies to run as a Brax Hub module on tinbase: one Node 22 process, no login of its own
(the hub's edge names the member in three headers), data in tinbase (Supabase-shaped Postgres 17 embedded in the
process, never on a port), tools for AI through the hub's tool gateway over MCP, and LCC reached over mTLS with the
module credential. `kit/example/` is an app made from it and the proof. Plan: `docs/entity-hub/module-implementation-plan.md` in `dominic8686/brax-business-app`
(A3, A4). Status and the open items are at the bottom.

## Files

| Path | What it is |
| --- | --- |
| `server/env.server.ts` | The only reader of the environment: `APP_ENV`, `DATA_DIR`, `TINBASE_ENGINE`, `JWT_SECRET[_FILE]`, `LCC_URL`, `MODULE_CREDENTIAL_DIR`, `GATEWAY_KEYS_URL`, `HUB_EVENTS_URL`, `HUB_RECORDS_URL`, `JOBS` |
| `server/tinbase.server.ts` | `createBackend` once per process (globalThis-cached): `authEnabled: false`, native engine on Linux/macOS, PGlite on Windows, `supabase/` migrations and seed, buckets, `FsStorageDriver`, outbox mailer, `close()` on SIGTERM. Exports `backend`, `anonKey`, `serviceRoleKey` |
| `server/hub/identity.server.ts` | `readHubMember` (401 `hub_member_required`), `resolveMember` (upsert `memberships`; hub role on first sight and when it rises), `findMemberByHubId`, `memberToken` (the only `signJwt` call: 5-minute HS256, `sub` = memberships.id) |
| `server/db/client.server.ts` | `memberClient(ctx)` (supabase-js over `backend.fetch` with the member bearer), `serviceClient(reason)` (logged), `anonClient()` |
| `server/middleware/rbs.ts` | `requireMember()`, `requireRole(allowed)`; resolves once per request; 401/403 through `setResponseStatus` plus `AccessError`. Not `*.server.ts`: see the contradictions |
| `server/hub/lcc.server.ts` | mTLS client: `me`, `people`, `contacts`, `sendCard`, `createRequest`, `gatewayKeys`; `{ ok: false, reason: 'no_hub' | 'not_enabled' | 'error' | 'unreachable' }`, never throws |
| `server/mcp/server.ts`, `delegated-token.ts`, `manifest.ts` | The MCP server at `<entry>mcp`; `tools/list` from `module.yaml`; `tools/call` behind `verifyDelegatedToken` (Ed25519, 60 s, RFC 8785 args digest, replay log, keys refreshed on an unknown kid), then the handler as the acting member |
| `server/jobs/index.ts` | `registerJobs(backend, defs)`: `jobs` rows, `cron.schedule(name, schedule, 'select app.enqueue_job(name)')`, a poller executing queued `job_runs` under `serviceClient('job:<name>')`; `runNow(name)` |
| `server/hub/people-sync.ts` | The nightly reconcile of `memberships` from `lcc.people()`; no-op with `no_hub` |
| `server/hub/event-feed.ts`, `events.server.ts` | The client of the hub's event feed and its binding to the module credential and the database: `followHubEvents({ handlers, readAll })`, `stopHubEvents()`, `hubEventsStatus()`. See "The hub's events" below |
| `server/hub/records.ts`, `records.server.ts` | The client for a person's calendar and address book in Brax Mail, through the hub, and its binding to the module credential: `hubRecords()` with one function a route (`listEvents`, `createEvent`, `listContacts` and nine more), `HubRecordsError`, `RECORDS_ERRORS`, `newIdempotencyKey()`. See "A person's calendar and address book" below |
| `server/static.server.ts` | Serves `dist/client` under the entry prefix in production |
| `server/tools/index.ts` | The empty handler registry an app fills (one file per manifest tool) |
| `dev/dev-member.ts` | Copied to the app's `tooling/` like the other two stubs. The stub edge (Vite middleware): `DEV_MEMBER`, `?as=`, cookie; refuses outside `APP_ENV=local`; strips the headers on the MCP path. It also answers the hub's three stylesheets a page links (`/hub/assets/ui/values.css`, `/hub/assets/theme.css`, `/hub/assets/fonts/hub-fonts.css`) and names an accent as a hub's owner would: `DEV_ACCENT=2563EB` or `?accent=2563EB` |
| `dev/gateway-stub.mjs` | `serve` the keys on 38400 (LCC's `{ keys: [{kid, alg, pub}] }` shape), `call <tool> '<json>' --as owner` mints a delegated token and drives `tools/call`; `--expired`, `--bad-args`, `--replay` |
| `dev/ai-stub.mjs` | OpenAI-shaped `/v1/chat/completions` stub on 54399, plus `/services/module/contacts` and `STUB_DENY` |
| `dev/hub-events-stub.mjs` | A stand-in for the hub's event feed: `serve` on 38410, `emit <kind> --person <id> --event <id>`, `prune`; `standInHub()` for the test, which can also fail, drop connections and restart |
| `dev/hub-records-stub.mjs` | A stand-in for the hub's twelve routes over a person's calendar and address book: `serve` on 38411, `fail <status> <code>`, `lose`, `grant <scopes>`; `standInRecordsHub()` for the test, which can also drop connections, hold an answer and refuse values |
| `tooling/event-feed.test.mjs` | The test every module carries for the feed: the client against the stand-in hub, and against a real hub when `HUB_TEST_URL` and `HUB_TEST_CREDENTIAL_DIR` name one |
| `tooling/records.test.mjs` | The test every module carries for a person's calendar and address book: the client against the stand-in hub, and five checks against a real hub when `HUB_TEST_URL`, `HUB_TEST_CREDENTIAL_DIR` and `HUB_TEST_PERSON` name one |
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
| `Dockerfile`, `.github/workflows/*.yml` | A plain `npm ci`: the UI kit's repository is public since 26 November 2026, so CI and the image build need no token, no secret and no SSH key (`docker build .`) |

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

The example only notes that a calendar event changed (`calendar_changes`). A module that shows the event reads it in
its handler with `hubRecords().readEvent(event.person, event.data.event)` (the next section). The feed also carries
`contact.created`, `.changed` and `.deleted` for a write to a person's address book through the hub's routes; the
kinds beyond those come with the hub (APM11, APM12).

## A person's calendar and address book (TASKS APM20)

The Calendar and Contacts modules hold no records of their own (ADR-045 "Open" 1, decided 25 November 2026: "Keep in
Brax Mail"). A person's events and contacts stay in their Brax Mail account, their phone syncs with Brax Mail as
before, and a module reads and changes them through the hub: twelve routes under `/services/module/people/{person}/`
(the hub server's `app/module_records.py`). The kit holds the client, so an app's server side calls one function a
route and writes no HTTP:

```ts
import { hubRecords, HubRecordsError, newIdempotencyKey } from '../hub/records.server'

// In a server function or a tool handler: context.hubMemberId is the person, and the person acting.
const { events } = await hubRecords().listEvents(context.hubMemberId, { limit: 5, fields: ['title', 'start'] })
const made = await hubRecords().createEvent(context.hubMemberId, { title: 'Lunch', start: '2026-12-01T12:00:00', timeZone: 'Europe/Paris', duration: 'PT1H' }, { key })
```

| Function | Route under `/services/module/people/{person}/` | Scope | Gives |
| --- | --- | --- | --- |
| `listCalendars(who)` | `GET calendars` | `calendar.read` | `{ person, calendars, default }`: the person's own calendars (`id`, `name`, `description`, `color`, `sort_order`, `is_default`, `may_write`) and the id of the one a new event goes to. Task lists are left out |
| `listEvents(who, { from, to, calendar, fields, limit, expand })` | `GET calendar/events` | `calendar.read` | `{ person, events, count, truncated, from, to }`, oldest first. Without a range: now and seven days; at most 366 days. `limit` 100, at most 500. A repeating event comes once, with its rule, unless `expand` |
| `readEvent(who, id, { fields })` | `GET calendar/events/{id}` | `calendar.read` | The event |
| `createEvent(who, event, { calendar, key })` | `POST calendar/events` | `calendar.write` | `{ person, id, uid, created, key, tries }` |
| `changeEvent(who, id, patch, { calendar })` | `PATCH calendar/events/{id}` | `calendar.write` | `{ person, id, uid, tries }`. The patch sets the properties given, removes one given as `null`, and takes a JMAP patch path (`'locations/l1/name'`) for one member; `calendar` moves the event |
| `deleteEvent(who, id)` | `DELETE calendar/events/{id}` | `calendar.write` | `{ person, id, deleted, tries }` |
| `listAddressBooks(who)` | `GET address-books` | `contacts.read` | `{ person, address_books, default }` |
| `listContacts(who, { addressBook, text, fields, position, limit })` | `GET address-book/contacts` | `contacts.read` | `{ person, contacts, position, total }`: a page in Brax Mail's own order. The next page starts at `position + contacts.length`. `limit` 100, at most 500, and at most 50 with `fields: '*'` (a card may carry its photo) |
| `readContact(who, id, { fields })` | `GET address-book/contacts/{id}` | `contacts.read` | The contact |
| `createContact(who, contact, { addressBook, key })` | `POST address-book/contacts` | `contacts.write` | As `createEvent` |
| `changeContact(who, id, patch, { addressBook })` | `PATCH address-book/contacts/{id}` | `contacts.write` | As `changeEvent`, without `uid` |
| `deleteContact(who, id)` | `DELETE address-book/contacts/{id}` | `contacts.write` | As `deleteEvent` |

**Who.** The first argument is the hub membership id of the person whose records these are, who is also the person
acting (the header `Brax-Acting-Member`): `context.hubMemberId`. To act for somebody else, say both,
`{ person, acting }`; the hub allows it only through a person role of this module over that person, and answers 403
`relation_required` otherwise. A role over the hub does not open another person's calendar.

**The scopes the manifest asks for** (`module.yaml`, `scopes`): `calendar.read` to list and read events,
`calendar.write` to create, change and delete them, `contacts.read` to list and read contacts. All are personal
scopes, so the install is the owner's to approve. Ask only for what the app calls; the example asks for
`calendar.read` alone. **`contacts.write` cannot be asked for yet**: it is in the hub's vocabulary, but the manifest
validator does not list it, so a manifest that names it is refused, and the three contact writes answer 403
`scope_required` to a real module of today. The functions are here and proven against the stand-in; they start to work
when the validator knows the scope and the manifest asks for it, with no change in an app's code.

The person must hold the permission too, over their own records: an owner and a member read and write them, an admin
reads them and cannot have a module write them, a guest holds none (403 `permission_required`). That is the default
roles as the hub has them today.

**A record is Brax Mail's own.** An event is a JSCalendar object (RFC 8984) and a contact a JSContact card (RFC 9553),
each with Brax Mail's `id`. `hub/records.ts` types the common properties (`title`, `start`, `timeZone`, `duration`,
`showWithoutTime`, `locations`, `recurrenceRule`, `alerts`; `name`, `emails`, `phones`, `organizations`, `addresses`,
`notes`) and leaves the rest open. `start` is a local date-time without an offset, read in the event's `timeZone`.
`fields` is a list of property names (`['title', 'start']`), or `'*'` for everything Brax Mail holds; `id` always
comes back, and a property Brax Mail does not hold is only absent.

**Never written here**, by the hub's rule: an invitation (an event with `participants`, `replyTo` or
`organizerCalendarAddress`), an event that already has guests, and one occurrence of a repeating event by its own id
(patch the stored event). Inviting people stays in the person's own Calendar screen. Tasks, task lists, and a calendar
or an address book somebody shares with the person are not shown.

**Creates, and the `Idempotency-Key`.** Every create is sent with a key, and the hub makes the record's `uid` from the
module, the person and that key, so the same call with the same key finds the first record and writes nothing. Make the
key once per thing the person did, where they did it: `newIdempotencyKey()` when the form is shown, sent back with the
form, passed as `key`. A second submit of the same form is then the same create. Without `key` the client makes one a
call, which covers its own tries and nothing more. The result says `created`: `true` when this call made the record,
`false` when it was there already from an earlier call with that key.

**Trying again is the client's work.** It sends a call again when the hub or Brax Mail failed, and never when the hub
refused:

| What happened | A read | A create | A change | A delete |
| --- | --- | --- | --- | --- |
| 502, any other 5xx, a dropped connection, no answer in 25 s | Sent again | Sent again with the same key | Sent again (the same values are written again) | Sent again; 404 at that try means the first one deleted it: done, `deleted: true` |
| 404 for the record | The error `event_not_found` or `contact_not_found` | | The same error | Done, not an error: `deleted: false` (it was already gone) |
| Any other 4xx, and 503 `mail_not_configured` | The error, at once | The error, at once | The error, at once | The error, at once |

Three tries in all by default (`tries`), with the pause the feed client uses: one second, doubled, each shortened by a
random part up to half. `{ tries, timeoutMs, signal }` on any call change that for the call: a page that waits for the
answer wants fewer and shorter (the example uses two tries of five seconds). After the last try the error says
`again: true`, and for a create carries `idempotencyKey`, so the app can send the same create later.

**When the hub says no**, the call rejects with one error, `HubRecordsError`: `code` (the hub's), `status`, `message`
(the hub's), `properties` (on `invalid_event` and `invalid_contact`), `writeAttempted` (from a write's 502), `again`
(whether the same call can pass), `say` (a sentence for the person), `tries` and `what` (the function).
`RECORDS_ERRORS` in `hub/records.ts` is the list, in the order the hub checks. Show the person the sentence, never the
code alone; the example does (`src/server/calendar.functions.ts` returns it as data, so the rest of the page still
shows).

| Code | What it means, and who can put it right | Again? | What the person is shown (`error.say`) |
| --- | --- | --- | --- |
| 401 `client_certificate_required`, `invalid_client_certificate`, `expired_client_certificate` | The module showed no certificate, one the hub cannot read, or one that has run out. The owner installs the module again | no | This app is not connected to the hub properly. The hub owner can install it again. |
| 403 `module_not_active` | The module is switched off on this hub. The owner switches it on | no | This app is switched off on this hub. |
| 403 `scope_required` | The module's grant does not hold the permission of the route: `module.yaml` does not ask for it, or the owner did not approve it. Today also every contact write | no | This app has not been allowed to do this. The hub owner decides what an app may do, in Hub administration. |
| 422 `acting_member_required` | No acting person was sent. A fault in the app (the client refuses it before sending) | no | This app asked the hub for something the hub could not read. That is a fault in the app. |
| 422 `unknown_member` | The id is not a member of this hub. A fault in the app, or a member who has left | no | The hub does not know this person. |
| 403 `relation_required` | The acting person is not the person, and holds no person role of this module over them with that permission | no | You may not do this for this person. |
| 403 `active_membership_required` | The person's access to the hub is switched off, or the acting person's | no | Access to this hub is switched off for this person. |
| 403 `permission_required` | The person does not hold the permission over their own records: a guest holds none, an admin reads and does not write | no | Your role on this hub does not allow this. |
| 422 `invalid_request` | An argument the hub cannot read (a limit of 0, an unknown parameter, a property a module may not set such as `uid`). A fault in the app | no | This app asked the hub for something the hub could not read. That is a fault in the app. |
| 422 `invalid_range` | `to` is not after `from`, or more than 366 days after it | no | These dates cannot be listed: the end has to be after the start, and at most 366 days later. |
| 422 `invalid_fields` | A name in `fields` that is not a property name, or one Brax Mail does not know | no | This app asked the hub for something the hub could not read. That is a fault in the app. |
| 422 `idempotency_key_required` | A create without a key of 8 to 128 letters, digits, `.`, `_`, `:` or `-` (the client always sends one) | no | This app asked the hub for something the hub could not read. That is a fault in the app. |
| 422 `invitations_not_supported` | The event names guests (`participants`, `replyTo`, `organizerCalendarAddress`). No invitation leaves through these routes | no | Inviting people is done in your own Calendar screen, not here. |
| 503 `mail_not_configured` | Brax Mail is switched off on this hub | no | Brax Mail is not switched on for this hub, so there is no calendar or address book to open. |
| 403 `mail_access_refused` | The person has no mailbox in Brax Mail | no | There is no Brax Mail mailbox for this person on this hub, so there is no calendar or address book to open. |
| 409 `no_calendar` | The mailbox has no calendar | no | This Brax Mail account has no calendar yet. |
| 409 `no_address_book` | The mailbox has no address book | no | This Brax Mail account has no address book yet. |
| 404 `event_not_found` | No event with that id (also the id of a task). On a delete the client reads it as done | no | This event is no longer in the calendar. |
| 404 `contact_not_found` | No contact with that id. On a delete the client reads it as done | no | This contact is no longer in the address book. |
| 422 `unknown_calendar` | The calendar named is not one of the person's own | no | This calendar is no longer there. |
| 422 `unknown_address_book` | The address book named is not one of the person's own | no | This address book is no longer there. |
| 422 `invalid_event` | Brax Mail refused the values; `error.properties` names the properties | no | Brax Mail did not accept the event as written. |
| 422 `invalid_contact` | The same for a contact | no | Brax Mail did not accept the contact as written. |
| 422 `filter_not_supported` | Brax Mail cannot answer `text` or `addressBook` on contacts | no | Brax Mail cannot search contacts this way. |
| 409 `event_has_guests` | The event has guests, who would not be told of a change made here | no | This event has guests. Change or delete it in your own Calendar screen, so they are told. |
| 409 `event_is_occurrence` | The id is one occurrence of a repeating event. Change the stored event (`baseEventId`) | no | This is one occurrence of a repeating event. Change the repeating event instead. |
| 409 `over_quota` | The mailbox is full | no | This Brax Mail account is full. |
| 413 `too_large` | The record is larger than Brax Mail keeps | no | This is too large for Brax Mail to keep. |
| 502 `mail_unreachable` | Brax Mail did not answer the hub in 10 seconds, or answered something the hub could not use. On a write `error.writeAttempted` says whether the write may have reached Brax Mail | yes | Brax Mail did not answer. Try again in a moment. |
| `hub_unreachable` | The client's own: no connection to the hub, a dropped one, or no answer in 25 seconds | yes | The hub did not answer. Try again in a moment. |
| `no_hub` | The client's own: no module credential and, locally, no `HUB_RECORDS_URL` | no | This app is not running on a hub here, so there is no calendar or address book to open. |
| `unexpected_answer` | The client's own: the hub answered 2xx with something that is not what the route gives | no | The hub answered something this app did not understand. |
| `aborted` | The client's own: the caller's `signal` ended the call | no | This was stopped before the hub answered. |

A code the list does not have (a newer hub) is read by its status: a 5xx may pass at another try, anything else will
not.

**The feed.** A write through these routes is an event in the hub's feed, with ids only: `calendar_event.created`,
`.changed`, `.deleted` (`data.event`, `data.uid`; shown to a module that holds `calendar.read`) and `contact.created`,
`.changed`, `.deleted` (`data.contact`, `data.uid`; `contacts.read`). A handler reads the record with
`hubRecords().readEvent(event.person, event.data.event)`. A change a phone makes directly in Brax Mail does not pass
the hub and makes no event: a module that shows a person's records lists them when the person opens it.

**Locally** there is no hub, and every call rejects with `no_hub`. To see an app use the routes:

```bash
npm run hub-records                                            # the stand-in hub on 38411
HUB_RECORDS_URL=http://127.0.0.1:38411 npm run dev             # APP_ENV=local only
node tooling/hub-records-stub.mjs grant contacts.read          # the grant without calendar.read: 403 scope_required
node tooling/hub-records-stub.mjs fail 502 mail_unreachable --times 2
node tooling/hub-records-stub.mjs lose                         # the next write is made and its answer lost
```

The stand-in knows the stub edge's four members, each with invented events around today and two invented contacts,
and holds the grant a real module can hold today (`--contacts-write` adds the fourth scope). It checks no certificate
and no consent, writes no audit entry and no feed event, and does not expand a repeating event.

`tooling/records.test.mjs` (in `npm test`) proves the client against the stand-in: the twelve functions, `fields`,
ranges and pages, acting for somebody else, a create repeated, a create whose answer was lost, cut or late, the bound
on the tries, a change and a delete sent again, every refusal of the table once and never twice, and what is refused
before anything is sent. The same file runs five checks against a real hub, and skips them otherwise:

```bash
HUB_TEST_URL=https://<hub>:8443 HUB_TEST_CREDENTIAL_DIR=<module.key, module.crt, root.crt> HUB_TEST_PERSON=<membership id> node --test tooling/records.test.mjs
```

That reads only. `HUB_TEST_WRITE=1` also creates one event in that person's calendar, changes it, deletes it and
tries one contact (refused with `scope_required` today, which the check accepts and says).

**Not verified, and not there yet.**

- Nothing here has run against a real hub, and nothing, here or in the hub's own tests, against a real Brax Mail. The
  hub's routes were proven against a stand-in for Brax Mail; this client against a stand-in for the hub written from
  the hub's tests. The first run of the five checks above on the lab hub is still to do.
- On a real Brax Mail the hub's authors could not prove the `text` and `addressBook` filters on contacts (422
  `filter_not_supported` if it cannot), nor that Brax Mail refuses a second record with the same `uid`, which is what
  two creates with one key in two hub processes rest on.
- `contacts.write`, as above: no manifest can ask for it.
- `expand: true` passes Brax Mail's own listing of occurrences through; the stand-in lists the stored event once.

An app made before this takes it with `node kit/init.mjs --sync <slug> <dir>`, then adds by hand what `--sync` does not
own: `tooling/records.test.mjs` in its `test` script (and, if wanted, `"hub-records": "node tooling/hub-records-stub.mjs
serve"`), the scopes it uses in `module.yaml`, and its own calls of `hubRecords()`. There is no migration and no line
in the entry: nothing is kept, and nothing runs until the app calls. `--sync` also brings a new `hub/event-feed.ts`,
whose `hubTransport()` now sends any call of the module API (`call`); an app that only used `followHubEvents()` changes
nothing.

## Local commands (in an app, e.g. `kit/example`)

```bash
npm install
npm run dev            # http://localhost:3310/modules/<slug>/ as DEV_MEMBER=owner; ?as=admin|member|viewer; ?accent=2563EB
npm run gate           # typecheck && security-scan && ui-check && test-rls && build
npm test               # scanner fixtures, token verifier, the hub's event feed, a person's calendar and address book, kit drift
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

## Status of a person's calendar and address book (2026-11-26, TASKS APM20)

Written against `Brax-Hub/brax-hub` pull request 284 at `b418f089` (the hub server half: `app/module_records.py`,
`app/mail_records.py` and their tests), which had not merged when this was written.

Green on this PC (Windows, Node 24, PGlite): at the root `npm test` (116) and the typecheck; in `kit/example` the gate
(typecheck, 14 scanner rules, the UI check, 95 RLS assertions, build), `npm test` (60 passed, 12 skipped without a
hub: 23 checks of this client against the stand-in hub, and the feed's 15, which still pass on the transport both now
share) and `node kit/init.mjs --check example kit/example`.

Tried by hand in `kit/example`: the dev server with `HUB_RECORDS_URL` naming the stand-in listed the member's next
events on the Items page, as the owner and as a member; with `calendar.read` taken out of the stand-in's grant the page
showed the sentence for `scope_required` and the items still showed; with two 502 answers it tried twice, waited
between the two, and showed the sentence for `mail_unreachable`. The five checks for a real hub were run once, with
`HUB_TEST_WRITE=1`, against the stand-in behind a TLS listener that demands a client certificate: all five passed
(reads, a create sent twice, a change, two deletes, and the contact write refused with `scope_required`), and a
certificate of another authority got no answer.

Not run: anything against a real hub or a real Brax Mail, the three contact writes with a grant a manifest gave (no manifest can ask for `contacts.write` yet), the
browser suites (`smoke`, `screens`) with the new section on the page, and the manifest validator on the example.


## Status of the install without a token (2026-11-26)

`Brax-Hub/ui-kit` is public since 26 November 2026 (ADR-039 "Open" 9), and nothing in the kit hands git a token any
more. Everything below was run with nothing for git to authenticate with: no token in the environment, no credential
helper, no prompt, no SSH key.

Green on this PC (Windows, Node 24, npm 12.2.0): at the root a clean `npm ci`, `npm test` (60) and the typecheck; in
`kit/example` a clean `npm ci`, the gate (typecheck, 14 scanner rules, the UI check, 95 RLS assertions, build),
`npm test` (37 passed, 7 skipped without a hub) and `node kit/init.mjs --check example kit/example`. An app made by
`init` with the UI kit from the tag `ui-v0.2.0`: `npm install`, `npm ci` from the lock file under each way npm writes
the address (`git+https`, `git+ssh`), and, after `npm run routes`, the gate with the same numbers and `npm test`.

The image, built once on this PC (Docker 29.9.2, linux/amd64) from an app made by `init` (slug `example`, the lock
file npm 12 wrote) with `docker build .` and no build secret: `npm ci` in the build stage installed the UI kit with
the rest (235 packages), the build passed, the image was 761 MB. Run read-only with a `/data` volume, as `release.yml`
runs it: `healthz` 200 within 5 s, 401 without the member headers, 200 with them, 401 on `tools/call` without a
token, and the page's stylesheet came from the image with the UI kit's values in it. The image, the container and the
volume were removed afterwards. It is the first build of the image since an app takes the UI kit as a package
(25 November 2026). `kit/example` itself cannot be built into an image from its own folder: it takes the UI kit from
the working tree (`file:../..`), which a build in that folder cannot see.

Green in CI (Linux, Node 22): `ui`, `kit`, and `by-tag`, which installs the UI kit from git at the pull request's
commit and then from the lock file alone under each way npm writes the address, with a job token that may read
nothing and an ssh that refuses (it was never asked).

Not run: `release.yml` and an app's `ci.yml` as workflows (they run in an app's repository), the browser suites, the
overlay, an install on a hub.
