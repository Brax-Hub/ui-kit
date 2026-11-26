// The kit's client for a person's calendar and address book in Brax Mail (src/server/hub/records.ts; TASKS APM20)
// against a stand-in hub (tooling/hub-records-stub.mjs), and a few of the same checks against a real hub when the
// environment names one. Run with `node --test tooling/records.test.mjs`; part of `npm test`.
//
// Against a real hub (skipped when these are absent):
//   HUB_TEST_URL=https://<hub>:8443           the hub's module API, as LCC_URL names it for the module
//   HUB_TEST_CREDENTIAL_DIR=<dir>             the module credential: module.key, module.crt, root.crt
//   HUB_TEST_TLS_NAME=<name>                  optional: the name on the hub's certificate, when it is not the URL's host
//   HUB_TEST_PERSON=<membership id>           a member of that hub with a Brax Mail mailbox, who holds the calendar
//                                             and contacts permissions over themself (an owner or a member)
//   HUB_TEST_WRITE=1                          optional: also create, change and delete one event in that person's
//                                             calendar (it is removed again), and try one contact
// Without HUB_TEST_WRITE the real hub's part only reads. What needs a hub that can be told what to do (a lost answer,
// a refusal on demand, a Brax Mail that is off) runs against the stand-in only. Nothing here has run against a real
// hub or a real Brax Mail yet: see kit/README.md in Brax-Hub/ui-kit.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { hubTransport } from '../src/server/hub/event-feed.ts'
import { createHubRecords, HubRecordsError, newIdempotencyKey, RECORDS_ERRORS, RECORDS_FEED_KINDS, RECORDS_SCOPES, recordsRefusal } from '../src/server/hub/records.ts'
import { contactUid, EDIT, eventUid, GRANT_TODAY, LOOK, READ, sampleAccount, standInRecordsHub, WRITE } from './hub-records-stub.mjs'

const ALL = [READ, WRITE, LOOK, EDIT]
// The stand-in's people: an owner, an admin, two members, a guest, and a member without a mailbox. All invented.
const PEOPLE = { olena: 'owner', adam: 'admin', marc: 'member', luca: 'member', gus: 'guest' }
const PAUSE = { firstMs: 20, maxMs: 80 }

/** A stand-in hub and a client of it, with what the client logged. */
async function open(t, { grant = GRANT_TODAY, ...client } = {}) {
  const hub = await standInRecordsHub({ people: PEOPLE, grant })
  hub.person('ruth', { role: 'member', mailbox: false })
  const transport = hubTransport({ url: hub.url }, { connections: 4 })
  const logs = []
  const records = createHubRecords({ call: transport.call, pause: PAUSE, timeoutMs: 3000, log: (text, fields) => logs.push({ text, ...fields }), ...client })
  t.after(async () => {
    transport.close()
    await hub.close()
  })
  return { hub, records, logs, transport }
}

/** The call is refused with this code, by one HubRecordsError; returns it. */
async function refused(promise, code) {
  let caught = null
  try {
    await promise
  } catch (error) {
    caught = error
  }
  assert.ok(caught instanceof HubRecordsError, `expected a HubRecordsError with ${code}, got ${caught === null ? 'an answer' : String(caught)}`)
  assert.equal(caught.code, code)
  return caught
}

/** Every pause is between half its base and its base; the base doubles from `firstMs` up to `maxMs`: the feed client's. */
function assertGrowingPauses(lines, { firstMs, maxMs }) {
  lines.forEach((line, i) => {
    const base = Math.min(maxMs, firstMs * 2 ** i)
    assert.equal(line.tries, i + 1)
    assert.ok(line.pause_ms >= base / 2 && line.pause_ms <= base, `pause ${i + 1} is ${line.pause_ms} ms, want ${base / 2} to ${base}`)
  })
}

const lunch = { title: 'Lunch', start: '2026-12-01T12:00:00', timeZone: 'Europe/Paris', duration: 'PT1H' }
const card = { kind: 'individual', name: { full: 'Ines Example' }, emails: { e1: { address: 'ines@example.org' } } }

// The twelve functions ----------------------------------------------------------------------------------------------------

