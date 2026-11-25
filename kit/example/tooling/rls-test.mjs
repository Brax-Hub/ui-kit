#!/usr/bin/env node
// RLS policy test (brax-data step 6; brax-security-rbs 4.9), part of `npm run gate`. Boots a tinbase backend of its
// own (PGlite in a temporary directory, or the native engine with TINBASE_ENGINE=native) on the app's migrations and
// seed, then for every seeded role, for a member of no standing (an unknown uuid) and for anon it checks row counts
// per table and the insert, update and delete outcomes, each statement inside a transaction that is rolled back, with
// the role and the JWT claims set exactly the way tinbase's REST layer sets them for a request.
//
// Usage: node tooling/rls-test.mjs            (exit 1 on any failed expectation)
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBackend } from 'tinbase'
import { createNativeEngine, loadSupabaseProject } from 'tinbase/node'

const TENANT = '00000000-0000-4000-8000-000000000001'
const MEMBERS = {
  owner: '10000000-0000-4000-8000-000000000001',
  admin: '10000000-0000-4000-8000-000000000002',
  member: '10000000-0000-4000-8000-000000000003',
  viewer: '10000000-0000-4000-8000-000000000004',
}
const STRANGER = '99999999-0000-4000-8000-000000000999'
const OTHER_TENANT = '00000000-0000-4000-8000-000000000002'
const OUTSIDER = '10000000-0000-4000-8000-000000000099'
const OWNER_PRIVATE_ITEM = '20000000-0000-4000-8000-000000000004'
const MIA_ITEM = '20000000-0000-4000-8000-000000000003'

class Rollback extends Error {
  constructor(value) {
    super('rollback')
    this.value = value
  }
}

