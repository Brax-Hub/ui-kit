// The example's jobs: a heartbeat that proves the scheduler (it counts items and writes its job_runs row) and the
// kit's people sync, which reconciles memberships from the hub (a no-op without one).
import { peopleSyncJob } from '../hub/people-sync'
import { registerJobs, type JobDef } from '../jobs'
import { backend } from '../tinbase.server'

export const heartbeatJob: JobDef = {
  name: 'heartbeat',
  schedule: '*/5 * * * *',
  description: 'Counts the items in the workspace; a run every five minutes shows the scheduler is alive.',
  async run({ service, log }) {
    const { count, error } = await service.from('items').select('id', { count: 'exact', head: true })
    if (error) throw new Error(error.message)
    log(`${count ?? 0} items`)
    return { rows: count ?? 0 }
  },
}

export const JOBS: JobDef[] = [heartbeatJob, peopleSyncJob]

export function registerAppJobs() {
  return registerJobs(backend, JOBS)
}