test('one function a route, and the person named once is also the person acting', async (t) => {
  const { hub, records } = await open(t, { grant: ALL })
  const calendars = await records.listCalendars('marc')
  assert.deepEqual(calendars, {
    person: 'marc',
    default: 'cal1',
    calendars: [
      { id: 'cal1', name: 'Calendar', description: null, color: null, sort_order: 0, is_default: true, may_write: true },
      { id: 'cal2', name: 'Family', description: null, color: null, sort_order: 1, is_default: false, may_write: true },
    ],
  })
  const listed = await records.listEvents('marc')
  assert.deepEqual(listed.events.map((e) => e.id), ['ev1', 'ev2', 'ev3', 'ev4'], 'by start, the repeating one last; the task is not an event')
  assert.deepEqual([listed.person, listed.count, listed.truncated], ['marc', 4, false])
  assert.ok(!Number.isNaN(Date.parse(listed.from)) && Date.parse(listed.to) - Date.parse(listed.from) === 7 * 86_400_000, 'seven days from now unless asked otherwise')
  assert.deepEqual(Object.keys(listed.events[0]).sort(), ['calendarIds', 'duration', 'id', 'locations', 'start', 'timeZone', 'title', 'uid'])
  const one = await records.readEvent('marc', 'ev1')
  assert.deepEqual([one.id, one.title, one.locations.l1.name], ['ev1', 'Dentist', 'Clinic'])
  const made = await records.createEvent('marc', lunch)
  assert.deepEqual({ ...made, id: null, key: null }, { person: 'marc', id: null, uid: eventUid('example', 'marc', made.key), created: true, key: null, tries: 1 })
  assert.deepEqual(hub.account('marc').events[made.id], { ...lunch, '@type': 'Event', uid: made.uid, calendarIds: { cal1: true } })
  assert.deepEqual(await records.changeEvent('marc', 'ev1', { title: 'Dentist (moved)', description: null, 'locations/l1/name': 'New clinic' }), { person: 'marc', id: 'ev1', uid: 'u1', tries: 1 })
  const stored = hub.account('marc').events.ev1
  assert.deepEqual([stored.title, 'description' in stored, stored.locations.l1.name], ['Dentist (moved)', false, 'New clinic'])
  assert.deepEqual(await records.deleteEvent('marc', 'ev2'), { person: 'marc', id: 'ev2', deleted: true, tries: 1 })
  assert.ok(!('ev2' in hub.account('marc').events))

  const books = await records.listAddressBooks('marc')
  assert.deepEqual([books.person, books.default, books.address_books.map((b) => b.id)], ['marc', 'ab1', ['ab1', 'ab2']])
  const page = await records.listContacts('marc')
  assert.deepEqual([page.person, page.position, page.total, page.contacts.map((c) => c.id)], ['marc', 0, 2, ['ct1', 'ct2']])
  assert.deepEqual(await records.readContact('marc', 'ct2'), { id: 'ct2', addressBookIds: { ab2: true }, uid: hub.account('marc').cards.ct2.uid, kind: 'individual', name: { full: 'Tomas Reyes' }, organizations: { o1: { name: 'Example Works' } }, phones: { p1: { number: '+15550100' } } })
  const added = await records.createContact('marc', card, { addressBook: 'ab2' })
  assert.deepEqual([added.created, added.uid, added.tries], [true, contactUid('example', 'marc', added.key), 1])
  assert.deepEqual(hub.account('marc').cards[added.id], { version: '1.0', ...card, '@type': 'Card', uid: added.uid, addressBookIds: { ab2: true } })
  assert.deepEqual(await records.changeContact('marc', 'ct1', { name: { full: 'Nora Lind-Berg' }, notes: null, 'emails/e2': { address: 'nora@example.net' } }), { person: 'marc', id: 'ct1', uid: null, tries: 1 })
  assert.deepEqual(Object.keys(hub.account('marc').cards.ct1.emails), ['e1', 'e2'])
  assert.deepEqual(await records.deleteContact('marc', 'ct1'), { person: 'marc', id: 'ct1', deleted: true, tries: 1 })

  assert.deepEqual(hub.requests.map((q) => q.route), [
    'GET calendars', 'GET calendar/events', 'GET calendar/events/{id}', 'POST calendar/events', 'PATCH calendar/events/{id}', 'DELETE calendar/events/{id}',
    'GET address-books', 'GET address-book/contacts', 'GET address-book/contacts/{id}', 'POST address-book/contacts', 'PATCH address-book/contacts/{id}', 'DELETE address-book/contacts/{id}',
  ])
  assert.ok(hub.requests.every((q) => q.person === 'marc' && q.acting === 'marc' && q.status < 300), 'every call names the person in the path and in Brax-Acting-Member')
  assert.deepEqual(Object.keys(RECORDS_SCOPES).length, 12)
  // Another person's records are another account: nothing of marc's shows in luca's.
  assert.equal((await records.readEvent('luca', 'ev1')).title, 'Dentist')
})

test('fields is a list of property names, `*` is everything Brax Mail holds, and id always comes back', async (t) => {
  const { hub, records } = await open(t)
  const chosen = (await records.listEvents('marc', { fields: ['title', 'description'] })).events
  assert.deepEqual(chosen.slice(0, 2), [{ id: 'ev1', title: 'Dentist', description: 'Bring the x-ray' }, { id: 'ev2', title: 'Football practice' }])
  assert.equal(hub.requests.at(-1).path.split('?')[1], 'fields=title%2Cdescription')
  const whole = await records.readEvent('marc', 'ev3', { fields: '*' })
  assert.deepEqual([whole['@type'], Object.keys(whole.participants)], ['Event', ['p1']], 'guests are read, never written')
  assert.deepEqual(await records.readContact('marc', 'ct1', { fields: ['notes'] }), { id: 'ct1', notes: { n1: { note: 'Met at the fair' } } })
  assert.equal((await records.listContacts('marc', { fields: '*' })).contacts[0]['@type'], 'Card')
  assert.deepEqual(await records.readEvent('marc', 'ev1', { fields: ['noSuchProperty'] }), { id: 'ev1' }, 'a property Brax Mail does not hold is only absent')
})

