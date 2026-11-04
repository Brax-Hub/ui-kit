// The server entry TanStack Start builds: the default fetch handler, plus the jobs, registered once per process.
// Importing tinbase.server boots the backend (migrations and seed) before the first request.
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { registerAppJobs } from './jobs/register'

await registerAppJobs()

export default createServerEntry({ fetch: handler.fetch })
