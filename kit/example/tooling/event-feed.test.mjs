// The kit's client for the hub's event feed (src/server/hub/event-feed.ts; TASKS APM10) against a stand-in hub
// (tooling/hub-events-stub.mjs), and the same checks against a real hub when the environment names one. Run with
// `node --test tooling/event-feed.test.mjs`; part of `npm test`.
//
// Against a real hub (skipped when these are absent):
//   HUB_TEST_URL=https://<hub>:8443           the hub's module API, as LCC_URL names it for the module
//   HUB_TEST_CREDENTIAL_DIR=<dir>             the module credential: module.key, module.crt, root.crt
//   HUB_TEST_TLS_NAME=<name>                  optional: the name on the hub's certificate, when it is not the URL's host
//   HUB_TEST_AWAIT_EVENT_S=120                optional: wait this long for one event; change a calendar event of a
//                                             person who consents to the module meanwhile
// The real hub's part asks, waits a few seconds at a time and fills the module's waiting places for a moment; it
// writes nothing on the hub. What needs a hub that can be told what to do (an event on demand, retention, a failing or
// restarting hub) runs against the stand-in only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createEventFeed, hubTransport } from '../src/server/hub/event-feed.ts'
import { standInHub } from './hub-events-stub.mjs'

const CREATED = 'calendar_event.created'
const CHANGED = 'calendar_event.changed'
const DELETED = 'calendar_event.deleted'
const KINDS = [CHANGED, CREATED, DELETED]
const number = (cursor) => Number(/^evt_(\d+)$/.exec(cursor)?.[1] ?? NaN)

// The two hubs ---------------------------------------------------------------------------------------------------------

const realAddress = (() => {
  const url = process.env.HUB_TEST_URL
  const dir = process.env.HUB_TEST_CREDENTIAL_DIR
  if (!url || !dir) return null
  const file = (name) => readFileSync(join(dir, name))
  return { url, tls: { key: file('module.key'), cert: file('module.crt'), ca: file('root.crt'), servername: process.env.HUB_TEST_TLS_NAME || undefined } }
})()

const HUBS = [
  {
    name: 'stand-in hub',
    skip: false,
    pause: { firstMs: 40, maxMs: 400 },
    /** `secondMs`: how long the stand-in makes one second of `wait` last. */
    async open(t, options = {}) {
      const hub = await standInHub(options)
      t.after(() => hub.close())
      return { address: { url: hub.url }, hub }
    },
  },
  {
    name: 'real hub',
    skip: realAddress ? false : 'HUB_TEST_URL and HUB_TEST_CREDENTIAL_DIR are not set',
    pause: { firstMs: 200, maxMs: 2000 },
    async open() {
      return { address: realAddress, hub: null }
    },
  },
]

// A module following the feed, with everything it did kept for the assertions -------------------------------------------

function memoryCursor(value = null) {
  const store = {
    value,
    writes: [],
    async read() {
      return store.value
    },
    async write(cursor) {
      store.value = cursor
      store.writes.push(cursor)
    },
  }
  return store
}

function follower(t, address, { store = memoryCursor(), handlers, readAll, ...options } = {}) {
  const transport = hubTransport(address)
  const me = { store, asked: [], events: [], readAlls: [], logs: [], open: 0, maxOpen: 0 }
  const ask = async (query, signal) => {
    const entry = { ...query, at: Date.now(), status: null }
    me.asked.push(entry)
    me.maxOpen = Math.max(me.maxOpen, ++me.open)
    try {
      const answer = await transport.ask(query, signal)
      entry.status = answer.status
      entry.cursor = answer.body?.cursor
      return answer
    } finally {
      me.open--
      entry.endedAt = Date.now()
    }
  }
  const keep = (event) => void me.events.push(event)
  me.feed = createEventFeed({
    ask,
    cursor: store,
    handlers: handlers ?? { [CREATED]: keep, [CHANGED]: keep, [DELETED]: keep },
    readAll: async (reason) => {
      me.readAlls.push(reason)
      await readAll?.(reason)
    },
    log: (text, fields) => me.logs.push({ text, ...fields }),
    ...options,
  })
  me.close = async () => {
    await me.feed.stop()
    transport.close()
  }
  t.after(me.close)
  return me
}