test('the events of a range, of one calendar, and no more than the limit', async (t) => {
  const { hub, records } = await open(t)
  const account = hub.account('marc')
  const start = Date.parse(`${account.events.ev2.start}Z`)
  const day = await records.listEvents('marc', { from: new Date(start - 3_600_000), to: new Date(start + 3_600_000), fields: ['title'] })
  assert.deepEqual(day.events.map((e) => e.id), ['ev2', 'ev4'], 'the event in the range, and the repeating one, which is Brax Mail to match')
  assert.match(day.from, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'a Date goes as RFC 3339 with an offset and no fraction')
  assert.deepEqual((await records.listEvents('marc', { calendar: 'cal2' })).events.map((e) => e.id), ['ev2'])
  const few = await records.listEvents('marc', { limit: 2 })
  assert.deepEqual([few.events.map((e) => e.id), few.count, few.truncated], [['ev1', 'ev2'], 4, true])
  await records.listEvents('marc', { expand: true, from: '2026-11-26T00:00:00+01:00', to: '2026-11-27T00:00:00+01:00' })
  const asked = new URL(`http://hub${hub.requests.at(-1).path}`).searchParams
  assert.deepEqual([asked.get('expand'), asked.get('from'), asked.get('to')], ['true', '2026-11-26T00:00:00+01:00', '2026-11-27T00:00:00+01:00'])
})

test('a page of contacts: position, limit and total; a page of whole cards holds 50 at most', async (t) => {
  const { hub, records } = await open(t)
  const cards = hub.account('marc').cards
  for (let i = 3; i <= 120; i++) cards[`ct${i}`] = { '@type': 'Card', version: '1.0', uid: `urn:uuid:sample-${i}`, kind: 'individual', name: { full: `Sample Person ${i}` }, addressBookIds: { ab1: true } }
  const first = await records.listContacts('marc', { limit: 50, fields: ['name'] })
  assert.deepEqual([first.position, first.total, first.contacts.length, first.contacts[0]], [0, 120, 50, { id: 'ct1', name: { full: 'Nora Lind' } }])
  const seen = [...first.contacts]
  for (let page = first; seen.length < page.total; ) {
    page = await records.listContacts('marc', { position: page.position + page.contacts.length, limit: 50, fields: ['name'] })
    assert.equal(page.position, seen.length, 'the next page starts where the one before ended')
    seen.push(...page.contacts)
  }
  assert.equal(new Set(seen.map((c) => c.id)).size, 120, 'three pages, every contact once')
  assert.equal((await records.listContacts('marc', { fields: '*', limit: 500 })).contacts.length, 50, 'a card may carry its photo')
  assert.deepEqual((await records.listContacts('marc', { addressBook: 'ab2' })).contacts.map((c) => c.id), ['ct2'])
  assert.deepEqual((await records.listContacts('marc', { text: 'reyes' })).contacts.map((c) => c.id), ['ct2'])
})

test('acting for somebody else: both are said, and the hub decides', async (t) => {
  const { hub, records } = await open(t)
  const error = await refused(records.listCalendars({ person: 'luca', acting: 'marc' }), 'relation_required')
  assert.deepEqual([error.status, error.again, error.tries], [403, false, 1])
  hub.relate('marc', 'luca', [READ])
  assert.equal((await records.readEvent({ person: 'luca', acting: 'marc' }, 'ev1')).id, 'ev1')
  assert.deepEqual([hub.requests.at(-1).person, hub.requests.at(-1).acting], ['luca', 'marc'])
  await refused(records.deleteEvent({ person: 'luca', acting: 'marc' }, 'ev1'), 'relation_required') // the role holds calendar.read only
  await refused(records.listCalendars({ person: 'luca', acting: 'adam' }), 'relation_required') // a role over the hub is not that relation
})

// Creates: one key a thing the person did -------------------------------------------------------------------------------------

