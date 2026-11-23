// One failing fixture per scanner rule (plan A4 acceptance). A minimal app that passes every rule is written to a
// temporary directory; each test mutates one thing and expects exactly that rule to fail. Run with
// `node --test tooling/security-scan.test.ts` (Node 22.18+ strips the types).
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { RULES, scan } from './security-scan.ts'

const PASSING: Record<string, string> = {
  'module.yaml': `manifest_version: 1
slug: fixture
name: Fixture
version: 0.1.0
description: A fixture.
kind: service
scopes: [people.read]
surfaces:
  service:
    image: ghcr.io/brax-hub/fixture@sha256:0000000000000000000000000000000000000000000000000000000000000000
    ingress: { port: 8080, entry: /modules/fixture/ }
    user: app
mcp: { url: http://fixture:8080/modules/fixture/mcp }
tools:
  - { name: list_things, description: Things., side_effect: false, ceiling: auto, scopes: [people.read], version: 1 }
`,
  Dockerfile: `FROM node:22-bookworm-slim\nUSER app\nENTRYPOINT ["node", "dist/server/index.js"]\n`,
  'deploy/compose.fixture.yaml': `services:\n  fixture:\n    image: x\n    read_only: true\n    networks: [fixture]\nnetworks:\n  fixture:\n    internal: true\n`,
  'vite.config.ts': `export default defineConfig(({ mode }) => ({ plugins: [...(mode === 'development' ? [devMemberPlugin()] : []), tanstackStart()] }))\n`,
  'tooling/dev-member.ts': `export function devMemberPlugin() { if ((process.env.APP_ENV ?? 'local') !== 'local') throw new Error('local only') }\n`,
  'src/server/hub/identity.server.ts': `import { signJwt } from 'tinbase'\nexport function readHubMember(r: Request) { return r.headers.get('x-brax-member-id') }\nexport function memberToken() { return signJwt({}, 'secret') }\n`,
  'src/server/db/client.server.ts': `import { createClient } from '@supabase/supabase-js'\nexport const serviceClient = (reason: string) => createClient('http://tinbase.local', 'key')\n`,
  'src/server/tinbase.server.ts': `import { createBackend } from 'tinbase'\nexport const backend = await createBackend({ authEnabled: false })\n`,
  'src/server/jobs/index.ts': `import { serviceClient } from '../db/client.server'\nexport const tick = () => serviceClient('jobs:tick')\n`,
  'src/server/mcp/server.ts': `import { handlers } from '../tools'\nimport { verifyDelegatedToken } from './delegated-token'\nexport function handle(method: string, name: string, token: string) {\n  if (method === 'tools/call') {\n    verifyDelegatedToken(token)\n    return handlers[name]!({})\n  }\n}\n`,
  'src/server/mcp/delegated-token.ts': `export function verifyDelegatedToken(token: string) { return token }\n`,
  'src/server/tools/index.ts': `import { list_things } from './list_things'\nexport const handlers = { list_things }\n`,
  'src/server/tools/list_things.ts': `export const list_things = async () => ({ content: [] })\n`,
  'src/server/things.functions.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const listFn = createServerFn({ method: 'GET' })\n  .middleware([requireMember()])\n  // input: none\n  .handler(async () => [])\n\nexport const addFn = createServerFn({ method: 'POST' })\n  .middleware([requireRole(WRITERS)])\n  .validator(schema)\n  .handler(async ({ data }) => data)\n`,
  'src/routes/index.tsx': `import { listFn } from '@/server/things.functions'\nexport const Route = { loader: () => listFn() }\n`,
  'supabase/migrations/20260101000000_init.sql': `create table public.things (id uuid primary key, owner_id uuid not null);
create index things_owner_id_idx on public.things (owner_id);
alter table public.things enable row level security;
alter table public.things force row level security;
grant select, insert, update, delete on public.things to authenticated;
revoke all on public.things from anon;
create policy things_select on public.things for select to authenticated using (owner_id = (select auth.uid()));
create policy things_insert on public.things for insert to authenticated with check (owner_id = (select auth.uid()));
create policy things_update on public.things for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy things_delete on public.things for delete to authenticated using (owner_id = (select auth.uid()));
create view public.things_view with (security_invoker = true) as select * from public.things;
create or replace function app.role() returns text language sql stable security definer set search_path = public, pg_temp as $$ select 'member' $$;
revoke execute on function app.role() from public, anon;
`,
}

