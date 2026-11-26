#!/usr/bin/env node
// A local stand-in for the hub's event feed for modules (the hub server's app/module_events.py, TASKS APM10), so a
// module's handlers and the kit's client are testable without a hub. It answers
// GET /services/module/events?after=&kinds=&wait=&limit= the way the hub does: `{ items, cursor }` with ids
// `evt_000000000042`; no `after` is "from now"; a request with `wait` is held until an event arrives or the wait ends;
// 410 `cursor_too_old` and `cursor_ahead`; 422 `invalid_cursor`, `unknown_kind`, `invalid_request`; 429
// `too_many_waiting` past the limit of waiting requests; 403 `scope_required` without the grant. It checks no
// certificate and no consent: what a module may see is the hub's to decide and the hub's tests' to prove.
//
//   node tooling/hub-events-stub.mjs serve [--port 38410]
//   node tooling/hub-events-stub.mjs emit calendar_event.created --person dev-owner --event ev_1 [--uid <uid>]
//   node tooling/hub-events-stub.mjs emit contact.changed --person dev-owner --contact ct_1
//   node tooling/hub-events-stub.mjs prune            (retention removes everything: a module behind gets 410)
//
// With `serve` running, `HUB_EVENTS_URL=http://127.0.0.1:38410 npm run dev` makes the app follow it (APP_ENV=local
// only); `emit` and `prune` talk to the running stub. tooling/event-feed.test.mjs drives the same stand-in in process
// through standInHub(), which also plays a hub that fails, drops connections or restarts.
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

export const PORT = Number(process.env.HUB_EVENTS_STUB_PORT ?? 38410)
export const PATH = '/services/module/events'
/** The hub's kinds today and the ids each may carry (KINDS in app/module_events.py). */
export const KINDS = {
  'calendar_event.created': ['event', 'uid'],
  'calendar_event.changed': ['event', 'uid'],
  'calendar_event.deleted': ['event', 'uid'],
  // A write to a person's address book through the hub's routes (TASKS APM20; src/server/hub/records.ts).
  'contact.created': ['contact', 'uid'],
  'contact.changed': ['contact', 'uid'],
  'contact.deleted': ['contact', 'uid'],
}
const CURSOR = /^evt_(\d{1,18})$/
const ID = /^[A-Za-z0-9._:@+-]{1,255}$/

export const cursorText = (seq) => `evt_${String(seq).padStart(12, '0')}`

/**
 * Start a stand-in hub on 127.0.0.1. `secondMs` is how long one second of `wait` lasts (a test makes it short);
 * `maxWait`, `page` and `maxWaiting` are the hub's settings with the hub's defaults; `log` gets a line a request.
 */
