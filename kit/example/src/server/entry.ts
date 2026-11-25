// The server entry TanStack Start builds: the default fetch handler, plus the jobs and the hub's event feed, each
// started once per process. Importing tinbase.server boots the backend (migrations and seed) before the first request.
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { registerAppEvents } from './events/register'
import { registerAppJobs } from './jobs/register'

await registerAppJobs()
registerAppEvents() // returns at once: the feed is followed in the background, and only where there is a hub

export default createServerEntry({ fetch: handler.fetch })
