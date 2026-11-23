// Reference implementation for src/server/hub/identity.server.ts in a Brax Business App (brax-hub-module step 2).
//
// The hub's edge validates the member session and injects three headers; the app trusts them only because the
// container is reachable solely from the edge on an internal network. Locally the stub edge (dev-member.ts) sets the
// same headers for a seeded member, so no login exists anywhere in the app.
//
// What this module does: read the headers (or refuse), upsert the member into memberships on first sight, and return
// the verified context that requireRole() and asMember() consume. Nothing here reads a cookie or a token.
import { getWebRequest } from '@tanstack/react-start/server'

export type HubRole = 'owner' | 'admin' | 'member'
export type AppRole = HubRole | 'viewer'

export interface HubMember {
  hubMemberId: string // the hub's id, stored as text
  name: string
  hubRole: HubRole
}

export interface MemberContext {
  memberId: string // memberships.id (uuid), what app.member_id() returns
  hubMemberId: string
  name: string
  role: AppRole // from memberships, which the owner may lower inside the app (viewer)
  tenantId: string
}

const HEADER_ID = 'x-brax-member-id'
const HEADER_NAME = 'x-brax-member-name'
const HEADER_ROLE = 'x-brax-member-role'
const HUB_ROLES: ReadonlySet<string> = new Set(['owner', 'admin', 'member'])

export class NotSignedIn extends Error {
  constructor() {
    super('hub_member_required')
  }
}

/** The acting member as the edge (or the dev stub) named them. Throws when the headers are absent or malformed. */
export function readHubMember(request: Request = getWebRequest()): HubMember {
  const id = request.headers.get(HEADER_ID)?.trim()
  const name = request.headers.get(HEADER_NAME)?.trim() ?? ''
  const role = request.headers.get(HEADER_ROLE)?.trim().toLowerCase()
  if (!id || !role || !HUB_ROLES.has(role)) throw new NotSignedIn()
  return { hubMemberId: id, name, hubRole: role as HubRole }
}

/**
 * Resolve the member to the app's own membership row. `store` is the app's data access (an asService call that
 * upserts memberships(hub_member_id, name, role) and returns { id, role, tenantId }); it is injected so this file
 * stays free of database imports and testable. The hub role is written on first sight and whenever it rises; a
 * role the owner lowered inside the app (viewer) is kept until the hub says otherwise.
 */
export async function resolveMember(
  member: HubMember,
  store: {
    upsertFromHub(member: HubMember): Promise<{ id: string; role: AppRole; tenantId: string }>
  },
): Promise<MemberContext> {
  const row = await store.upsertFromHub(member)
  return {
    memberId: row.id,
    hubMemberId: member.hubMemberId,
    name: member.name,
    role: row.role,
    tenantId: row.tenantId,
  }
}
