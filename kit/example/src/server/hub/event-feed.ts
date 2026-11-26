// The module's client for the hub's event feed (TASKS APM10; ADR-046 D1; contracts plans/HUB-DATA-FOR-APPS.md §3.1;
// the hub server's app/module_events.py). A module owns its data, so it learns of a change in the hub here: it asks
// and waits, the hub answers when something happens or the wait ends. The hub never calls a module.
//
//   GET /services/module/events?after=<cursor>&kinds=<a,b>&wait=<seconds>&limit=<n>   ->   { items, cursor }
//
// What the client does, once started:
//   1. With no cursor kept: asks without `after` (where the feed stands now), calls `readAll` so the module reads the
//      state it cares about through its routes, then keeps that cursor. Events between the two are delivered next.
//   2. Loops: asks with `after=<cursor>&wait=25` and a timeout above the wait, runs the handler of each event in the
//      order given, then writes the answer's cursor to the module's own data (also when the answer is empty and the
//      cursor moved). One request at a time: a module instance never has more than one waiting.
//   3. 410 (`cursor_too_old`, `cursor_ahead`) and 422 `invalid_cursor`: the cursor is of no use; back to 1.
//      429 `too_many_waiting`, 5xx, any other refusal, no answer in time, a dropped connection: the same cursor again
//      after a pause that doubles (1 s to 60 s) with jitter.
//      403 `scope_required` or `module_not_active`: stops following and says why; `start()` asks again.
//   4. `stop()` ends the open request at once, lets a running handler finish, keeps the cursor of what was handled.
//
// Delivery is at least once. The cursor is written after the handlers ran, so a module that stops between the two
// gets those events again when it starts: A HANDLER MAY RUN TWICE FOR THE SAME EVENT and must give the same result
// the second time (write by the event's ids, never "add one"). A handler that throws is tried again after a pause,
// from the last event that was handled; after `attempts` failures of one event the client stops trying it, says so,
// and reads everything again as after a 410.
//
// An event holds ids only (`data.event`, `person`): the handler fetches the record through the route the module
// already uses. A kind with no handler is not asked for (`kinds=`); the cursor still passes it.
//
// This file imports nothing of the app (no environment, no database) and only erasable TypeScript, so
// tooling/event-feed.test.mjs loads it with plain `node --test`. hub/events.server.ts binds it to the module
// credential and the database.
import { Agent as HttpAgent, request as httpRequest } from 'node:http'
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https'

export const EVENTS_PATH = '/services/module/events'

export interface HubEvent {
  /** The cursor of this event; ids rise per module. */
  id: string
  kind: string
  /** When it happened, ISO 8601. */
  at: string
  /** The hub membership the event is about, when there is one. */
  person: string | null
  /** Ids, never a record's contents: `event` (and `uid`) for the calendar kinds. */
  data: Record<string, string>
}

export interface FeedQuery {
  after?: string
  kinds?: string[]
  wait?: number
  limit?: number
}

export interface HubAnswer {
  status: number
  body: unknown
}

/** One request to the feed. Rejects when there is no answer: no connection, a dropped one, or `signal` aborted. */
export type AskHub = (query: FeedQuery, signal: AbortSignal) => Promise<HubAnswer>

/** Where the cursor is kept between two runs of the module: the module's own data. */
export interface CursorStore {
  read(): Promise<string | null>
  write(cursor: string): Promise<void>
}

export type EventHandler = (event: HubEvent) => Promise<void> | void

/** Why the module is asked to read its state again: a first start, a cursor the hub refused, an event given up on. */
export type ReadAllReason = 'start' | 'cursor_too_old' | 'cursor_ahead' | 'invalid_cursor' | 'handler_failed'