test('a create sends an Idempotency-Key; the same key again makes no second record and says so', async (t) => {
  const { hub, records } = await open(t)
  const before = Object.keys(hub.account('marc').events).length
  const key = newIdempotencyKey()
  assert.match(key, /^[A-Za-z0-9._:-]{8,128}$/)
  const first = await records.createEvent('marc', lunch, { key })
  const again = await records.createEvent('marc', lunch, { key })
  assert.deepEqual([first.created, first.key, again.created, again.id, again.uid, again.tries], [true, key, false, first.id, first.uid, 1])
  assert.equal(Object.keys(hub.account('marc').events).length, before + 1)
  // Without a key the client makes one a call: two calls are two things the person did, and two events.
  const other = await records.createEvent('marc', lunch)
  assert.ok(other.created && other.key !== key && other.id !== first.id)
  assert.match(other.key, /^[A-Za-z0-9._:-]{8,128}$/)
  assert.deepEqual(hub.requests.map((q) => q.key), [key, key, other.key])
  // The same key for another person is another record.
  assert.notEqual((await records.createEvent('luca', lunch, { key })).uid, first.uid)
})

test('a create whose answer was lost is sent again with the same key and finds the record it made', async (t) => {
  const { hub, records, logs } = await open(t, { grant: ALL })
  const before = Object.keys(hub.account('marc').events).length
  hub.loseAnswer() // the event is written, then 502 with write_attempted true
  const made = await records.createEvent('marc', lunch)
  assert.deepEqual([made.created, made.tries], [true, 2], 'made by this call, at its first try')
  assert.equal(Object.keys(hub.account('marc').events).length, before + 1, 'one event, not two')
  assert.deepEqual(hub.requests.map((q) => [q.key, q.status]), [[made.key, 502], [made.key, 200]])
  assert.deepEqual({ ...logs[0], pause_ms: null }, { text: 'trying again', what: 'createEvent', why: '502 mail_unreachable', tries: 1, pause_ms: null, may_have_written: true })
  // The same for a contact, and for a connection cut after the write.
  hub.dropAfterWrite()
  const added = await records.createContact('marc', card)
  assert.deepEqual([added.created, added.tries, Object.keys(hub.account('marc').cards).length], [true, 2, 3])
  // A failure before the write left says so; the second try is then the one that writes.
  hub.fail(502, 'mail_unreachable', 1, { write_attempted: false })
  const late = await records.createEvent('marc', lunch)
  assert.deepEqual([late.created, late.tries, logs.at(-1).may_have_written], [true, 2, false])
  assert.equal(Object.keys(hub.account('marc').events).length, before + 2)
})

test('a create that got no answer in time is sent again with the same key', async (t) => {
  const { hub, records, logs } = await open(t, { timeoutMs: 120 })
  const before = Object.keys(hub.account('marc').events).length
  hub.hold(600) // the event is written at once and the answer comes too late
  const made = await records.createEvent('marc', lunch)
  assert.deepEqual([made.created, made.tries], [true, 2])
  assert.equal(Object.keys(hub.account('marc').events).length, before + 1)
  assert.equal(logs[0].why, 'no answer within 120 ms')
  assert.deepEqual(new Set(hub.requests.map((q) => q.key)).size, 1)
})

test('the tries are bounded, and the error says what the caller needs to send the same call again later', async (t) => {
  const { hub, records, logs } = await open(t)
  hub.fail(502, 'mail_unreachable', 5, { write_attempted: true })
  const key = newIdempotencyKey()
  const error = await refused(records.createEvent('marc', lunch, { key }), 'mail_unreachable')
  assert.deepEqual([error.status, error.message, error.writeAttempted, error.again, error.tries, error.idempotencyKey, error.what], [502, 'mail_unreachable', true, true, 3, key, 'createEvent'])
  assert.equal(hub.requests.length, 3, 'three tries, no more')
  assertGrowingPauses(logs, PAUSE)
  assert.equal(logs.length, 2)
  // One try when the caller says so.
  hub.fail(502, 'mail_unreachable', 5, { write_attempted: true })
  assert.equal((await refused(records.createEvent('marc', lunch, { key, tries: 1 }), 'mail_unreachable')).tries, 1)
})

// Changes and deletes ---------------------------------------------------------------------------------------------------------

test('a change is sent again and writes the same values; a delete sent again that answers 404 is done', async (t) => {
  const { hub, records } = await open(t, { grant: ALL })
  hub.loseAnswer()
  assert.deepEqual(await records.changeEvent('marc', 'ev1', { title: 'Moved' }), { person: 'marc', id: 'ev1', uid: 'u1', tries: 2 })
  assert.equal(hub.account('marc').events.ev1.title, 'Moved')
  assert.deepEqual(await records.changeEvent('marc', 'ev1', {}, { calendar: 'cal2' }), { person: 'marc', id: 'ev1', uid: 'u1', tries: 1 }, 'an empty change with a calendar moves the event')
  assert.deepEqual(hub.account('marc').events.ev1.calendarIds, { cal2: true })
  // The delete went through and its answer was lost: the second try finds nothing, which is what was asked for.
  hub.loseAnswer()
  assert.deepEqual(await records.deleteEvent('marc', 'ev1'), { person: 'marc', id: 'ev1', deleted: true, tries: 2 })
  assert.deepEqual(hub.requests.slice(-2).map((q) => q.status), [502, 404])
  // A later call for the same record: already gone, and said so.
  assert.deepEqual(await records.deleteEvent('marc', 'ev1'), { person: 'marc', id: 'ev1', deleted: false, tries: 1 })
  assert.deepEqual(await records.deleteContact('marc', 'ct9'), { person: 'marc', id: 'ct9', deleted: false, tries: 1 })
  // Only the record's own 404 means gone: a hub without these routes answers another one, and that is an error.
  hub.fail(404, null)
  const error = await refused(records.deleteEvent('marc', 'ev2'), 'unknown')
  assert.deepEqual([error.status, error.again, 'ev2' in hub.account('marc').events], [404, false, true])
  // A read of a record that is gone is refused, not "done".
  await refused(records.readEvent('marc', 'ev1'), 'event_not_found')
})

