# The module kit

What every Brax Business App copies to run as a Brax Hub module on tinbase: one Node 22 process, no login of its own
(the hub's edge names the member in three headers), data in tinbase (Supabase-shaped Postgres 17 embedded in the
process, never on a port), tools for AI through the hub's tool gateway over MCP, and LCC reached over mTLS with the
module credential. `kit/example/` is an app made from it and the proof. Plan: `docs/entity-hub/module-implementation-plan.md`
(A3, A4). Status and the open items are at the bottom.

## Files

| Path | What it is |
| --- | --- |
| `server/env.server.ts` | The only reader of the environment: `APP_ENV`, `DATA_DIR`, `TINBASE_ENGINE`, `JWT_SECRET[_FILE]`, `LCC_URL`, `MODULE_CREDENTIAL_DIR`, `GATEWAY_KEYS_URL`, `JOBS` |
| `server/tinbase.server.ts` | `createBackend` once per process (globalThis-cached): `authEnabled: false`, native engine on Linux/macOS, PGlite on Windows, `supabase/` migrations and seed, buckets, `FsStorageDriver`, outbox mailer, `close()` on SIGTERM. Exports `backend`, `anonKey`, `serviceRoleKey` |
| `server/hub/identity.server.ts` | `readHubMember` (401 `hub_member_required`), `resolveMember` (upsert `memberships`; hub role on first sight and when it rises), `findMemberByHubId`, `memberToken` (the only `signJwt` call: 5-minute HS256, `sub` = memberships.id) |
| `server/db/client.server.ts` | `memberClient(ctx)` (supabase-js over `backend.fetch` with the member bearer), `serviceClient(reason)` (logged), `anonClient()` |
| `server/middleware/rbs.ts` | `requireMember()`, `requireRole(allowed)`; resolves once per request; 401/403 through `setResponseStatus` plus `AccessError`. Not `*.server.ts`: see the contradictions |
| `server/hub/lcc.server.ts` | mTLS client: `me`, `people`, `contacts`, `sendCard`, `createRequest`, `gatewayKeys`; `{ ok: false, reason: 'no_hub' | 'not_enabled' | 'error' | 'unreachable' }`, never throws |
| `server/mcp/server.ts`, `delegated-token.ts`, `manifest.ts` | The MCP server at `<entry>mcp`; `tools/list` from `module.yaml`; `tools/call` behind `verifyDelegatedToken` (Ed25519, 60 s, RFC 8785 args digest, replay log, keys refreshed on an unknown kid), then the handler as the acting member |
| `server/jobs/index.ts` | `registerJobs(backend, defs)`: `jobs` rows, `cron.schedule(name, schedule, 'select app.enqueue_job(name)')`, a poller executing queued `job_runs` under `serviceClient('job:<name>')`; `runNow(name)` |
| `server/hub/people-sync.ts` | The nightly reconcile of `memberships` from `lcc.people()`; no-op with `no_hub` |
| `server/static.server.ts` | Serves `dist/client` under the entry prefix in production |
| `server/tools/index.ts` | The empty handler registry an app fills (one file per manifest tool) |
| `dev/dev-member.ts` | Copied to the app's `tooling/` like the other two stubs. The stub edge (Vite middleware): `DEV_MEMBER`, `?as=`, cookie; refuses outside `APP_ENV=local`; strips the headers on the MCP path |
| `dev/gateway-stub.mjs` | `serve` the keys on 38400 (LCC's `{ keys: [{kid, alg, pub}] }` shape), `call <tool> '<json>' --as owner` mints a delegated token and drives `tools/call`; `--expired`, `--bad-args`, `--replay` |
| `dev/ai-stub.mjs` | OpenAI-shaped `/v1/chat/completions` stub on 54399, plus `/services/module/contacts` and `STUB_DENY` |
| `tooling/security-scan.ts` + `.test.ts` | The A4 rules (14) with one failing fixture per rule |
| `tooling/browser.mjs`, `kit-drift.test.mjs` | playwright-core on Edge with `?as=` for the member; the app's managed copies equal the kit |
| `example/tooling/rls-test.mjs`, `smoke.mjs`, `screenshots.mjs`, `mcp.test.mjs` | The app's own suites, scaffolded once by `init` and then the app's: owner, admin, member, viewer, a stranger, a second tenant's owner, the service and anon against a throwaway backend (74 assertions on the example); the smoke and screen runs; the verifier against stub-minted tokens |
| `tooling/ci.yml`, `release.mjs`, `rollback.mjs`, `build-server.mjs`, `gen-types.mjs` | CI (gate, suites, native engine), digest release, rollback (moved unchanged), the Node entry, `tinbase gen types` |
| `module.yaml.example`, `Dockerfile`, `deploy/compose.MODULE.yaml`, `deploy/lcc-edge.MODULE.conf` | The templates (`{{slug}}`, `{{SLUG}}`) |
| `init.mjs` | `node kit/init.mjs <slug> <dir>` copies the example as a scaffold and the managed files on top; `--sync` refreshes them; `--check` reports drift. The suites are not managed |

## Local commands (in an app, e.g. `kit/example`)

```bash
npm install
npm run dev            # http://localhost:3310/modules/<slug>/ as DEV_MEMBER=owner; ?as=admin|member|viewer
npm run gate           # typecheck && security-scan && test-rls && build
npm test               # scanner fixtures, token verifier, kit drift
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
