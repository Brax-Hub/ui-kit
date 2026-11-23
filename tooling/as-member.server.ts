// Reference implementation for the two session helpers in src/server/db/client.server.ts (brax-data step 1).
// Every query in the app runs inside one of them; the security scan refuses any other use of `db`.
//
// asMember sets the three settings the app.* helpers read (app.member_id, app.role, app.tenant_id) for the duration
// of one transaction, so Postgres row-level security sees the verified member. asService runs jobs, imports and
// webhooks with app.role = 'service' and logs why.
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import * as schema from './schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

// DATABASE_URL set: the hub's Postgres (or a local postgres:17). Unset: PGlite on disk, see brax-data step 1 for the
// PGlite driver variant (drizzle-orm/pglite); keep both behind this one export.
const client = postgres(process.env.DATABASE_URL!, { max: 8, prepare: false })
export const db: Db = drizzle(client, { schema })

export interface MemberSettings {
  memberId: string
  role: string
  tenantId: string
}

export async function asMember<T>(ctx: MemberSettings, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select set_config('app.member_id', ${ctx.memberId}, true),
             set_config('app.role', ${ctx.role}, true),
             set_config('app.tenant_id', ${ctx.tenantId}, true)`)
    return fn(tx)
  })
}

export async function asService<T>(reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!reason) throw new Error('asService needs a reason (logged with every call)')
  console.info(JSON.stringify({ at: new Date().toISOString(), service_call: reason }))
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.member_id', '', true), set_config('app.role', 'service', true)`)
    return fn(tx)
  })
}
