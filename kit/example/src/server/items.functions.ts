// Items: every query runs as the member through memberClient(context), so RLS decides; the middleware decides who
// may call at all (any member reads, writers add, admins or the owner of the row delete).
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { memberClient } from './db/client.server'
import { ADMINS, EVERYONE, requireRole, WRITERS } from './middleware/rbs'

export const listItemsFn = createServerFn({ method: 'GET' })
  .middleware([requireRole(EVERYONE)])
  // input: none
  .handler(async ({ context }) => {
    const client = await memberClient(context)
    const { data, error } = await client.from('items_with_owner').select('id, title, notes, visibility, owner_id, owner_name, created_at').order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return { items: data ?? [], canWrite: WRITERS.includes(context.role), canAdmin: ADMINS.includes(context.role), memberId: context.memberId }
  })

export const addItemFn = createServerFn({ method: 'POST' })
  .middleware([requireRole(WRITERS)])
  .validator(z.object({ title: z.string().trim().min(1).max(200), notes: z.string().max(2000).default(''), visibility: z.enum(['team', 'private']).default('team') }))
  .handler(async ({ data, context }) => {
    const client = await memberClient(context)
    const { data: row, error } = await client.from('items').insert({ tenant_id: context.tenantId, owner_id: context.memberId, ...data }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: row.id }
  })

export const deleteItemFn = createServerFn({ method: 'POST' })
  .middleware([requireRole(WRITERS)])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const client = await memberClient(context)
    const { error, count } = await client.from('items').delete({ count: 'exact' }).eq('id', data.id)
    if (error) throw new Error(error.message)
    return { deleted: count ?? 0 }
  })