export async function standInHub({ port = 0, secondMs = 1000, maxWait = 25, page = 100, maxWaiting = 4, kinds = KINDS, log = null } = {}) {
  const state = { last: 0, pruned: 0, events: [], waiting: new Set(), granted: true, failures: [], drops: 0, requests: [], maxOpen: 0 }
  const sockets = new Set()

  function refusal(status, code) {
    return Object.assign(new Error(code), { status, code })
  }

  /** The hub's read: the events after `after` at most a page, and the position reached. `after` null: from now. */
  function read(after, wanted, limit) {
    const size = limit ? Math.min(limit, page) : page
    if (after === null) return { items: [], cursor: state.last }
    if (after > state.last) throw refusal(410, 'cursor_ahead')
    if (after < state.pruned) throw refusal(410, 'cursor_too_old')
    const rows = state.events.filter((e) => e.seq > after && (!wanted || wanted.includes(e.kind)))
    const items = []
    let reached = after
    let at = 0
    for (;;) {
      const asked = size - items.length
      const found = rows.slice(at, at + asked)
      at += found.length
      items.push(...found.filter((e) => !e.hidden))
      if (found.length < asked) return { items, cursor: Math.max(state.last, reached) }
      reached = found.at(-1).seq
      if (items.length >= size) return { items, cursor: reached }
    }
  }

  const wire = ({ items, cursor }) => ({
    items: items.map((e) => ({ id: cursorText(e.seq), kind: e.kind, at: e.at, person: e.person, data: e.data })),
    cursor: cursorText(cursor),
  })

  function send(res, status, body) {
    const text = JSON.stringify(body)
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(text) })
    res.end(text)
  }

  function events(req, res, url) {
    const seen = { at: Date.now(), after: url.searchParams.get('after'), kinds: url.searchParams.get('kinds'), wait: url.searchParams.get('wait'), limit: url.searchParams.get('limit'), status: null }
    state.requests.push(seen)
    const told = (what) => log?.(`${new Date().toISOString()} after=${seen.after ?? '(none)'} wait=${seen.wait ?? 0} -> ${what}`)
    const answer = (status, body) => {
      seen.status = status
      seen.answeredAt = Date.now()
      told(body.items ? `${status}, ${body.items.length} event(s), cursor ${body.cursor}` : `${status} ${body.detail}`)
      send(res, status, body)
    }
    if (state.drops > 0) {
      state.drops--
      seen.status = 'dropped'
      return void req.socket.destroy()
    }
    if (state.failures.length) {
      const failure = state.failures.shift()
      return answer(failure.status, { detail: failure.code })
    }
    if (!state.granted) return answer(403, { detail: 'scope_required' })
    let after = null
    if (seen.after !== null) {
      const match = CURSOR.exec(seen.after)
      if (!match) return answer(422, { detail: 'invalid_cursor' })
      after = Number(match[1])
    }
    let wanted = null
    if (seen.kinds) {
      wanted = [...new Set(seen.kinds.split(','))].sort()
      if (wanted.some((name) => !(name in kinds))) return answer(422, { detail: 'unknown_kind' })
    }
    const number = (text) => (text === null ? 0 : /^\d{1,6}$/.test(text) ? Number(text) : NaN)
    const wait = Math.min(number(seen.wait), maxWait)
    const limit = number(seen.limit)
    if (Number.isNaN(wait) || Number.isNaN(limit)) return answer(422, { detail: 'invalid_request' })
    const once = () => {
      try {
        return read(after, wanted, limit)
      } catch (error) {
        if (!error.status) throw error
        answer(error.status, { detail: error.code })
        return null
      }
    }
    if (wait <= 0) {
      const found = once()
      return found ? answer(200, wire(found)) : undefined
    }
    if (state.waiting.size >= state.maxWaiting) return answer(429, { detail: 'too_many_waiting' })
    const waiter = { wake: () => {}, timer: null }
    const leave = () => {
      clearTimeout(waiter.timer)
      state.waiting.delete(waiter)
    }
    state.waiting.add(waiter)
    state.maxOpen = Math.max(state.maxOpen, state.waiting.size)
    res.on('close', () => {
      // A caller that hangs up frees its place at once.
      if (!res.writableEnded) {
        seen.status = 'hung_up'
        told('the caller hung up')
      }
      leave()
    })
    const deadline = Date.now() + wait * secondMs
    waiter.wake = () => {
      clearTimeout(waiter.timer)
      if (!state.waiting.has(waiter)) return
      const found = once()
      if (!found) return leave()
      after = found.cursor
      const left = deadline - Date.now()
      if (found.items.length || left <= 0) {
        leave()
        return answer(200, wire(found))
      }
      waiter.timer = setTimeout(waiter.wake, left)
    }
    waiter.wake()
  }

  function control(req, res, url) {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
        if (url.pathname === '/_stub/emit') return send(res, 200, { id: hub.emit(body.kind, body) })
        if (url.pathname === '/_stub/prune') return send(res, 200, { cursor: hub.prune() })
        send(res, 404, { detail: 'Not Found' })
      } catch (error) {
        send(res, 400, { detail: String(error.message ?? error) })
      }
    })
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub.local')
    if (req.method === 'GET' && url.pathname === PATH) return events(req, res, url)
    if (req.method === 'POST' && url.pathname.startsWith('/_stub/')) return control(req, res, url)
    send(res, 404, { detail: 'Not Found' })
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  const listen = (onPort) =>
    new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(onPort, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
  const unlisten = () =>
    new Promise((resolve) => {
      server.close(() => resolve())
      for (const socket of sockets) socket.destroy()
    })
  await listen(port)
  const bound = server.address().port

  const hub = {
    url: `http://127.0.0.1:${bound}`,
    port: bound,
    /** Write one event and wake the waiting requests. `hidden`: an event this module is not shown; the cursor passes it. */
    emit(kind, { person = null, data = {}, hidden = false } = {}) {
      if (!(kind in kinds)) throw new Error(`unknown event kind ${kind}`)
      for (const [name, value] of Object.entries(data)) {
        if (!kinds[kind].includes(name)) throw new Error(`event kind ${kind} carries ${kinds[kind].join(', ') || 'nothing'} only`)
        if (typeof value !== 'string' || !ID.test(value)) throw new Error(`${name} of a ${kind} event is not an id`)
      }
      const event = { seq: ++state.last, kind, at: new Date().toISOString(), person, data: { ...data }, hidden }
      state.events.push(event)
      for (const waiter of [...state.waiting]) waiter.wake()
      return cursorText(event.seq)
    },
    /** Retention removes every event: a cursor behind the feed's end now answers 410 `cursor_too_old`. */
    prune() {
      state.pruned = state.last
      state.events = []
      for (const waiter of [...state.waiting]) waiter.wake()
      return cursorText(state.last)
    },
    /** A restored hub: the feed ends at `last` again, so a later cursor answers 410 `cursor_ahead`. */
    restore(last = 0) {
      state.last = last
      state.pruned = Math.min(state.pruned, last)
      state.events = state.events.filter((e) => e.seq <= last)
      for (const waiter of [...state.waiting]) waiter.wake()
    },
    /** false: the grant holds no key of any kind, every request answers 403 `scope_required`. */
    grant(granted) {
      state.granted = granted
    },
    /** The next `times` requests answer this status and code. */
    fail(status, code = 'unknown', times = 1) {
      for (let i = 0; i < times; i++) state.failures.push({ status, code })
    },
    /** The next `times` requests lose their connection without an answer. */
    drop(times = 1) {
      state.drops += times
    },
    /** The hub stops: every connection is cut and nothing listens. `up()` starts it again on the same port. */
    down: unlisten,
    up: () => listen(bound),
    close: unlisten,
    /** The cursor where the feed stands. */
    get cursor() {
      return cursorText(state.last)
    },
    /** Requests waiting now, and the most that ever waited at once. */
    get waiting() {
      return state.waiting.size
    },
    get maxOpen() {
      return state.maxOpen
    },
    /** Every request seen: { at, after, kinds, wait, limit, status, answeredAt }; status 'dropped' or 'hung_up' without an answer. */
    get requests() {
      return state.requests
    },
    set maxWaiting(n) {
      state.maxWaiting = n
    },
  }
  state.maxWaiting = maxWaiting
  return hub
}

