// The first barrier (brax-security-rbs step 2): TanStack Start middleware in front of every server function.
// requireMember() admits any active member; requireRole(allowed) compares against the memberships row, never the
// header alone. The member is resolved once per request (the Request object is the cache key) and the verified
// context {memberId, hubMemberId, name, role, tenantId} is what handlers pass to memberClient(ctx).
//
// This file is deliberately not *.server.ts: the middleware shell must exist in the client bundle so the
// server-function chain can be built there. The Start compiler strips every `.server()` callback (and with it the
// identity.server import, which nothing else here uses) from the client build; the import-protection plugin refuses
// a *.server.* file that survives into the client, which a rbs.server.ts did.
//
// A refusal sets the HTTP status (401 without a member or inactive, 403 for the role) and throws an AccessError: a
// thrown Response is right for an RPC call but cannot be serialised into a page's dehydrated state when a loader
// calls the function during server rendering, which turned every refused page into a 500.
import { createMiddleware } from '@tanstack/react-start'
import { getRequest, setResponseStatus } from '@tanstack/react-start/server'
import { NotSignedIn, readHubMember, resolveMember, type AppRole, type MemberContext } from '../hub/identity.server'

export type { AppRole, MemberContext }
export const WRITERS: AppRole[] = ['owner', 'admin', 'member']
export const ADMINS: AppRole[] = ['owner', 'admin']
export const EVERYONE: AppRole[] = ['owner', 'admin', 'member', 'viewer']

export class AccessError extends Error {
  status: 401 | 403
  code: 'hub_member_required' | 'member_inactive' | 'role_required'
  constructor(status: 401 | 403, code: AccessError['code']) {
    super(code)
    this.name = 'AccessError'
    this.status = status
    this.code = code
  }
}

const perRequest = new WeakMap<Request, Promise<MemberContext>>()

export const requireRole = (allowed: AppRole[]) =>
  createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const refuse = (status: 401 | 403, code: AccessError['code']): never => {
      try {
        setResponseStatus(status)
      } catch {
        // outside a request (a job, a test): the error alone carries the status
      }
      throw new AccessError(status, code)
    }
    const request = getRequest()
    let pending = perRequest.get(request)
    if (!pending) {
      pending = (async () => {
        try {
          return await resolveMember(readHubMember(request))
        } catch (error) {
          if (error instanceof NotSignedIn) refuse(401, 'hub_member_required')
          throw error
        }
      })()
      perRequest.set(request, pending)
    }
    const member = await pending
    if (member.status !== 'active') refuse(401, 'member_inactive')
    if (!allowed.includes(member.role)) refuse(403, 'role_required')
    return next({ context: { memberId: member.memberId, hubMemberId: member.hubMemberId, name: member.name, hubRole: member.hubRole, role: member.role, tenantId: member.tenantId } })
  })

export const requireMember = () => requireRole(EVERYONE)
