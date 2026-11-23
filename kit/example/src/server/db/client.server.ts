// The two ways into tinbase (brax-data step 2). Nothing else in the app calls createClient.
//
// memberClient(ctx): supabase-js over backend.fetch (no HTTP, no port) with the member's 5-minute token as the bearer,
// so PostgREST runs every statement as `authenticated` with auth.uid() = the membership id and RLS decides.
// serviceClient(reason): the service role key, which bypasses RLS; the reason is logged with every client made, and
// the scanner accepts the call only with a string literal reason (identity upsert, jobs, people sync, imports).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { memberToken, type MemberContext } from '../hub/identity.server'
import { anonKey, backend, serviceRoleKey } from '../tinbase.server'

/** tinbase answers in-process, so the URL is a name, not an address. */
export const TINBASE_URL = 'http://tinbase.local'

export type MemberClient = SupabaseClient<Database>
export type ServiceClient = SupabaseClient<Database>

const inProcess = (input: RequestInfo | URL, init?: RequestInit) => backend.fetch(new Request(input, init))
const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }

/** A client acting as the member: the bearer is minted here, once per client, for this request. */
export async function memberClient(ctx: Pick<MemberContext, 'memberId' | 'hubRole' | 'hubMemberId'>): Promise<MemberClient> {
  const token = await memberToken(ctx)
  return createClient<Database>(TINBASE_URL, anonKey, {
    global: { fetch: inProcess, headers: { Authorization: `Bearer ${token}` } },
    auth: noSession,
  })
}

/** A client with the service role (no RLS). `reason` names the call site in the log: 'job:<name>', 'identity:resolve-member', 'sync:people'. */
export function serviceClient(reason: string): ServiceClient {
  if (!reason) throw new Error('serviceClient needs a reason')
  console.log(JSON.stringify({ at: new Date().toISOString(), service_client: reason }))
  return createClient<Database>(TINBASE_URL, serviceRoleKey, {
    global: { fetch: inProcess, headers: { Authorization: `Bearer ${serviceRoleKey}` } },
    auth: noSession,
  })
}

/** A client with no bearer at all: what the RLS test uses to prove `anon` reads nothing. */
export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(TINBASE_URL, anonKey, { global: { fetch: inProcess }, auth: noSession })
}
