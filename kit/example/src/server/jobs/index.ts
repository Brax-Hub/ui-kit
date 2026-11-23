// Scheduled jobs (brax-data step 7): tinbase's cron (the pg_cron API, schedules matched in UTC) is the scheduler and
// this module is the executor. registerJobs() writes each job into `jobs`, schedules `select app.enqueue_job(name)`
// in cron.job, and polls `job_runs` for queued runs, which it executes under serviceClient('job:<name>') and finishes
// with the rows touched or the error. runNow(name) queues and runs one straight away (the Settings button). Each job
// is idempotent: the hub restarts containers freely and a run may be repeated.
import type { TinbaseBackend } from 'tinbase'
import { serviceClient, type ServiceClient } from '../db/client.server'
import { getEnv } from '../env.server'

export interface JobRun {
  /** The service client for this run; every write the job makes goes through it. */
  service: ServiceClient
  name: string
  trigger: 'cron' | 'manual'
  log: (message: string) => void
}

export interface JobDef {
  name: string
  /** A 5-field cron expression in UTC, or pg_cron's 'N seconds'. */
  schedule: string
  description: string
  run: (run: JobRun) => Promise<{ rows: number; note?: string }>
}

export interface JobRunResult {
  ok: boolean
  rows: number
  note?: string
  error?: string
  runId: string
}

interface Runner {
  defs: Map<string, JobDef>
  timer: ReturnType<typeof setInterval> | null
  busy: boolean
}

const KEY = Symbol.for('brax.jobs.runner')
const held = globalThis as unknown as Record<symbol, Runner | undefined>
const POLL_MS = 5_000

function runner(): Runner {
  return (held[KEY] ??= { defs: new Map(), timer: null, busy: false })
}

function stamp() {
  return new Date().toISOString()
}

/** Register the app's jobs: rows in `jobs`, schedules in cron.job, the poller (unless JOBS=off). Safe to call again. */
export async function registerJobs(backend: TinbaseBackend, defs: JobDef[]): Promise<void> {
  const r = runner()
  r.defs = new Map(defs.map((d) => [d.name, d]))
  const service = serviceClient('jobs:register')
  for (const d of defs) {
    const { error } = await service.from('jobs').upsert({ name: d.name, schedule: d.schedule, description: d.description }, { onConflict: 'name' })
    if (error) throw new Error(`jobs upsert failed for ${d.name}: ${error.message}`)
    // cron.schedule(name, schedule, command) replaces a job of the same name, as pg_cron does.
    await backend.db.query(`select cron.schedule($1, $2, $3)`, [d.name, d.schedule, `select app.enqueue_job('${d.name.replace(/'/g, "''")}')`])
  }
  if (getEnv().jobs === 'off') return
  if (!r.timer) {
    r.timer = setInterval(() => void tick(), POLL_MS)
    r.timer.unref?.()
  }
}

/** Stop polling (the suites, a graceful close). */
export function stopJobs() {
  const r = runner()
  if (r.timer) clearInterval(r.timer)
  r.timer = null
}

async function execute(runId: string, name: string, trigger: 'cron' | 'manual'): Promise<JobRunResult> {
  const def = runner().defs.get(name)
  const service = serviceClient(`job:${name}`)
  await service.from('job_runs').update({ status: 'running', started_at: stamp() }).eq('id', runId)
  if (!def) {
    await service.from('job_runs').update({ status: 'error', finished_at: stamp(), error: 'no such job in this process' }).eq('id', runId)
    return { ok: false, rows: 0, error: 'no such job in this process', runId }
  }
  try {
    const result = await def.run({ service, name, trigger, log: (message) => console.log(JSON.stringify({ at: stamp(), job: name, message })) })
    await service.from('job_runs').update({ status: 'ok', finished_at: stamp(), rows: result.rows, error: result.note ?? null }).eq('id', runId)
    await service.from('jobs').update({ last_run_at: stamp() }).eq('name', name)
    return { ok: true, rows: result.rows, note: result.note, runId }
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000)
    console.error(JSON.stringify({ at: stamp(), job: name, error: message }))
    await service.from('job_runs').update({ status: 'error', finished_at: stamp(), error: message }).eq('id', runId)
    return { ok: false, rows: 0, error: message, runId }
  }
}

/** One poll: every queued run, oldest first, one at a time (tinbase has one writer). */
export async function tick(): Promise<number> {
  const r = runner()
  if (r.busy) return 0
  r.busy = true
  let ran = 0
  try {
    const service = serviceClient('jobs:tick')
    const { data, error } = await service.from('job_runs').select('id, job, trigger').eq('status', 'queued').order('created_at', { ascending: true }).limit(20)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      await execute(row.id, row.job, row.trigger as 'cron' | 'manual')
      ran++
    }
  } catch (error) {
    console.error(JSON.stringify({ at: stamp(), jobs: 'tick_failed', error: error instanceof Error ? error.message : String(error) }))
  } finally {
    r.busy = false
  }
  return ran
}

/** Queue and run one job now; returns when it finished. */
export async function runNow(name: string): Promise<JobRunResult> {
  if (!runner().defs.has(name)) throw new Error(`unknown job ${name}`)
  const service = serviceClient('jobs:run-now')
  const { data, error } = await service.from('job_runs').insert({ job: name, status: 'queued', trigger: 'manual' }).select('id').single()
  if (error || !data) throw new Error(`job_runs insert failed: ${error?.message}`)
  return execute(data.id, name, 'manual')
}

/** The registered definitions, for a Settings page. */
export function jobDefinitions(): JobDef[] {
  return [...runner().defs.values()]
}