// Reads -----------------------------------------------------------------------------------------------------------------------

test('a read is sent again on 502, on another 5xx and on a dropped connection, with the pause the feed client uses', async (t) => {
  const { hub, records, logs } = await open(t, { tries: 4 })
  hub.drop() // the stand-in drops first, then answers the failures in the order given
  hub.fail(502, 'mail_unreachable')
  hub.fail(500, 'internal_error')
  assert.equal((await records.listCalendars('marc')).default, 'cal1')
  assert.deepEqual(hub.requests.map((q) => q.status), ['dropped', 502, 500, 200])
  assertGrowingPauses(logs, PAUSE)
  assert.deepEqual(logs.map((line) => line.why).slice(1), ['502 mail_unreachable', '500 internal_error'])
  assert.ok(logs.every((line) => !('may_have_written' in line)), 'a read writes nothing')
  // It gives up after its tries, and says whether another call can help.
  hub.fail(503, null, 9) // a proxy in front of the hub: no code
  const error = await refused(records.listEvents('marc'), 'unknown')
  assert.deepEqual([error.status, error.again, error.tries, error.writeAttempted], [503, true, 4, null])
})

test('a hub that is not there: hub_unreachable after the tries', async (t) => {
  const { hub, records } = await open(t)
  await hub.down()
  const error = await refused(records.listContacts('marc'), 'hub_unreachable')
  assert.deepEqual([error.status, error.again, error.tries], [0, true, 3])
  await hub.up()
  assert.equal((await records.listContacts('marc')).total, 2)
})

test('the caller can end a call at once', async (t) => {
  const { hub, records } = await open(t)
  hub.hold(5000)
  const stop = new AbortController()
  const at = Date.now()
  setTimeout(() => stop.abort(), 50)
  const error = await refused(records.listCalendars('marc', { signal: stop.signal }), 'aborted')
  assert.ok(Date.now() - at < 1000, `ending took ${Date.now() - at} ms with an answer 5 s away`)
  assert.equal(error.again, false)
  assert.equal(hub.requests.length, 1, 'and nothing is sent afterwards')
})

// Refusals --------------------------------------------------------------------------------------------------------------------