// The command line ---------------------------------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2)
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[a.slice(2)] = next
        i++
      } else flags[a.slice(2)] = true
    } else positional.push(a)
  }
  const command = positional[0] ?? 'serve'
  const port = Number(flags.port ?? PORT)
  const base = flags.url ?? `http://127.0.0.1:${port}`
  const post = async (path, body) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    if (!res.ok) throw new Error(`${res.status} ${json.detail ?? ''}`)
    return json
  }
  if (command === 'serve') {
    const hub = await standInHub({ port, log: console.log })
    console.log(`hub events stub on ${hub.url}${PATH} (HUB_EVENTS_URL=${hub.url}); emit with: node tooling/hub-events-stub.mjs emit calendar_event.created --person dev-owner --event ev_1`)
  } else if (command === 'emit') {
    const kind = positional[1]
    if (!kind) throw new Error('usage: emit <kind> [--person <hub member id>] [--event <id>] [--contact <id>] [--uid <id>]')
    const data = Object.fromEntries(['event', 'contact', 'uid'].filter((name) => typeof flags[name] === 'string').map((name) => [name, flags[name]]))
    console.log(JSON.stringify(await post('/_stub/emit', { kind, person: typeof flags.person === 'string' ? flags.person : null, data })))
  } else if (command === 'prune') {
    console.log(JSON.stringify(await post('/_stub/prune', {})))
  } else {
    throw new Error('usage: node tooling/hub-events-stub.mjs serve [--port 38410] | emit <kind> [--person id] [--event id] [--contact id] [--uid id] | prune')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(String(error.message ?? error))
    process.exit(1)
  })
}