async function until(what, predicate, ms = 5000) {
  const end = Date.now() + ms
  while (!predicate()) {
    if (Date.now() > end) assert.fail(`timed out after ${ms} ms waiting for ${what}`)
    await delay(5)
  }
}

/** Requests that asked with a cursor and waited, i.e. the loop's. */
const waits = (me) => me.asked.filter((q) => q.after !== undefined)
const pauses = (me) => me.logs.filter((line) => line.text === 'pausing')
/** Every pause is between half its base and its base; the base doubles from `firstMs` up to `maxMs`. */
function assertGrowingPauses(lines, { firstMs, maxMs }) {
  lines.forEach((line, i) => {
    const base = Math.min(maxMs, firstMs * 2 ** i)
    assert.equal(line.tries, i + 1)
    assert.ok(line.pause_ms >= base / 2 && line.pause_ms <= base, `pause ${i + 1} is ${line.pause_ms} ms, want ${base / 2} to ${base}`)
  })
}

// Against both hubs ----------------------------------------------------------------------------------------------------

for (const target of HUBS) {
  const { name, skip, pause } = target

  test(`${name}: the first request has no cursor, the module reads its state, and an empty answer keeps the cursor`, { skip }, async (t) => {
    const { address, hub } = await target.open(t, { secondMs: 20 })
    const me = follower(t, address, { waitSeconds: 2, pause })
    me.feed.start()
    await until('two answered waits', () => waits(me).filter((q) => q.status === 200).length >= 2, 15_000)
    assert.equal(me.asked[0].after, undefined, 'the first request carries no cursor')
    assert.ok(!me.asked[0].wait, 'and does not wait')
    assert.deepEqual(me.asked[0].kinds, KINDS, 'only the kinds with a handler are asked for')
    assert.deepEqual(me.readAlls, ['start'])
    assert.match(me.store.value, /^evt_\d+$/)
    assert.equal(me.store.writes[0], me.asked[0].cursor, 'the cursor is kept once the state was read')
    const loop = waits(me)
    loop.forEach((q, i) => {
      assert.equal(q.wait, 2)
      assert.equal(q.after, i === 0 ? me.asked[0].cursor : loop[i - 1].cursor, 'each request asks after the cursor of the answer before it')
      if (q.cursor) assert.ok(number(q.cursor) >= number(q.after), 'a cursor never goes back')
    })
    if (hub) {
      assert.equal(me.store.value, hub.cursor)
      assert.deepEqual(me.store.writes, [hub.cursor], 'an unchanged cursor is not written again')
      assert.deepEqual(me.events, [])
    }
    assert.equal(me.feed.status().state, 'following')
  })

  test(`${name}: a cursor the hub refuses with 410 leads to a re-read and a start from now`, { skip }, async (t) => {
    const { address } = await target.open(t, { secondMs: 20 })
    const ahead = 'evt_999999999999999999'
    const me = follower(t, address, { store: memoryCursor(ahead), waitSeconds: 2, pause })
    me.feed.start()
    await until('the re-read', () => me.readAlls.length === 1 && me.store.writes.length === 1, 15_000)
    assert.deepEqual([me.asked[0].after, me.asked[0].status], [ahead, 410])
    assert.equal(me.asked[1].after, undefined, 'then it asks without a cursor')
    assert.deepEqual(me.readAlls, ['cursor_ahead'])
    assert.equal(me.store.value, me.asked[1].cursor)
    assert.equal(pauses(me).length, 0, 'a refused cursor is not a reason to pause')
  })

  test(`${name}: a restart resumes from the kept cursor`, { skip }, async (t) => {
    const { address, hub } = await target.open(t, { secondMs: 20 })
    const store = memoryCursor()
    const first = follower(t, address, { store, waitSeconds: 2, pause })
    first.feed.start()
    await until('the first run to wait once', () => waits(first).some((q) => q.status === 200), 15_000)
    await first.close()
    const kept = store.value
    const missed = hub ? [hub.emit(CREATED, { person: 'p1', data: { event: 'ev_1' } }), hub.emit(DELETED, { person: 'p1', data: { event: 'ev_1' } })] : []
    const second = follower(t, address, { store, waitSeconds: 2, pause })
    second.feed.start()
    await until('the second run to be answered', () => second.asked.some((q) => q.status === 200), 15_000)
    assert.equal(second.asked[0].after, kept, 'the first request of the new run asks after the kept cursor')
    assert.deepEqual(second.readAlls, [], 'and the state is not read again')
    if (hub) {
      await until('what happened meanwhile', () => second.events.length === 2)
      assert.deepEqual(second.events.map((e) => [e.id, e.kind]), [[missed[0], CREATED], [missed[1], DELETED]], 'in the order it happened')
      await until('the cursor', () => store.value === missed[1])
    }
  })

  test(`${name}: 429 too_many_waiting makes the module back off, and it follows again once a place is free`, { skip }, async (t) => {
    const { address, hub } = await target.open(t)
    // Where the feed stands, then other copies of the module take every waiting place.
    const probe = hubTransport(address)
    const stands = await probe.ask({}, new AbortController().signal)
    probe.close()
    assert.equal(stands.status, 200)
    const holders = []
    const release = () => {
      for (const holder of holders.splice(0)) {
        holder.stop.abort()
        holder.transport.close()
      }
    }
    t.after(release)
    let full = false
    for (let i = 0; i < 33 && !full; i++) {
      const transport = hubTransport(address)
      const stop = new AbortController()
      const answer = transport.ask({ after: stands.body.cursor, wait: 25 }, stop.signal).catch(() => null)
      holders.push({ transport, stop })
      full = (await Promise.race([answer, delay(hub ? 100 : 500)]))?.status === 429
    }
    assert.ok(full, 'the hub answers 429 once the places are taken')
    const me = follower(t, address, { store: memoryCursor(stands.body.cursor), waitSeconds: 2, pause })
    me.feed.start()
    await until('four refusals', () => me.asked.filter((q) => q.status === 429).length >= 4, 20_000)
    const refused = me.asked.filter((q) => q.status === 429)
    assert.ok(refused.every((q) => q.after === stands.body.cursor), 'every try asks after the same cursor')
    assertGrowingPauses(pauses(me).slice(0, 4), pause)
    assert.ok(pauses(me).every((line) => line.why === '429 too_many_waiting'))
    refused.slice(1, 4).forEach((q, i) => assert.ok(q.at - refused[i].at >= (pause.firstMs * 2 ** i) / 2 - 5, `try ${i + 2} came ${q.at - refused[i].at} ms after try ${i + 1}`))
    assert.equal(me.feed.status().state, 'pausing')
    release()
    await until('a place', () => me.asked.some((q) => q.status === 200) || (hub?.waiting ?? 0) === 1, 20_000)
    if (hub) {
      const id = hub.emit(CHANGED, { person: 'p1', data: { event: 'ev_1' } })
      await until('the event', () => me.events.length === 1)
      assert.equal(me.events[0].id, id)
    }
    assert.equal(me.maxOpen, 1)
    assert.deepEqual(me.readAlls, [])
  })

  test(`${name}: a clean stop leaves no request open, and one module instance has one request at a time`, { skip }, async (t) => {
    const { address, hub } = await target.open(t)
    const me = follower(t, address, { pause })
    me.feed.start()
    me.feed.start() // a second start while following starts nothing
    await until('a waiting request', () => me.open === 1 && me.asked.at(-1).after !== undefined && (!hub || hub.waiting === 1), 15_000)
    assert.equal(me.asked.at(-1).wait, 25, 'the wait is 25 s unless the module says otherwise')
    await delay(100)
    const asked = me.asked.length
    const at = Date.now()
    await me.feed.stop()
    assert.ok(Date.now() - at < 1000, `stopping took ${Date.now() - at} ms with a request that could wait 25 s`)
    assert.equal(me.open, 0, 'no request is open on the module side')
    assert.equal(me.feed.status().state, 'stopped')
    await delay(150)
    assert.equal(me.asked.length, asked, 'and none is made afterwards')
    assert.equal(me.maxOpen, 1)
    if (hub) {
      assert.equal(hub.waiting, 0, 'the hub sees the place freed')
      assert.equal(hub.maxOpen, 1)
      assert.equal(hub.requests.at(-1).status, 'hung_up')
    }
    assert.equal(pauses(me).length, 0)
  })

  test(`${name}: an event arrives while the module waits`, { skip: skip || (target.name === 'real hub' && !process.env.HUB_TEST_AWAIT_EVENT_S ? 'HUB_TEST_AWAIT_EVENT_S is not set' : false) }, async (t) => {
    const { address, hub } = await target.open(t)
    const me = follower(t, address, { pause })
    me.feed.start()
    await until('a waiting request', () => me.open === 1 && me.asked.at(-1).after !== undefined && (!hub || hub.waiting === 1), 15_000)
    const before = me.store.value
    let id
    const at = Date.now()
    if (hub) id = hub.emit(CREATED, { person: 'mem_1', data: { event: 'ev_1', uid: 'uid-1@hub' } })
    else console.log(`waiting ${process.env.HUB_TEST_AWAIT_EVENT_S} s for an event: change a calendar event now`)
    await until('the event', () => me.events.length >= 1, hub ? 5000 : Number(process.env.HUB_TEST_AWAIT_EVENT_S) * 1000)
    const event = me.events[0]
    if (hub) {
      // The stand-in holds a request 25 s, so an event within one second came because it happened, not because a wait ended.
      assert.ok(Date.now() - at < 1000, `the handler ran ${Date.now() - at} ms after the event`)
      assert.deepEqual({ ...event, at: null }, { id, kind: CREATED, at: null, person: 'mem_1', data: { event: 'ev_1', uid: 'uid-1@hub' } })
      assert.ok(!Number.isNaN(Date.parse(event.at)))
    } else {
      console.log(`received ${JSON.stringify(event)}`)
      assert.ok(KINDS.includes(event.kind))
    }
    await until('the cursor', () => me.store.value !== before)
    assert.ok(number(me.store.value) >= number(event.id), 'the cursor is written once the handler ran')
  })
}