test('every refusal is one typed error with the hub code, and none is sent a second time', async (t) => {
  const { hub, records } = await open(t, { grant: ALL })
  const marc = hub.account('marc')
  marc.events.occ = { '@type': 'Event', uid: 'r1', title: 'Stand-up', baseEventId: 'ev4', start: marc.events.ev1.start, calendarIds: { cal1: true } }
  hub.person('nina', { role: 'member', account: { ...sampleAccount(), calendars: [{ id: 'tasks', name: 'Tasks', description: 'Task list' }], books: [] } })
  hub.person('paul', { role: 'member', active: false })
  hub.unknownField('shoeSize')
  const invalidValues = (properties) => () => hub.refuseValues({ type: 'invalidProperties', properties })
  // [the code, the call, what to arrange first, what to put back]
  const cases = [
    ['client_certificate_required', () => records.listCalendars('marc'), () => hub.fail(401, 'client_certificate_required')],
    ['invalid_client_certificate', () => records.listCalendars('marc'), () => hub.fail(401, 'invalid_client_certificate')],
    ['expired_client_certificate', () => records.listCalendars('marc'), () => hub.fail(401, 'expired_client_certificate')],
    ['module_not_active', () => records.listCalendars('marc'), () => hub.active(false), () => hub.active(true)],
    ['scope_required', () => records.listCalendars('marc'), () => hub.grant([WRITE, LOOK, EDIT]), () => hub.grant(ALL)],
    ['unknown_member', () => records.listCalendars('mem_nobody')],
    ['relation_required', () => records.listEvents({ person: 'luca', acting: 'olena' })],
    ['active_membership_required', () => records.listCalendars('paul')],
    ['permission_required', () => records.listCalendars('gus')], // a guest holds none of the four
    ['permission_required', () => records.createEvent('adam', lunch)], // an admin reads their own and does not write
    ['invalid_request', () => records.listEvents('marc', { limit: 0 })],
    ['invalid_range', () => records.listEvents('marc', { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' })],
    ['invalid_range', () => records.listEvents('marc', { from: '2026-01-01T00:00:00Z', to: '2027-06-01T00:00:00Z' })],
    ['invalid_fields', () => records.listContacts('marc', { fields: ['name', 'shoeSize'] })],
    ['invitations_not_supported', () => records.createEvent('marc', { ...lunch, participants: { p1: { name: 'Ruth Example' } } })],
    ['invitations_not_supported', () => records.changeEvent('marc', 'ev1', { 'recurrenceOverrides/2026-12-01T10:00:00/participants': {} })],
    ['mail_not_configured', () => records.listCalendars('marc'), () => hub.mail(false), () => hub.mail(true)],
    ['mail_access_refused', () => records.listCalendars('ruth')],
    ['no_calendar', () => records.listCalendars('nina')],
    ['no_address_book', () => records.listAddressBooks('nina')],
    ['event_not_found', () => records.readEvent('marc', 'nope')],
    ['event_not_found', () => records.readEvent('marc', 'tk1')], // a task is not an event
    ['event_not_found', () => records.changeEvent('marc', 'nope', { title: 'x' })],
    ['contact_not_found', () => records.readContact('marc', 'nope')],
    ['contact_not_found', () => records.changeContact('marc', 'nope', { kind: 'org' })],
    ['unknown_calendar', () => records.createEvent('marc', lunch, { calendar: 'tasks' })],
    ['unknown_calendar', () => records.listEvents('marc', { calendar: 'nowhere' })],
    ['unknown_address_book', () => records.createContact('marc', card, { addressBook: 'nowhere' })],
    ['invalid_event', () => records.createEvent('marc', { ...lunch, start: 'noon' }), invalidValues(['start', 'duration']), () => hub.refuseValues(null), ['duration', 'start']],
    ['invalid_contact', () => records.createContact('marc', card), invalidValues(['emails/e1/address']), () => hub.refuseValues(null), ['emails']],
    ['filter_not_supported', () => records.listContacts('marc', { text: 'nora' }), () => hub.filters(false), () => hub.filters(true)],
    ['event_has_guests', () => records.changeEvent('marc', 'ev3', { title: 'x' })],
    ['event_has_guests', () => records.deleteEvent('marc', 'ev3')],
    ['event_is_occurrence', () => records.changeEvent('marc', 'occ', { title: 'x' })],
    ['over_quota', () => records.createEvent('marc', lunch), () => hub.refuseValues({ type: 'overQuota' }), () => hub.refuseValues(null)],
    ['too_large', () => records.createContact('marc', card), () => hub.refuseValues({ type: 'tooLarge' }), () => hub.refuseValues(null)],
  ]
  const before = JSON.stringify(marc)
  for (const [code, call, arrange, restore, properties] of cases) {
    arrange?.()
    const sent = hub.requests.length
    const error = await refused(call(), code)
    restore?.()
    assert.equal(hub.requests.length, sent + 1, `${code} was sent ${hub.requests.length - sent} times`)
    assert.deepEqual([error.status, error.again, error.tries, error.message], [RECORDS_ERRORS[code].status, false, 1, code], code)
    assert.deepEqual(error.properties, properties ?? [], code)
    assert.equal(error.say, RECORDS_ERRORS[code].say)
  }
  assert.equal(JSON.stringify(marc), before, 'and none of them wrote anything')
  // The list of codes an app switches on is the list above, plus the ones proven elsewhere in this file.
  const elsewhere = ['acting_member_required', 'idempotency_key_required', 'mail_unreachable', 'hub_unreachable', 'no_hub', 'unexpected_answer', 'aborted']
  assert.deepEqual([...new Set([...cases.map(([code]) => code), ...elsewhere])].sort(), Object.keys(RECORDS_ERRORS).sort())
})

test('contacts.write cannot be asked for in a manifest yet: the three contact writes answer scope_required', async (t) => {
  const { hub, records } = await open(t) // the grant a real module can hold today
  assert.deepEqual(GRANT_TODAY, [READ, WRITE, LOOK])
  for (const call of [() => records.createContact('marc', card), () => records.changeContact('marc', 'ct1', { kind: 'org' }), () => records.deleteContact('marc', 'ct1')]) {
    const error = await refused(call(), 'scope_required')
    assert.deepEqual([error.status, error.again, error.tries], [403, false, 1])
  }
  assert.equal(Object.keys(hub.account('marc').cards).length, 2)
  // The nine other functions work with that grant.
  assert.equal((await records.readContact('marc', 'ct1')).id, 'ct1')
  assert.equal((await records.createEvent('marc', lunch)).created, true)
})

test('what cannot be a member, a record id, a field or a key is refused before anything is sent', async (t) => {
  const { hub, records } = await open(t, { grant: ALL })
  const local = [
    [records.listCalendars('a b'), 'unknown_member'],
    [records.listCalendars('../../services/module/me'), 'unknown_member'],
    [records.listCalendars({ person: 'marc', acting: '' }), 'acting_member_required'],
    [records.listCalendars({ person: 'marc' }), 'acting_member_required'],
    [records.readEvent('marc', 'ev1/../ev2'), 'invalid_request'],
    [records.deleteContact('marc', ''), 'invalid_request'],
    [records.listEvents('marc', { calendar: 'a b' }), 'invalid_request'],
    [records.listContacts('marc', { position: -1 }), 'invalid_request'],
    [records.listEvents('marc', { fields: ['title', 'a,b'] }), 'invalid_fields'],
    [records.readContact('marc', 'ct1', { fields: [] }), 'invalid_fields'],
    [records.createEvent('marc', lunch, { key: 'short' }), 'idempotency_key_required'],
    [records.createContact('marc', card, { key: 'a key with spaces' }), 'idempotency_key_required'],
  ]
  for (const [promise, code] of local) {
    const error = await refused(promise, code)
    assert.deepEqual([error.tries, error.status, error.again], [0, RECORDS_ERRORS[code].status, false], code)
  }
  assert.equal(hub.requests.length, 0)
  // An id with the characters Brax Mail uses goes through whole.
  hub.account('marc').events['a.b:c@d+e-f_g'] = { '@type': 'Event', title: 'Odd id', calendarIds: { cal1: true } }
  assert.equal((await records.readEvent('marc', 'a.b:c@d+e-f_g', { fields: ['title'] })).title, 'Odd id')
})

test('an answer that is not what the route gives, and a client with no hub, are said as the same error', async (t) => {
  const { hub, records } = await open(t)
  hub.fail(200, 'not_an_envelope')
  const odd = await refused(records.listCalendars('marc'), 'unexpected_answer')
  assert.deepEqual([odd.status, odd.again, odd.tries], [200, false, 1])
  // What hub/records.server.ts gives an app that runs without a hub: every call rejects with no_hub, nothing is sent.
  const nowhere = createHubRecords({ call: () => Promise.reject(new HubRecordsError({ code: 'no_hub', what: 'call' })), pause: PAUSE })
  const error = await refused(nowhere.listEvents('marc'), 'no_hub')
  assert.deepEqual([error.again, error.say], [false, RECORDS_ERRORS.no_hub.say])
})

test('the list of codes says for each whether the same call again can help, and what a person is shown', () => {
  const again = Object.entries(RECORDS_ERRORS).filter(([, meaning]) => meaning.again).map(([code]) => code)
  assert.deepEqual(again, ['mail_unreachable', 'hub_unreachable'], 'only a hub or a Brax Mail that did not answer')
  for (const [code, meaning] of Object.entries(RECORDS_ERRORS)) {
    assert.ok(meaning.say.length > 10 && /[.]$/.test(meaning.say), `${code} has a sentence`)
    assert.ok(!/\bedge\b|LCC|Stalwart|JMAP|\b[45]\d\d\b/.test(meaning.say), `${code}: a person is not shown ${meaning.say}`)
  }
  assert.deepEqual([recordsRefusal('something_new', 500).again, recordsRefusal('something_new', 409).again], [true, false], 'a code this file does not know: by its status')
  assert.deepEqual(Object.keys(RECORDS_FEED_KINDS), ['calendar_event.created', 'calendar_event.changed', 'calendar_event.deleted', 'contact.created', 'contact.changed', 'contact.deleted'])
  assert.deepEqual([...new Set(Object.values(RECORDS_SCOPES))].sort(), [...ALL].sort())
})

// Against a real hub, and the same against the stand-in so the checks themselves are proven -------------------------------------

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
    person: 'marc',
    write: true,
    async open(t) {
      return (await open(t)).records
    },
  },
  {
    name: 'real hub',
    skip: !realAddress ? 'HUB_TEST_URL and HUB_TEST_CREDENTIAL_DIR are not set' : !process.env.HUB_TEST_PERSON ? 'HUB_TEST_PERSON is not set' : false,
    person: process.env.HUB_TEST_PERSON,
    write: process.env.HUB_TEST_WRITE === '1',
    async open(t) {
      const transport = hubTransport(realAddress, { connections: 2 })
      t.after(() => transport.close())
      return createHubRecords({ call: transport.call })
    },
  },
]

for (const target of HUBS) {
  const { name, skip, person } = target
  const noWrite = skip || (target.write ? false : 'HUB_TEST_WRITE is not 1')

  test(`${name}: the person's calendars, and their events with ids and the fields chosen`, { skip }, async (t) => {
    const records = await target.open(t)
    const calendars = await records.listCalendars(person)
    assert.equal(calendars.person, person)
    assert.ok(calendars.calendars.length >= 1 && calendars.calendars.some((row) => row.id === calendars.default), 'the default is one of the calendars')
    for (const row of calendars.calendars) assert.deepEqual([typeof row.id, typeof row.name, typeof row.is_default, typeof row.may_write], ['string', 'string', 'boolean', 'boolean'])
    const listed = await records.listEvents(person, { from: new Date(Date.now() - 30 * 86_400_000), to: new Date(Date.now() + 30 * 86_400_000), limit: 5, fields: ['title', 'start'] })
    assert.deepEqual([listed.person, typeof listed.count, typeof listed.truncated, typeof listed.from, typeof listed.to], [person, 'number', 'boolean', 'string', 'string'])
    assert.ok(listed.events.length <= 5 && listed.count >= listed.events.length)
    for (const event of listed.events) {
      assert.equal(typeof event.id, 'string')
      assert.ok(Object.keys(event).every((property) => ['id', 'title', 'start'].includes(property)), `only the fields asked for: ${Object.keys(event)}`)
    }
    if (listed.events[0]) assert.equal((await records.readEvent(person, listed.events[0].id, { fields: '*' })).id, listed.events[0].id)
    else console.log(`${name}: no event within 30 days of today in this calendar; reading one by id was not checked`)
  })

  test(`${name}: the person's address books, and a page of their contacts`, { skip }, async (t) => {
    const records = await target.open(t)
    const books = await records.listAddressBooks(person)
    assert.ok(books.address_books.some((row) => row.id === books.default), 'the default is one of the address books')
    const first = await records.listContacts(person, { limit: 1, fields: ['name'] })
    assert.deepEqual([first.person, first.position], [person, 0])
    assert.ok(first.contacts.length <= 1 && (first.total === null || first.total >= first.contacts.length))
    if (first.contacts[0]) {
      assert.equal((await records.readContact(person, first.contacts[0].id)).id, first.contacts[0].id)
      const second = await records.listContacts(person, { position: 1, limit: 1, fields: ['name'] })
      assert.equal(second.position, 1)
      if (second.contacts[0]) assert.notEqual(second.contacts[0].id, first.contacts[0].id, 'the second page is not the first again')
    } else console.log(`${name}: this address book is empty; reading one contact and a second page were not checked`)
  })

  test(`${name}: a person the hub does not have is refused once, with the code`, { skip }, async (t) => {
    const records = await target.open(t)
    const error = await refused(records.listCalendars('mem_nobody_0000'), 'unknown_member')
    assert.deepEqual([error.status, error.again, error.tries], [422, false, 1])
  })

  test(`${name}: an event sent twice with one key is one event; it is changed, deleted, and deleted again`, { skip: noWrite }, async (t) => {
    const records = await target.open(t)
    const key = newIdempotencyKey()
    const start = `${new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)}T12:00:00`
    const event = { title: 'Kit test event (safe to delete)', start, timeZone: 'Etc/UTC', duration: 'PT30M' }
    let made = null
    t.after(async () => {
      if (made) await records.deleteEvent(person, made.id).catch(() => {})
    })
    made = await records.createEvent(person, event, { key })
    assert.deepEqual([made.person, made.created, made.key, typeof made.id, typeof made.uid], [person, true, key, 'string', 'string'])
    const again = await records.createEvent(person, event, { key })
    assert.deepEqual([again.id, again.uid, again.created], [made.id, made.uid, false], 'the same key again writes nothing')
    const stored = await records.readEvent(person, made.id, { fields: ['title', 'start', 'duration', 'uid'] })
    assert.deepEqual(stored, { id: made.id, title: event.title, start, duration: 'PT30M', uid: made.uid })
    assert.equal((await records.changeEvent(person, made.id, { title: 'Kit test event (changed)' })).id, made.id)
    assert.equal((await records.readEvent(person, made.id, { fields: ['title'] })).title, 'Kit test event (changed)')
    assert.equal((await records.deleteEvent(person, made.id)).deleted, true)
    assert.equal((await records.deleteEvent(person, made.id)).deleted, false, 'a second delete is done, not an error')
    await refused(records.readEvent(person, made.id), 'event_not_found')
    await refused(records.createEvent(person, { ...event, participants: { p1: { name: 'A guest' } } }), 'invitations_not_supported')
  })

  test(`${name}: a contact write is refused with scope_required today, or it works and is removed again`, { skip: noWrite }, async (t) => {
    const records = await target.open(t)
    let made = null
    try {
      made = await records.createContact(person, { kind: 'individual', name: { full: 'Kit Test Contact (safe to delete)' } })
    } catch (error) {
      if (!(error instanceof HubRecordsError) || error.code !== 'scope_required') throw error
      console.log(`${name}: the module does not hold contacts.write (no manifest can ask for it yet); the three contact writes are refused, as expected today`)
      return
    }
    assert.equal(made.created, true)
    assert.equal((await records.deleteContact(person, made.id)).deleted, true)
  })
}
