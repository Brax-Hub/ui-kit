// The hub signs people in; this file is the only reader of the three member headers and the only caller of
// tinbase's signJwt (brax-security-rbs step 2, scanner rules 1 and 2).
//
// The edge validates the member session and injects X-Brax-Member-Id (the membership id), X-Brax-Member-Name
// (percent-encoded) and X-Brax-Member-Role (owner | admin | member) after blanking anything the client sent in those
// names (HUB-SHELL.md section 3.2; lcc app/member_auth.py GET /internal/hub/member). The app trusts them only because
// the container is reachable solely from the edge on an internal network; locally the stub edge (kit/dev/dev-member.ts)
// strips and re-sets them for a seeded member.
//
// What this module does: read the headers (or refuse), upsert the member into memberships, and mint the 5-minute
// token tinbase expects for that member. Nothing here reads a cookie.
import { signJwt } from 'tinbase'
import { backend } from '../tinbase.server'
import { serviceClient } from '../db/client.server'

export type HubRole = 'owner' | 'admin' | 'member'
export type AppRole = HubRole | 'viewer'
export type MemberStatus = 'active' | 'inactive'

export interface HubMember {
  hubMemberId: string // the hub's membership id, stored as text
  name: string
  hubRole: HubRole
}

export interface MemberContext {
  memberId: string // memberships.id (uuid): what auth.uid() returns inside tinbase
  hubMemberId: string
  name: string
  hubRole: HubRole
  role: AppRole // from memberships, which an owner may lower inside the app (viewer)
  status: MemberStatus
  tenantId: string
}

const HEADER_ID = 'x-brax-member-id'
const HEADER_NAME = 'x-brax-member-name'
const HEADER_ROLE = 'x-brax-member-role'
const HUB_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'member'])
const RANK: Record<HubRole, number> = { member: 1, admin: 2, owner: 3 }
/** The member token's lifetime: one request, with room for a slow one. */
export const MEMBER_TOKEN_SECONDS = 5 * 60
const COLUMNS = 'id, tenant_id, hub_member_id, name, hub_role, role, status'

export class NotSignedIn extends Error {
  status = 401
  constructor() {
    super('hub_member_required')
  }
}

/** The acting member as the edge (or the dev stub) named them. Throws NotSignedIn when the headers are absent or malformed. */
export function readHubMember(request: Request): HubMember {
  const id = request.headers.get(HEADER_ID)?.trim()
  const rawName = request.headers.get(HEADER_NAME)?.trim() ?? ''
  const role = request.headers.get(HEADER_ROLE)?.trim().toLowerCase()
  if (!id || !role || !HUB_ROLES.has(role)) throw new NotSignedIn()
  let name = rawName
  try {
    name = decodeURIComponent(rawName) // LCC percent-encodes the display name (a header value is Latin-1)
  } catch {
    name = rawName
  }
  return { hubMemberId: id, name, hubRole: role as HubRole }
}

interface MembershipRow {
  id: string
  tenant_id: string
  hub_member_id: string
  name: string
  hub_role: HubRole
  role: AppRole
  status: MemberStatus
}

function toContext(row: MembershipRow): MemberContext {
  return { memberId: row.id, hubMemberId: row.hub_member_id, name: row.name, hubRole: row.hub_role, role: row.role, status: row.status, tenantId: row.tenant_id }
}

/**
 * Resolve the hub member to the app's own membership row, through the service client (the row is the member's own
 * identity, so no member token exists yet). First sight inserts the row with the hub role; afterwards the name and
 * last_seen_at are refreshed, and the hub role is written again only when it rises, so a role the owner lowered
 * inside the app (viewer) is kept until the hub says otherwise.
 */
export async function resolveMember(member: HubMember): Promise<MemberContext> {
  const service = serviceClient('identity:resolve-member')
  const now = new Date().toISOString()
  const { data: existing, error: readError } = await service.from('memberships').select(COLUMNS).eq('hub_member_id', member.hubMemberId).maybeSingle()
  if (readError) throw new Error(`memberships read failed: ${readError.message}`)
  if (!existing) {
    const { data: tenant, error: tenantError } = await service.from('tenants').select('id').limit(1).maybeSingle()
    if (tenantError || !tenant) throw new Error('no tenants row: a migration must create the hub tenant (APP_ENV=hub skips seed.sql)')
    const { data: inserted, error: insertError } = await service
      .from('memberships')
      .insert({ tenant_id: tenant.id, hub_member_id: member.hubMemberId, name: member.name, hub_role: member.hubRole, role: member.hubRole, status: 'active', last_seen_at: now })
      .select(COLUMNS)
      .single()
    if (insertError || !inserted) throw new Error(`memberships insert failed: ${insertError?.message}`)
    return toContext(inserted as MembershipRow)
  }
  const current = existing as MembershipRow
  const rose = RANK[member.hubRole] > RANK[current.hub_role]
  const patch: Partial<MembershipRow> & { last_seen_at: string } = { name: member.name, last_seen_at: now }
  if (member.hubRole !== current.hub_role) patch.hub_role = member.hubRole
  if (rose) patch.role = member.hubRole
  const { data: updated, error: updateError } = await service.from('memberships').update(patch).eq('id', current.id).select(COLUMNS).single()
  if (updateError || !updated) throw new Error(`memberships update failed: ${updateError?.message}`)
  return toContext(updated as MembershipRow)
}

/** The membership behind a hub member id (a tool call names the acting person that way), or null. Never creates one. */
export async function findMemberByHubId(hubMemberId: string): Promise<MemberContext | null> {
  const service = serviceClient('identity:find-member')
  const { data, error } = await service.from('memberships').select(COLUMNS).eq('hub_member_id', hubMemberId).maybeSingle()
  if (error) throw new Error(`memberships read failed: ${error.message}`)
  return data ? toContext(data as MembershipRow) : null
}

/**
 * The token tinbase expects for the acting member: HS256 under backend.jwtSecret, five minutes, `sub` the membership
 * id so auth.uid() is the member, role and aud `authenticated`, plus hub_role and hub_member_id for policies that
 * want them. Minted per request and never sent to the browser. The only signJwt call in the app.
 */
export function memberToken(ctx: Pick<MemberContext, 'memberId' | 'hubRole' | 'hubMemberId'>): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: ctx.memberId,
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'brax-hub-module',
      iat: now,
      exp: now + MEMBER_TOKEN_SECONDS,
      hub_role: ctx.hubRole,
      hub_member_id: ctx.hubMemberId,
    },
    backend.jwtSecret,
  )
}