export interface EventFeedOptions {
  ask: AskHub
  cursor: CursorStore
  /** One handler a kind. A function is read again before every request, so the set may change while following. */
  handlers: Record<string, EventHandler> | (() => Record<string, EventHandler>)
  /** Read the state the module cares about through its routes: nothing before this moment will come as an event. */
  readAll: (reason: ReadAllReason) => Promise<void> | void
  /** Seconds the hub may hold a request; the hub's own limit is 25. */
  waitSeconds?: number
  /** How long the client waits for an answer; above the wait (10 s more by default). */
  timeoutMs?: number
  /** At most this many events an answer; by default as many as the hub gives at once (100). */
  limit?: number
  /** The pause after a refusal or a failure: `firstMs` (1000), doubled each time up to `maxMs` (60000), with jitter. */
  pause?: { firstMs?: number; maxMs?: number }
  /** Failures of one event's handler before the client gives up on it and reads everything again (5). */
  attempts?: number
  log?: (message: string, fields?: Record<string, unknown>) => void
}

export interface FeedStatus {
  /** idle: never started. refused: the hub said this module may not follow (see `refused`). */
  state: 'idle' | 'following' | 'pausing' | 'stopped' | 'refused'
  cursor: string | null
  /** Answers with status 200 since the start, and events whose handler ran. */
  answers: number
  handled: number
  /** What the last pause was for; null once an answer was handled in full. */
  trouble: string | null
  /** `scope_required` or `module_not_active`, when the hub refused. */
  refused: string | null
}

export interface EventFeed {
  /** Start following; a second call while following does nothing. */
  start(): void
  /** End the open request, let a running handler finish, keep the cursor; resolves when nothing is left running. */
  stop(): Promise<void>
  status(): FeedStatus
}

/** FastAPI answers `{"detail": "cursor_too_old"}`; the hub's other shape is `{"error": {"code": ...}}`. */
export function refusalCode(body: unknown): string {
  if (!body || typeof body !== 'object') return 'unknown'
  const o = body as { detail?: unknown; error?: unknown }
  if (typeof o.detail === 'string') return o.detail
  if (o.error && typeof o.error === 'object' && typeof (o.error as { code?: unknown }).code === 'string') return (o.error as { code: string }).code
  if (typeof o.error === 'string') return o.error
  return 'unknown'
}

function readAnswer(body: unknown): { items: HubEvent[]; cursor: string } | null {
  if (!body || typeof body !== 'object') return null
  const { items, cursor } = body as { items?: unknown; cursor?: unknown }
  if (typeof cursor !== 'string' || !cursor || !Array.isArray(items)) return null
  for (const item of items) {
    if (!item || typeof item !== 'object') return null
    const event = item as Partial<HubEvent>
    if (typeof event.id !== 'string' || !event.id || typeof event.kind !== 'string') return null
  }
  return { items: items as HubEvent[], cursor }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300)

