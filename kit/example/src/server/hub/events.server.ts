// The hub's event feed, followed by this module (TASKS APM10): hub/event-feed.ts bound to the module credential and to
// the database. An app calls followHubEvents() once at start (src/server/events/register.ts, from the server entry)
// with one handler a kind and a `readAll`; the rest is the kit's.
//
//   followHubEvents({
//     handlers: { 'calendar_event.created': async (event, { service }) => { ... } },
//     readAll: async (reason, { service }) => { ... },
//   })
//
// - Where it asks: the hub's module API over mTLS with the module credential (LCC_URL, MODULE_CREDENTIAL_DIR), as
//   hub/lcc.server.ts does. Without a credential (local development, the suites) nothing is followed, unless
//   HUB_EVENTS_URL names a stand-in hub (`node tooling/hub-events-stub.mjs serve`, APP_ENV=local only).
// - Where the cursor is kept: the row `events` of the table `hub_cursors`, in the module's own database, written with
//   the service role after the handlers of an answer ran. It is in the database, not in a file beside it, so a
//   restored snapshot brings back the cursor that matches its data: the events since are delivered again, or the hub
//   answers 410 and `readAll` runs.
// - A handler may run twice for the same event (the module stopped between the handler and the cursor's write, or a
//   handler after it failed). Write by the event's ids so the second run changes nothing.
// - A handler gets the event and a run: `service`, the service client for this event (reason `hub-events:<kind>`), and
//   `log`. An event holds ids only; fetch the record through the route the module already uses.
// - One feed a process, and so one waiting request a module instance: a second call (Vite evaluating the module
//   again) swaps the handlers and starts nothing. SIGTERM and SIGINT end the open request at once.
import { serviceClient, type ServiceClient } from '../db/client.server'
import { getEnv } from '../env.server'
import { createEventFeed, hubTransport, type CursorStore, type EventFeed, type FeedStatus, type HubAddress, type HubEvent, type HubTransport, type ReadAllReason } from './event-feed'
import { moduleCredential } from './lcc.server'

export type { HubEvent, ReadAllReason } from './event-feed'

export interface EventRun {
  /** The service client for this event or this read; every write the handler makes goes through it. */
  service: ServiceClient
  log: (message: string) => void
}

export interface HubEventsDef {
  /** One handler a kind; only these kinds are asked for. Each must be safe to run twice for the same event. */
  handlers: Record<string, (event: HubEvent, run: EventRun) => Promise<void>>
  /** Read the state the module cares about through its routes. Called before the first event ever, after the hub
   *  refused the cursor (410: retention passed it, or the hub was restored), and after an event was given up on. */
  readAll: (reason: ReadAllReason, run: EventRun) => Promise<void>
}

interface Held {
  def: HubEventsDef | null
  feed: EventFeed | null
  transport: HubTransport | null
}

const KEY = Symbol.for('brax.hub.events')
const held = globalThis as unknown as Record<symbol, Held | undefined>
const holder = (): Held => (held[KEY] ??= { def: null, feed: null, transport: null })
const FEED = 'events'

function say(text: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), hub_events: text, ...fields }))
}

/** The hub with the module credential; locally, the stand-in HUB_EVENTS_URL names; null when there is neither. */
function hubAddress(): HubAddress | null {
  const env = getEnv()
  const credential = moduleCredential()
  if (credential) return { url: env.lccUrl, tls: { key: credential.key, cert: credential.cert, ca: credential.ca, servername: credential.servername } }
  if (env.appEnv === 'local' && env.hubEventsUrl) return { url: env.hubEventsUrl }
  return null
}

/** The cursor in the module's database: `hub_cursors`, one row a feed, written by the service role only. */
function databaseCursor(): CursorStore {
  let client: ServiceClient | undefined
  const service = () => (client ??= serviceClient('hub-events:cursor'))
  return {
    async read() {
      const { data, error } = await service().from('hub_cursors').select('cursor').eq('feed', FEED).maybeSingle()
      if (error) throw new Error(`hub_cursors read failed: ${error.message}`)
      return data?.cursor ?? null
    },
    async write(cursor) {
      const { error } = await service().from('hub_cursors').upsert({ feed: FEED, cursor, updated_at: new Date().toISOString() }, { onConflict: 'feed' })
      if (error) throw new Error(`hub_cursors write failed: ${error.message}`)
    },
  }
}

const run = (kind: string): EventRun => ({ service: serviceClient(`hub-events:${kind}`), log: (text) => say(text, { kind }) })

/** Follow the hub's events with the app's handlers. Returns at once; null when there is no hub to follow. */
export function followHubEvents(def: HubEventsDef): EventFeed | null {
  const h = holder()
  h.def = def
  if (h.feed) return h.feed
  const address = hubAddress()
  if (!address) {
    say('not following: no hub (no module credential, and no HUB_EVENTS_URL locally)')
    return null
  }
  h.transport = hubTransport(address)
  h.feed = createEventFeed({
    ask: h.transport.ask,
    cursor: databaseCursor(),
    handlers: () => Object.fromEntries(Object.entries(holder().def?.handlers ?? {}).map(([kind, handler]) => [kind, (event: HubEvent) => handler(event, run(kind))])),
    readAll: (reason) => holder().def?.readAll(reason, run('read-all')),
    log: say,
  })
  h.feed.start()
  say('following', { hub: address.url, kinds: Object.keys(def.handlers).sort() })
  const stop = () => void stopHubEvents()
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  return h.feed
}

/** End the open request and the connection (a graceful close, the suites). Resolves when no handler is running. */
export async function stopHubEvents(): Promise<void> {
  const h = holder()
  const { feed, transport } = h
  h.feed = h.transport = null
  await feed?.stop()
  transport?.close()
}

/** For a Settings page: whether the module follows the hub, how far it is, and what the last pause was for. */
export function hubEventsStatus(): FeedStatus | null {
  return holder().feed?.status() ?? null
}
