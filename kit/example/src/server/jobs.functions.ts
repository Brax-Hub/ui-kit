// Scheduled jobs for the Settings page: what runs, when it last ran, and "Run now" for admins.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { memberClient } from './db/client.server'
import { lcc } from './hub/lcc.server'
import { jobDefinitions, runNow } from './jobs'
import { ADMINS, requireRole } from './middleware/rbs'

export const getJobsFn = createServerFn({ method: 'GET' })
  .middleware([requireRole(ADMINS)])
  // input: none
  .handler(async ({ context }) => {
    const client = await memberClient(context)
    const [{ data: jobs, error: jobsError }, { data: runs, error: runsError }] = await Promise.all([
      client.from('jobs').select('name, schedule, description, enabled, last_run_at').order('name'),
      client.from('job_runs').select('id, job, status, trigger, started_at, finished_at, rows, error, created_at').order('created_at', { ascending: false }).limit(20),
    ])
    if (jobsError) throw new Error(jobsError.message)
    if (runsError) throw new Error(runsError.message)
    const hub = await lcc.me()
    return { jobs: jobs ?? [], runs: runs ?? [], registered: jobDefinitions().map((d) => d.name), hub: hub.ok ? { connected: true as const, scopes: hub.value.scopes } : { connected: false as const, reason: hub.reason } }
  })

export const runJobNowFn = createServerFn({ method: 'POST' })
  .middleware([requireRole(ADMINS)])
  .validator(z.object({ name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/) }))
  .handler(async ({ data }) => {
    if (!jobDefinitions().some((d) => d.name === data.name)) return { ok: false as const, error: 'That job is not registered in this process.' }
    const result = await runNow(data.name)
    return result.ok ? { ok: true as const, rows: result.rows, note: result.note } : { ok: false as const, error: result.error ?? 'The job failed.' }
  })