// Against the stand-in only: it can be told what to do ------------------------------------------------------------------

const quick = { waitSeconds: 2, pause: { firstMs: 40, maxMs: 400 } }
async function standIn(t, options = { secondMs: 20 }) {
  const hub = await standInHub(options)
  t.after(() => hub.close())
  return hub
}

test('the events of an answer are handled in order, and the cursor is written after the last', async (t) => {
  const hub = await standIn(t)
  const seen = []
  const store = memoryCursor()
  const written = store.write
  store.write = async (cursor) => {
    seen.push(`cursor ${cursor}`)
    await written(cursor)
  }
  const ids = []
  const handler = async (event) => {
    await delay(event.kind === CREATED ? 30 : 1) // a slow first handler does not let the second overtake it
    seen.push(`${event.kind} ${event.id}`)
  }
  const me = follower(t, { url: hub.url }, {
    store,
    ...quick,
    handlers: { [CREATED]: handler, [CHANGED]: handler, [DELETED]: handler },
    // What happens while the module reads its state comes after the cursor it took first: nothing is missed.
    readAll: () => void ids.push(hub.emit(CREATED, { person: 'p1', data: { event: 'ev_1' } }), hub.emit(CHANGED, { person: 'p1', data: { event: 'ev_1' } }), hub.emit(DELETED, { person: 'p1', data: { event: 'ev_1' } })),
  })
  me.feed.start()
  await until('the cursor after the three', () => store.value === ids[2])
  assert.deepEqual(seen, ['cursor evt_000000000000', `${CREATED} ${ids[0]}`, `${CHANGED} ${ids[1]}`, `${DELETED} ${ids[2]}`, `cursor ${ids[2]}`])
  assert.equal(me.feed.status().handled, 3)
})