/** Resolves after `ms`, or at once when `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

export function createEventFeed(options: EventFeedOptions): EventFeed {
  const wait = options.waitSeconds ?? 25
  const timeoutMs = options.timeoutMs ?? (wait + 10) * 1000
  const firstMs = options.pause?.firstMs ?? 1000
  const maxMs = options.pause?.maxMs ?? 60_000
  const attempts = options.attempts ?? 5
  const log = options.log ?? ((text, fields) => console.log(JSON.stringify({ at: new Date().toISOString(), hub_events: text, ...fields })))
  const handlers = () => (typeof options.handlers === 'function' ? options.handlers() : options.handlers)
  const status: FeedStatus = { state: 'idle', cursor: null, answers: 0, handled: 0, trouble: null, refused: null }
  let stopping: AbortController | null = null
  let running: Promise<void> | null = null
  const refused = () => status.state === 'refused'

  /** One request, ended by `stop()` or when no answer came in time. */
  async function ask(query: FeedQuery, stop: AbortSignal): Promise<HubAnswer> {
    const own = new AbortController()
    const end = () => own.abort()
    const timer = setTimeout(end, timeoutMs)
    stop.addEventListener('abort', end, { once: true })
    try {
      return await options.ask(query, own.signal)
    } catch (error) {
      if (own.signal.aborted && !stop.aborted) throw new Error(`no answer within ${timeoutMs} ms`)
      throw error
    } finally {
      clearTimeout(timer)
      stop.removeEventListener('abort', end)
    }
  }

  async function follow(stop: AbortSignal): Promise<void> {
    let cursor: string | null | undefined // undefined: not read from the module's data yet; null: none, start over
    let why: ReadAllReason = 'start'
    let settled = true // false from a start-over until an answer was handled: a second refusal in between pauses
    let failing = { id: '', count: 0 }

    /** One step. null: it went well; a text: what went wrong, and the next step waits. */
    async function step(): Promise<string | null> {
      if (cursor === undefined) {
        cursor = status.cursor = await options.cursor.read()
        return null
      }
      const table = handlers()
      const kinds = Object.keys(table).sort()
      const starting = cursor === null
      const answer = await ask(cursor === null ? { kinds } : { after: cursor, kinds, wait, limit: options.limit }, stop)
      if (answer.status !== 200) {
        const code = refusalCode(answer.body)
        if (answer.status === 410 || (answer.status === 422 && code === 'invalid_cursor')) {
          log('the hub refused the cursor; reading everything again', { status: answer.status, code, cursor })
          why = code === 'cursor_too_old' || code === 'cursor_ahead' ? code : 'invalid_cursor'
          cursor = null
          if (settled) return null
          return `${answer.status} ${code} for a cursor the hub had just given`
        }
        if (answer.status === 403 && (code === 'scope_required' || code === 'module_not_active')) {
          status.state = 'refused'
          status.refused = code
          return null
        }
        return `${answer.status} ${code}`
      }
      const read = readAnswer(answer.body)
      if (!read) return 'an answer that is not { items, cursor }'
      status.answers++
      if (starting) {
        settled = false
        await options.readAll(why)
        await options.cursor.write(read.cursor)
        cursor = status.cursor = read.cursor
        why = 'start'
        return null
      }
      let reached = cursor as string
      let done = 0
      let failed: { event: HubEvent; error: string } | null = null
      for (const event of read.items) {
        if (stop.aborted) break
        const handler = table[event.kind]
        if (handler) {
          try {
            await handler(event)
          } catch (error) {
            failed = { event, error: message(error) }
            break
          }
          status.handled++
        }
        reached = event.id
        done++
      }
      // The answer's cursor when every event was handled; otherwise the id of the last one that was (an event's id is
      // its cursor), so the next request starts at the first that was not.
      const next = done === read.items.length ? read.cursor : reached
      if (next !== cursor) {
        await options.cursor.write(next)
        cursor = status.cursor = next
      }
      if (!failed) {
        if (done === read.items.length) {
          settled = true
          failing = { id: '', count: 0 }
        }
        return null
      }
      failing = failing.id === failed.event.id ? { id: failing.id, count: failing.count + 1 } : { id: failed.event.id, count: 1 }
      if (failing.count >= attempts) {
        log('giving up on an event; reading everything again', { id: failed.event.id, kind: failed.event.kind, tries: failing.count, error: failed.error })
        failing = { id: '', count: 0 }
        why = 'handler_failed'
        cursor = null
      }
      return `the handler of ${failed.event.kind} failed on ${failed.event.id}: ${failed.error}`
    }

    let troubles = 0
    while (!stop.aborted && !refused()) {
      let trouble: string | null
      try {
        trouble = await step()
      } catch (error) {
        if (stop.aborted) break
        trouble = message(error)
      }
      if (refused()) {
        log('not following: the hub refused', { code: status.refused })
        break
      }
      if (trouble === null) {
        if (troubles && settled) {
          log('following again', { cursor, after_troubles: troubles })
          troubles = 0
          status.trouble = null
        }
        status.state = 'following'
        continue
      }
      const base = Math.min(maxMs, firstMs * 2 ** Math.min(troubles, 30))
      const pause = Math.round(base / 2 + (Math.random() * base) / 2)
      troubles++
      status.trouble = trouble
      status.state = 'pausing'
      log('pausing', { why: trouble, pause_ms: pause, tries: troubles, cursor: cursor ?? null })
      await sleep(pause, stop)
    }
  }

  return {
    start() {
      if (running) return
      const controller = (stopping = new AbortController())
      status.state = 'following'
      status.refused = null
      status.trouble = null
      running = follow(controller.signal)
        .catch((error) => log('the feed ended on an error', { error: message(error) }))
        .finally(() => {
          running = null
          if (!refused()) status.state = 'stopped'
        })
    },
    async stop() {
      stopping?.abort()
      await running
    },
    status: () => ({ ...status }),
  }
}

