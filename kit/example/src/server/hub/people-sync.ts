// Nightly reconciliation of `memberships` from the hub's people directory (GET /services/module/people, scope
// people.read; lcc app/modules.py). Names and hub roles follow the hub; a membership's app role rises with the hub
// role and is never lowered by the sync (an owner may have lowered it inside the app); the hub's teams land in the
// `teams` column; members the hub no longer lists become inactive, which locks them out at once. Without a hub
// (local development) or without the scope, the job records a note and touches nothing.
import type { JobDef, JobRun } from '../jobs'
import type { AppRole, HubRole } from './identity.server'
import { lcc, type HubPeople } from './lcc.server'

const RANK: Record<HubRole, number> = { member: 1, admin: 2, owner: 3 }

/** LCC's roles onto the three the app knows; anything else (guest, child) is a member. */
export function hubRoleOf(role: string): HubRole {
  return role === 'owner' || role === 'admin' ? role : 'member'
}

export async function reconcilePeople(run: JobRun, people: HubPeople): Promise<{ rows: number; note?: string }> {
  const { service } = run
  const { data: tenant, error: tenantError } = await service.from('tenants').select('id').limit(1).maybeSingle()
  if (tenantError || !tenant) throw new Error('no tenants row')
  const { data: existing, error: readError } = await service.from('memberships').select('id, hub_member_id, name, hub_role, role, status, teams')
  if (readError) throw new Error(readError.message)
  const teamsOf = new Map<string, string[]>()
  for (const team of people.teams) for (const member of team.members) teamsOf.set(member, [...(teamsOf.get(member) ?? []), team.name].sort())
  const byHubId = new Map((existing ?? []).map((m) => [m.hub_member_id, m]))
  const seen = new Set<string>()
  let rows = 0
  for (const person of people.people) {
    seen.add(person.id)
    const hubRole = hubRoleOf(person.role)
    const teams = teamsOf.get(person.id) ?? []
    const current = byHubId.get(person.id)
    if (!current) {
      const { error } = await service.from('memberships').insert({ tenant_id: tenant.id, hub_member_id: person.id, name: person.display_name, hub_role: hubRole, role: hubRole, status: 'active', teams })
      if (error) throw new Error(error.message)
      rows++
      continue
    }
    const patch: { name?: string; hub_role?: HubRole; role?: AppRole; status?: 'active'; teams?: string[] } = {}
    if (current.name !== person.display_name) patch.name = person.display_name
    if (current.hub_role !== hubRole) patch.hub_role = hubRole
    if (RANK[hubRole] > RANK[current.hub_role as HubRole]) patch.role = hubRole
    if (current.status !== 'active') patch.status = 'active'
    if (JSON.stringify(current.teams ?? []) !== JSON.stringify(teams)) patch.teams = teams
    if (Object.keys(patch).length === 0) continue
    const { error } = await service.from('memberships').update(patch).eq('id', current.id)
    if (error) throw new Error(error.message)
    rows++
  }
  for (const m of existing ?? []) {
    if (seen.has(m.hub_member_id) || m.status === 'inactive') continue
    const { error } = await service.from('memberships').update({ status: 'inactive' }).eq('id', m.id)
    if (error) throw new Error(error.message)
    rows++
  }
  return { rows }
}

export const peopleSyncJob: JobDef = {
  name: 'people-sync',
  schedule: '15 3 * * *',
  description: 'Reconciles members, names, hub roles and teams from the hub; members the hub dropped become inactive.',
  async run(run) {
    const result = await lcc.people()
    if (!result.ok) {
      run.log(`people sync skipped: ${result.reason}`)
      return { rows: 0, note: result.reason }
    }
    return reconcilePeople(run, result.value)
  },
}