test('a kind without a handler is not asked for, and the cursor passes it and what the module is not shown', async (t) => {
  const hub = await standIn(t)
  const me = follower(t, { url: hub.url }, { ...quick, handlers: { [DELETED]: (event) => void me.events.push(event) } })
  me.feed.start()
  await until('a waiting request', () => hub.waiting === 1)
  hub.emit(CREATED, { person: 'p1', data: { event: 'ev_1' } })
  const hidden = hub.emit(DELETED, { person: 'p2', data: { event: 'ev_9' } , hidden: true })
  await until('the cursor to pass both', () => me.store.value === hidden)
  assert.deepEqual(me.events, [], 'neither reached a handler')
  assert.ok(hub.requests.every((q) => q.kinds === DELETED))
  const id = hub.emit(DELETED, { person: 'p1', data: { event: 'ev_1' } })
  await until('the event it does handle', () => me.events.length === 1)
  assert.equal(me.events[0].id, id)
})

test('410 cursor_too_old: retention passed the cursor, the module reads its state again and starts from now', async (t) => {
  const hub = await standIn(t)
  const me = follower(t, { url: hub.url }, quick)
  me.feed.start()
  await until('a waiting request', () => hub.waiting === 1)
  const kept = me.store.value
  await me.feed.stop()
  hub.emit(CREATED, { person: 'p1', data: { event: 'ev_1' } })
  hub.emit(CREATED, { person: 'p1', data: { event: 'ev_2' } })
  const end = hub.prune()
  me.feed.start()
  await until('the re-read', () => me.readAlls.length === 2 && me.store.value === end)
  assert.deepEqual(me.readAlls, ['start', 'cursor_too_old'])
  const refused = me.asked.find((q) => q.status === 410)
  assert.equal(refused.after, kept)
  assert.equal(me.asked[me.asked.indexOf(refused) + 1].after, undefined)
  assert.deepEqual(me.events, [], 'the removed events never come: the re-read covers them')
  const id = hub.emit(CHANGED, { person: 'p1', data: { event: 'ev_2' } })
  await until('the next event', () => me.events.length === 1)
  assert.equal(me.events[0].id, id)
})