// The transport ---------------------------------------------------------------------------------------------------------

export interface HubAddress {
  /** The hub's module API, without the path: https://lcc-edge:8443. */
  url: string
  /** The module credential (module.key, module.crt with its chain, root.crt); absent for a stand-in hub over http. */
  tls?: { key: Buffer | string; cert: Buffer | string; ca: Buffer | string; servername?: string }
}

/** One request to a route of the hub's module API: the path with its query, the headers and a JSON body, as given. */
export interface HubCall {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** The route's path, each part already encoded: /services/module/people/<person>/calendars. */
  path: string
  /** Query parameters; one that is undefined is left out. */
  query?: Record<string, string | undefined>
  headers?: Record<string, string>
  /** Sent as JSON when given. */
  body?: unknown
}

/** One request to the hub. Rejects when there is no answer: no connection, a dropped one, or `signal` aborted. */
export type CallHub = (call: HubCall, signal: AbortSignal) => Promise<HubAnswer>

export interface HubTransport {
  ask: AskHub
  /** Any route of the module API over the same connections (hub/records.ts calls the person's records with it). */
  call: CallHub
  /** Close the connections kept between two requests. */
  close(): void
}

const MAX_ANSWER_BYTES = 8 * 1024 * 1024

/**
 * The hub's module API over HTTP, with the connections kept between requests. `connections` is how many requests may
 * be open at once: one by default, which is what the feed needs (a module instance cannot have two requests waiting).
 * A client that calls while the feed waits takes a transport of its own with more.
 */
export function hubTransport(address: HubAddress, options: { connections?: number } = {}): HubTransport {
  const base = address.url.replace(/\/+$/, '')
  const secure = base.startsWith('https:')
  const maxSockets = options.connections ?? 1
  const agent = secure ? new HttpsAgent({ ...address.tls, keepAlive: true, maxSockets }) : new HttpAgent({ keepAlive: true, maxSockets })
  const call: CallHub = ({ method, path, query, headers, body }, signal) =>
    new Promise((resolve, reject) => {
      const target = new URL(base + path)
      for (const [name, value] of Object.entries(query ?? {})) if (value !== undefined) target.searchParams.set(name, value)
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8')
      const sent = { accept: 'application/json', ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}), ...headers }
      const req = (secure ? httpsRequest : httpRequest)(target, { method, agent, signal, headers: sent }, (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_ANSWER_BYTES) return void req.destroy(new Error('the answer is too large'))
          chunks.push(chunk)
        })
        res.on('end', () => {
          let answer: unknown = null
          try {
            answer = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {
            answer = null
          }
          resolve({ status: res.statusCode ?? 0, body: answer })
        })
        res.on('error', reject)
        res.on('close', () => reject(new Error('the connection closed before the answer ended')))
      })
      req.on('error', reject)
      if (payload) req.write(payload)
      req.end()
    })
  const ask: AskHub = (query, signal) =>
    call(
      {
        method: 'GET',
        path: EVENTS_PATH,
        query: {
          after: query.after,
          kinds: query.kinds?.length ? query.kinds.join(',') : undefined,
          wait: query.wait ? String(query.wait) : undefined,
          limit: query.limit ? String(query.limit) : undefined,
        },
      },
      signal,
    )
  return { ask, call, close: () => agent.destroy() }
}