function fixture(mutations: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'brax-scan-'))
  for (const [rel, text] of Object.entries({ ...PASSING, ...mutations })) {
    if (text === null) continue
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  for (const [rel, text] of Object.entries(mutations)) if (text === null) rmSync(join(root, rel), { force: true })
  return root
}

function failing(root: string): string[] {
  try {
    return scan(root).findings.map((f) => f.rule)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('the passing fixture passes every rule', () => {
  assert.deepEqual(failing(fixture()), [])
})

/** rule -> a mutation that must fail it and nothing else. */
const FAILING: Record<string, Record<string, string | null>> = {
  'identity headers read only in src/server/hub/identity.server.ts': { 'src/server/things.functions.ts': PASSING['src/server/things.functions.ts'] + `export const who = (r: Request) => r.headers.get('x-brax-member-id')\n` },
  'signJwt called only in identity.server.ts': { 'src/server/jobs/index.ts': PASSING['src/server/jobs/index.ts'] + `import { signJwt } from 'tinbase'\nexport const forge = () => signJwt({ sub: 'x' }, 'secret')\n` },
  'no authEnabled: true': { 'src/server/tinbase.server.ts': PASSING['src/server/tinbase.server.ts']!.replace('authEnabled: false', 'authEnabled: true') },
  'no tinbase port listener in src/': { 'src/server/tinbase.server.ts': PASSING['src/server/tinbase.server.ts'] + `import { serve } from 'tinbase/node'\nawait serve(backend, { port: 54321 })\n` },
  'serviceClient( only with a string literal reason': { 'src/server/jobs/index.ts': `import { serviceClient } from '../db/client.server'\nexport const tick = (why: string) => serviceClient(why)\n` },
  'tools/call behind verifyDelegatedToken': {
    'src/server/mcp/server.ts': `import { handlers } from '../tools'\nimport { verifyDelegatedToken } from './delegated-token'\nexport function handle(method: string, name: string, token: string) {\n  if (method === 'tools/call') {\n    const out = handlers[name]!({})\n    verifyDelegatedToken(token)\n    return out\n  }\n}\n`,
  },
  'manifest tools equal the handler set': { 'src/server/tools/add_thing.ts': `export const add_thing = async () => ({ content: [] })\n` },
  'Dockerfile ends with a non-root USER': { Dockerfile: `FROM node:22-bookworm-slim\nUSER app\nUSER root\nENTRYPOINT ["node", "dist/server/index.js"]\n` },
  'overlay publishes no port and declares an internal network': { 'deploy/compose.fixture.yaml': `services:\n  fixture:\n    image: x\n    read_only: true\n    ports: ["8080:8080"]\n    networks: [fixture]\nnetworks:\n  fixture:\n    internal: true\n` },
  'module.yaml has no unknown keys': { 'module.yaml': PASSING['module.yaml'] + `webhooks: []\n` },
  'no secrets or server-only imports in routes and components': { 'src/routes/index.tsx': `import { getEnv } from '@/server/env.server'\nexport const Route = { loader: () => getEnv().jwtSecret }\n` },
  'server functions carry middleware and validators': { 'src/server/things.functions.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const dropFn = createServerFn({ method: 'POST' })\n  .validator(schema)\n  .handler(async ({ data }) => data)\n` },
  'createClient only in client.server.ts; the stub edge only in vite.config.ts': { 'vite.config.ts': `export default defineConfig(() => ({ plugins: [devMemberPlugin(), tanstackStart()] }))\n` },
  'RLS migration audit': { 'supabase/migrations/20260102000000_notes.sql': `create table public.notes (id uuid primary key, body text);\nalter table public.notes enable row level security;\ncreate policy notes_all on public.notes for all to authenticated using (true);\n` },
}

test('every rule has a failing fixture', () => {
  assert.deepEqual(Object.keys(FAILING).sort(), Object.keys(RULES).sort())
})

for (const [rule, mutation] of Object.entries(FAILING)) {
  test(`fails: ${rule}`, () => {
    const failed = failing(fixture(mutation))
    assert.ok(failed.includes(rule), `expected "${rule}" to fail, got: ${failed.join(', ') || 'nothing'}`)
    assert.deepEqual(failed, [rule], 'the mutation must fail its own rule only')
  })
}

test('the example app itself passes', () => {
  const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  const root = join(here, '..')
  const result = scan(root)
  assert.deepEqual(result.findings, [], JSON.stringify(result.findings, null, 2))
})

// A copy the test can mutate without touching the app: keeps cpSync referenced for fixtures that start from the app.
export { cpSync }