test('a module that stopped before the cursor was written gets the event again: a handler may run twice', async (t) => {
  const hub = await standIn(t)
  const store = memoryCursor()
  let release = () => {}
  t.after(() => release()) // before the follower's own clean-up, which waits for the write below
  const first = follower(t, { url: hub.url }, { store, ...quick })
  first.feed.start()
  await until('a waiting request', () => hub.waiting === 1)
  const kept = store.value
  // The write after the handler never lands: the process died there.
  store.write = () => new Promise((resolve) => (release = resolve))
  const id = hub.emit(CREATED, { person: 'p1', data: { event: 'ev_1' } })
  await until('the handler of the first run', () => first.events.length === 1)
  assert.equal(store.value, kept)
  const again = memoryCursor(kept)
  const second = follower(t, { url: hub.url }, { store: again, ...quick })
  second.feed.start()
  await until('the handler of the second run', () => second.events.length === 1)
  assert.deepEqual([first.events[0].id, second.events[0].id], [id, id])
  await until('the cursor', () => again.value === id)
})

test('5xx, a dropped connection and a hub that restarts: the same cursor again, after a pause that grows', async (t) => {
  const hub = await standIn(t, { secondMs: 1000 }) // holds a request 2 s, so the one cut below is still waiting
  const me = follower(t, { url: hub.url }, quick)
  me.feed.start()
  await until('a waiting request', () => hub.waiting === 1)
  const kept = me.store.value
  const cut = me.asked.length - 1
  hub.fail(503, 'unavailable', 2)
  hub.drop(2)
  await hub.down() // cuts the waiting request
  const id = hub.emit(CREATED, { person: 'p1', data: { event: 'ev_1' } })
  await until('two tries against a hub that is down', () => pauses(me).length >= 3)
  await hub.up()
  await until('the event', () => me.events.length === 1, 10_000)
  assert.equal(me.events[0].id, id)
  const tries = me.asked.slice(cut, me.asked.findIndex((q, i) => i > cut && q.status === 200))
  assert.ok(tries.length >= 7, `the cut request, at least two refused connections, two 503 and two dropped: ${tries.length}`)
  assert.ok(tries.every((q) => q.after === kept && q.status !== 200), 'every try asks after the same cursor')
  assert.deepEqual(tries.map((q) => q.status).filter(Boolean), [503, 503])
  assertGrowingPauses(pauses(me), quick.pause)
  assert.equal(pauses(me).length, tries.length)
  assert.ok(pauses(me).some((line) => line.why === '503 unavailable'))
  assert.deepEqual(me.readAlls, ['start'], 'a failing hub is not a reason to read everything again')
  assert.equal(me.logs.at(-1).text, 'following again')
  assert.equal(me.feed.status().trouble, null)
  assert.equal(me.maxOpen, 1)
})