export async function runRlsTest({ root = process.cwd(), log = console.log } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'brax-rls-'))
  const project = await loadSupabaseProject(root)
  const native = process.env.TINBASE_ENGINE === 'native'
  const engine = native ? await createNativeEngine({ dataDir: join(dir, 'pgdata'), cacheDir: process.env.TINBASE_PG_CACHE_DIR || undefined }) : undefined
  const backend = await createBackend({ ...project, authEnabled: false, ...(engine ? { engine } : { dataDir: join(dir, 'pgdata') }), jwtSecret: 'rls-test-throwaway-secret-0123456789abcdef' })
  await backend.cron.stop()
  let failed = 0
  let passed = 0
  try {
    if (backend.db.migrationFailure) throw new Error(`migration ${backend.db.migrationFailure.name} failed: ${backend.db.migrationFailure.error}`)
    const expect = (label, actual, predicate) => {
      if (predicate(actual)) passed++
      else {
        failed++
        log(`FAIL  ${label} -> ${JSON.stringify(actual)}`)
      }
    }
    /** The request context tinbase would build for a role: the member token's claims, or anon with none. */
    const ctx = (role) => {
      if (role === 'anon') return { role: 'anon', claims: null }
      if (role === 'service') return { role: 'service_role', claims: { role: 'service_role' } }
      const sub = role === 'stranger' ? STRANGER : role === 'outsider' ? OUTSIDER : MEMBERS[role]
      const hubRole = role === 'viewer' ? 'member' : role === 'outsider' ? 'owner' : role
      return { role: 'authenticated', claims: { sub, role: 'authenticated', aud: 'authenticated', hub_role: hubRole } }
    }
    /** One statement as the role, inside a transaction that always rolls back: { ok, value, rows } or { ok: false, error }. */
    async function run(role, sql, params = []) {
      try {
        await backend.db.withContext(ctx(role), async (q) => {
          const r = await q(sql, params)
          throw new Rollback(r)
        })
      } catch (error) {
        if (error instanceof Rollback) {
          const rows = error.value?.rows ?? []
          const first = rows[0] ? Object.values(rows[0])[0] : undefined
          return { ok: true, value: first === null || first === undefined ? first : String(first), rows }
        }
        return { ok: false, error: String(error.message ?? error).split('\n')[0] }
      }
      return { ok: false, error: 'no result' }
    }
    const count = async (role, table) => {
      const r = await run(role, `select count(*) from public.${table}`)
      return r.ok ? Number(r.value) : r.error
    }
    const denied = (r) => !r.ok && /row-level security|permission denied/i.test(r.error)

    // Every public table has RLS on and forced.
    const unprotected = await backend.db.query(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`)
    expect('every public table has RLS', unprotected.rows.map((r) => r.tablename), (t) => t.length === 0)
    const unforced = await backend.db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relforcerowsecurity`)
    expect('every public table forces RLS', unforced.rows.map((r) => r.relname), (t) => t.length === 0)

    // The hub feed's cursor and two calendar notes, as the service writes them (src/server/hub/events.server.ts,
    // src/server/events/register.ts): the owner's and Mia's.
    await backend.db.query(`insert into public.hub_cursors (feed, cursor) values ('events', 'evt_000000000007')`)
    await backend.db.query(`insert into public.calendar_changes (event, member_id, change, changed_at) values ('ev_owner', $1, 'created', now()), ('ev_mia', $2, 'changed', now())`, [MEMBERS.owner, MEMBERS.member])

    const tables = ['tenants', 'memberships', 'items', 'jobs', 'job_runs', 'hub_cursors', 'calendar_changes']
    // 1. anon and a stranger read nothing.
    for (const t of [...tables, 'items_with_owner']) {
      expect(`anon sees no ${t}`, await count('anon', t), (n) => n === 0 || typeof n === 'string')
      expect(`stranger sees no ${t}`, await count('stranger', t), (n) => n === 0)
    }
    expect('the service reads everything', await count('service', 'items'), (n) => n === 5)

    // 2. Reads per role: team items for all, private items for their owner only, the team list for every member.
    for (const role of ['owner', 'admin', 'member', 'viewer']) {
      expect(`${role} reads the tenant`, await count(role, 'tenants'), (n) => n === 1)
      expect(`${role} sees the team`, await count(role, 'memberships'), (n) => n === 4)
      const own = role === 'owner' || role === 'member' ? 1 : 0
      expect(`${role} reads team items plus own private ones`, await count(role, 'items'), (n) => n === 3 + own)
      expect(`${role} reads the view the same way`, await count(role, 'items_with_owner'), (n) => n === 3 + own)
      const admin = role === 'owner' || role === 'admin'
      expect(`${role} jobs access`, await count(role, 'jobs'), (n) => (admin ? n >= 0 : n === 0))
      expect(`${role} job_runs access`, await count(role, 'job_runs'), (n) => (admin ? n >= 0 : n === 0))
      expect(`${role} reads the hub feed's cursor only as an admin`, await count(role, 'hub_cursors'), (n) => n === (admin ? 1 : 0))
      expect(`${role} reads the calendar notes about themself only`, await count(role, 'calendar_changes'), (n) => n === own)
    }
    expect('a viewer never sees the owner\'s private item', await run('viewer', `select count(*) from public.items where id = '${OWNER_PRIVATE_ITEM}'`), (r) => r.ok && r.value === '0')
    expect('the owner sees their private item', await run('owner', `select count(*) from public.items where id = '${OWNER_PRIVATE_ITEM}'`), (r) => r.ok && r.value === '1')

    // 3. Writes per role.
    const insertItem = (role, visibility = 'team') => run(role, `insert into public.items (tenant_id, owner_id, title, visibility) values ($1, $2, 'New item', $3) returning title`, [TENANT, MEMBERS[role], visibility])
    for (const role of ['owner', 'admin', 'member']) expect(`${role} inserts an item`, await insertItem(role), (r) => r.ok && r.value === 'New item')
    expect('a viewer cannot insert', await insertItem('viewer'), denied)
    expect('a member cannot insert as someone else', await run('member', `insert into public.items (tenant_id, owner_id, title) values ($1, $2, 'Forged') returning title`, [TENANT, MEMBERS.owner]), denied)
    expect('a stranger cannot insert', await run('stranger', `insert into public.items (tenant_id, owner_id, title) values ($1, $2, 'x') returning title`, [TENANT, STRANGER]), (r) => !r.ok)
    expect('anon cannot insert', await run('anon', `insert into public.items (tenant_id, owner_id, title) values ($1, $2, 'x') returning title`, [TENANT, MEMBERS.owner]), (r) => !r.ok)

    const updateMia = (role) => run(role, `update public.items set title = 'Edited' where id = '${MIA_ITEM}' returning title`)
    expect('the owner edits anyone\'s item', await updateMia('owner'), (r) => r.ok && r.value === 'Edited')
    expect('an admin edits anyone\'s item', await updateMia('admin'), (r) => r.ok && r.value === 'Edited')
    expect('a member edits their own item', await updateMia('member'), (r) => r.ok && r.value === 'Edited')
    expect('a member cannot edit another\'s item (zero rows)', await run('member', `update public.items set title = 'Edited' where id = '20000000-0000-4000-8000-000000000002' returning title`), (r) => r.ok && r.rows.length === 0)
    expect('a viewer cannot edit (zero rows)', await updateMia('viewer'), (r) => r.ok && r.rows.length === 0)

    const deleteMia = (role) => run(role, `delete from public.items where id = '${MIA_ITEM}' returning title`)
    expect('an admin deletes any item', await deleteMia('admin'), (r) => r.ok && r.rows.length === 1)
    expect('a member deletes their own item', await deleteMia('member'), (r) => r.ok && r.rows.length === 1)
    expect('a member cannot delete another\'s item (zero rows)', await run('member', `delete from public.items where id = '20000000-0000-4000-8000-000000000001' returning title`), (r) => r.ok && r.rows.length === 0)
    expect('a viewer cannot delete (zero rows)', await deleteMia('viewer'), (r) => r.ok && r.rows.length === 0)

    // 4. memberships: admins change others' app roles; nobody changes their own; nobody inserts or deletes.
    expect('an admin lowers a member to viewer', await run('admin', `update public.memberships set role = 'viewer' where id = '${MEMBERS.member}' returning role`), (r) => r.ok && r.value === 'viewer')
    expect('a member cannot change roles (zero rows)', await run('member', `update public.memberships set role = 'owner' where id = '${MEMBERS.member}' returning role`), (r) => r.ok && r.rows.length === 0)
    expect('an admin cannot change their own role (zero rows)', await run('admin', `update public.memberships set role = 'owner' where id = '${MEMBERS.admin}' returning role`), (r) => r.ok && r.rows.length === 0)
    expect('an owner cannot insert a membership', await run('owner', `insert into public.memberships (tenant_id, hub_member_id, hub_role, role) values ($1, 'x', 'member', 'member') returning id`, [TENANT]), denied)
    expect('an owner cannot delete a membership (zero rows)', await run('owner', `delete from public.memberships where id = '${MEMBERS.viewer}' returning id`), (r) => r.ok && r.rows.length === 0)
    expect('the service inserts a membership', await run('service', `insert into public.memberships (tenant_id, hub_member_id, hub_role, role) values ($1, 'x', 'member', 'member') returning id`, [TENANT]), (r) => r.ok)

    // 5. jobs: read-only for admins, nothing for the rest.
    expect('an admin cannot queue a run (denied)', await run('admin', `insert into public.job_runs (job, status, trigger) values ('heartbeat', 'queued', 'manual') returning id`), (r) => !r.ok)
    expect('a viewer cannot read jobs', await count('viewer', 'jobs'), (n) => n === 0)

    // 5b. The hub feed's cursor and the calendar notes are the service's to write.
    expect('an owner cannot move the cursor (zero rows)', await run('owner', `update public.hub_cursors set cursor = 'evt_000000000000' returning feed`), (r) => r.ok && r.rows.length === 0)
    expect('an owner cannot insert a cursor', await run('owner', `insert into public.hub_cursors (feed, cursor) values ('other', 'evt_000000000001') returning feed`), denied)
    expect('an owner cannot delete the cursor (zero rows)', await run('owner', `delete from public.hub_cursors returning feed`), (r) => r.ok && r.rows.length === 0)
    expect('the service moves the cursor', await run('service', `update public.hub_cursors set cursor = 'evt_000000000008' where feed = 'events' returning cursor`), (r) => r.ok && r.value === 'evt_000000000008')
    expect('a member cannot note a calendar change', await run('member', `insert into public.calendar_changes (event, member_id, change, changed_at) values ('ev_forged', $1, 'created', now()) returning event`, [MEMBERS.member]), denied)
    expect('a member cannot rewrite their own note (zero rows)', await run('member', `update public.calendar_changes set change = 'deleted' where event = 'ev_mia' returning event`), (r) => r.ok && r.rows.length === 0)
    expect('a member cannot delete their own note (zero rows)', await run('member', `delete from public.calendar_changes where event = 'ev_mia' returning event`), (r) => r.ok && r.rows.length === 0)
    expect('the service notes a change twice and keeps one row', await run('service', `insert into public.calendar_changes (event, member_id, change, changed_at) values ('ev_mia', $1, 'deleted', now()) on conflict (event) do update set change = excluded.change returning change`, [MEMBERS.member]), (r) => r.ok && r.rows.length === 1 && r.value === 'deleted')

    // 6. An inactive member reads nothing and writes nothing, whatever their role.
    await backend.db.query(`update public.memberships set status = 'inactive' where id = $1`, [MEMBERS.admin])
    expect('an inactive admin sees no items', await count('admin', 'items'), (n) => n === 0)
    expect('an inactive admin cannot insert', await insertItem('admin'), denied)
    await backend.db.query(`update public.memberships set status = 'active' where id = $1`, [MEMBERS.admin])

    // 7. A second tenant's owner sees only their own tenant: no rows of this one, no writes into it. One hub is one
    //    tenant today; this proves the tenant check every policy carries (brax-security-rbs 4.2).
    await backend.db.query(`insert into public.tenants (id, name) values ($1, 'Other hub')`, [OTHER_TENANT])
    await backend.db.query(`insert into public.memberships (id, tenant_id, hub_member_id, hub_role, role, name) values ($1, $2, 'other-owner', 'owner', 'owner', 'Other Owner')`, [OUTSIDER, OTHER_TENANT])
    expect('an outsider reads only their own tenant', await run('outsider', `select id from public.tenants`), (r) => r.ok && r.rows.length === 1 && r.value === OTHER_TENANT)
    expect('an outsider sees only their own team', await count('outsider', 'memberships'), (n) => n === 1)
    expect('an outsider sees no items of this tenant', await count('outsider', 'items'), (n) => n === 0)
    expect('an outsider sees no calendar notes of this tenant', await count('outsider', 'calendar_changes'), (n) => n === 0)
    expect('an outsider cannot rename this tenant (zero rows)', await run('outsider', `update public.tenants set name = 'Taken' where id = '${TENANT}' returning id`), (r) => r.ok && r.rows.length === 0)
    expect('an outsider cannot change this tenant\'s roles (zero rows)', await run('outsider', `update public.memberships set role = 'viewer' where id = '${MEMBERS.member}' returning id`), (r) => r.ok && r.rows.length === 0)
    expect('an outsider cannot add an item to this tenant', await run('outsider', `insert into public.items (tenant_id, owner_id, title) values ($1, $2, 'x') returning title`, [TENANT, OUTSIDER]), denied)
    expect('an outsider cannot delete this tenant\'s items (zero rows)', await run('outsider', `delete from public.items returning id`), (r) => r.ok && r.rows.length === 0)

    log(failed ? `rls-test: ${failed} failed, ${passed} passed` : `rls-test: ${passed} assertions passed`)
    return { failed, passed }
  } finally {
    await backend.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

/** A real install (APP_ENV=hub) skips the seed: the migrations alone must give exactly one tenant and no demo rows. */
export async function runEmptyHubTest({ root = process.cwd(), log = console.log } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'brax-empty-hub-'))
  const project = await loadSupabaseProject(root, { enabled: false })
  const native = process.env.TINBASE_ENGINE === 'native'
  const engine = native ? await createNativeEngine({ dataDir: join(dir, 'pgdata'), cacheDir: process.env.TINBASE_PG_CACHE_DIR || undefined }) : undefined
  const backend = await createBackend({ ...project, authEnabled: false, ...(engine ? { engine } : { dataDir: join(dir, 'pgdata') }), jwtSecret: 'rls-test-throwaway-secret-0123456789abcdef' })
  await backend.cron.stop()
  const problems = []
  try {
    if (backend.db.migrationFailure) throw new Error(`migration ${backend.db.migrationFailure.name} failed: ${backend.db.migrationFailure.error}`)
    const n = async (table) => Number((await backend.db.query(`select count(*) as n from public.${table}`)).rows[0].n)
    if ((await n('tenants')) !== 1) problems.push(`tenants: ${await n('tenants')}, want 1 (create the hub tenant in a migration, not in seed.sql)`)
    for (const table of ['memberships', 'items']) if ((await n(table)) !== 0) problems.push(`${table}: ${await n(table)} rows without the seed, want 0`)
    for (const p of problems) log(`FAIL  empty hub ${p}`)
    log(problems.length ? `empty-hub: ${problems.length} failed` : 'empty-hub: one tenant, no demo rows')
    return { failed: problems.length }
  } finally {
    await backend.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

if (process.argv[1] && /rls-test\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const { failed } = await runRlsTest()
  const empty = await runEmptyHubTest()
  process.exit(failed || empty.failed ? 1 : 0)
}