test('no answer in time: the request is given up and asked again from the same cursor', async (t) => {
  const hub = await standIn(t, { secondMs: 1000 }) // holds a request 25 s
  const me = follower(t, { url: hub.url }, { waitSeconds: 25, timeoutMs: 80, pause: quick.pause })
  me.feed.start()
  await until('three tries', () => waits(me).length >= 3)
  const kept = me.store.value
  assert.ok(waits(me).every((q) => q.after === kept))
  assert.ok(pauses(me).every((line) => line.why === 'no answer within 80 ms'))
  assert.ok(hub.maxOpen <= 1, 'the request given up was closed before the next')
  await me.feed.stop()
  await until('the hub to see the place freed', () => hub.waiting === 0)
})

test('403 scope_required: the module stops following and says why; start() asks again', async (t) => {
  const hub = await standIn(t)
  hub.grant(false)
  const me = follower(t, { url: hub.url }, quick)
  me.feed.start()
  await until('the refusal', () => me.feed.status().state === 'refused')
  assert.equal(me.feed.status().refused, 'scope_required')
  assert.deepEqual(me.logs.at(-1), { text: 'not following: the hub refused', code: 'scope_required' })
  await delay(150)
  assert.equal(hub.requests.length, 1, 'it does not ask again by itself')
  assert.deepEqual(me.readAlls, [])
  hub.grant(true)
  me.feed.start()
  await until('a waiting request', () => hub.waiting === 1)
  assert.deepEqual([me.feed.status().state, me.feed.status().refused], ['following', null])
})

test('a handler that throws is tried again from its event; the events before it are not', async (t) => {
  const hub = await standIn(t)
  const calls = []
  let failures = 2
  const ids = []
  const me = follower(t, { url: hub.url }, {
    ...quick,
    handlers: {
      [CREATED]: (event) => void calls.push(event.id),
      [CHANGED]: (event) => {
        calls.push(event.id)
        if (failures-- > 0) throw new Error('the database is busy')
      },
      [DELETED]: (event) => void calls.push(event.id),
    },
    readAll: () => void ids.push(hub.emit(CREATED, { data: { event: 'ev_1' } }), hub.emit(CHANGED, { data: { event: 'ev_1' } }), hub.emit(DELETED, { data: { event: 'ev_1' } })),
  })
  me.feed.start()
  await until('the cursor after the three', () => me.store.value === ids[2])
  assert.deepEqual(calls, [ids[0], ids[1], ids[1], ids[1], ids[2]])
  assert.deepEqual(me.store.writes, ['evt_000000000000', ids[0], ids[2]], 'the cursor moved to the last handled event, then to the end')
  assert.equal(pauses(me).length, 2)
  assert.match(pauses(me)[0].why, /^the handler of calendar_event\.changed failed on evt_000000000002: the database is busy$/)
  assert.deepEqual(me.readAlls, ['start'])
})

test('an event whose handler keeps failing is given up on: the module says so and reads everything again', async (t) => {
  const hub = await standIn(t)
  let calls = 0
  const me = follower(t, { url: hub.url }, {
    ...quick,
    attempts: 3,
    handlers: {
      [CHANGED]: () => {
        calls++
        throw new Error('no such record')
      },
    },
  })
  me.feed.start()
  await until('a waiting request', () => hub.waiting === 1)
  const id = hub.emit(CHANGED, { data: { event: 'ev_1' } })
  await until('the re-read', () => me.readAlls.length === 2 && me.store.value === id)
  assert.equal(calls, 3)
  assert.deepEqual(me.readAlls, ['start', 'handler_failed'])
  const gaveUp = me.logs.find((line) => line.text.startsWith('giving up'))
  assert.deepEqual([gaveUp.id, gaveUp.kind, gaveUp.tries], [id, CHANGED, 3])
  await until('a waiting request after it', () => hub.waiting === 1)
  assert.equal(calls, 3, 'the event is not delivered again')
})
