#!/usr/bin/env node
// A local stand-in for the hub's routes over a person's calendar and address book in Brax Mail (the hub server's
// app/module_records.py and app/mail_records.py, TASKS APM20), so a module's use of them and the kit's client
// (src/server/hub/records.ts) are testable without a hub and without a Brax Mail. It answers the twelve routes under
// /services/module/people/{person}/ the way the hub's own tests show:
//
//   - who is refused, in the hub's order: 403 `module_not_active`, 403 `scope_required` (the grant), 422
//     `acting_member_required` and `unknown_member`, 403 `relation_required`, `active_membership_required` and
//     `permission_required` (an owner and a member read and write their own records, an admin reads them, a guest
//     nothing);
//   - then the arguments (422 `invalid_request`, `invalid_range`, `invalid_fields`, `idempotency_key_required`,
//     `invitations_not_supported`), then what Brax Mail would say: 503 `mail_not_configured`, 403
//     `mail_access_refused`, 409 `no_calendar` and `no_address_book`, 404 `event_not_found` and `contact_not_found`,
//     422 `unknown_calendar` and `unknown_address_book`, 409 `event_has_guests` and `event_is_occurrence`, and on
//     demand 422 `invalid_event` and `invalid_contact` with `properties`, 422 `filter_not_supported`, 409
//     `over_quota`, 413 `too_large`, 502 `mail_unreachable` with `write_attempted`;
//   - a create repeated with its `Idempotency-Key` answers the first record with `created: false` and writes nothing;
//     a delete repeated answers 404; a page of contacts from `position` with `total`; `fields`, with `id` always.
//
// The grant is what a real module can hold today: `calendar.read`, `calendar.write`, `contacts.read`. No manifest can
// ask for `contacts.write` yet (the manifest validator does not list it), so the three contact writes answer 403
// `scope_required` here as on a hub, until `--contacts-write` (or grant()) says otherwise.
//
// What it is not: it checks no certificate and no consent, writes no audit entry and no feed event, expands no
// repeating event (`expand=true` lists the stored event once) and reads a repeating event as matching from its first
// start on. What a module may do is the hub's to decide and the hub's tests' to prove; nothing here has been compared
// with a real Brax Mail.
//
//   node tooling/hub-records-stub.mjs serve [--port 38411] [--contacts-write]
//   node tooling/hub-records-stub.mjs fail 502 mail_unreachable [--times 3]   (the next calls are refused this way)
//   node tooling/hub-records-stub.mjs lose [--times 1]        (the next write is made and its answer lost: 502 with
//                                                              write_attempted true)
//   node tooling/hub-records-stub.mjs grant calendar.read,contacts.read       (the module's grant from now on)
//
// With `serve` running, `HUB_RECORDS_URL=http://127.0.0.1:38411 npm run dev` makes the app call it (APP_ENV=local
// only). It knows the stub edge's four members (dev-owner, dev-admin, dev-member, dev-viewer), each with a calendar of
// invented events around today and a small address book of invented people. tooling/records.test.mjs drives the same
// stand-in in process through standInRecordsHub(), which can also drop connections, hold an answer and refuse values.
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

export const PORT = Number(process.env.HUB_RECORDS_STUB_PORT ?? 38411)
export const BASE = '/services/module/people'
export const READ = 'calendar.read'
export const WRITE = 'calendar.write'
export const LOOK = 'contacts.read'
export const EDIT = 'contacts.write'
/** What a manifest of today can ask for: every permission of these routes but `contacts.write`. */
export const GRANT_TODAY = [READ, WRITE, LOOK]

const MEMBER = /^[A-Za-z0-9_.:-]{1,128}$/
const RECORD_ID = /^[A-Za-z0-9._:@+-]{1,255}$/
const FIELD = /^[A-Za-z@][A-Za-z0-9.:_-]{0,63}$/
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/
const NAME = /^[A-Za-z0-9._:-]{1,64}$/
const MOMENT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/
const DURATION = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
const MAX_FIELDS = 40
const MAX_EVENT_BODY = 65536
const MAX_CONTACT_BODY = 1048576
const MAX_DEPTH = 32
const MAX_PATH = 255
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500
const MAX_WHOLE_CARDS = 50
const MAX_TEXT = 200
const DAY = 86_400_000
const TASK_LIST = 'Task list'
const INVITING = new Set(['participants', 'replyto', 'organizercalendaraddress'])
const EVENT_FIXED = new Set(['id', 'uid', 'calendarids', 'baseeventid', 'utcstart', 'utcend', 'isdraft', 'isorigin', 'method', 'prodid'])
const CONTACT_FIXED = new Set(['id', 'uid', 'addressbookids'])
const EVENT_FIELDS = ['calendarIds', 'uid', 'title', 'start', 'duration', 'timeZone', 'showWithoutTime', 'locations']
const CONTACT_FIELDS = ['addressBookIds', 'uid', 'kind', 'name', 'organizations', 'emails', 'phones']
/** What each default role holds over their own records (CONTRACT-PERMISSIONS-0.1 section 7, as the hub's tests ask it). */
const ROLE_HOLDS = { owner: [READ, WRITE, LOOK, EDIT], member: [READ, WRITE, LOOK, EDIT], admin: [READ, LOOK], guest: [] }

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const refusal = (status, code, extra = {}) => Object.assign(new Error(code), { status, code, extra })
const invalid = (code = 'invalid_request') => refusal(422, code)
const digest = (module, person, key) => createHash('sha256').update(`${module}\0${person}\0${key}`).digest()

/** `brax-` and 32 hex digits over the module, the person and the key: the hub's `event_uid`. */
export const eventUid = (module, person, key) => `brax-${digest(module, person, key).toString('hex').slice(0, 32)}`

/** `urn:uuid:` and a UUID made from the same digest: the hub's `contact_uid`. */
export function contactUid(module, person, key) {
  const bytes = digest(module, person, key).subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// Times: enough of JSCalendar to say whether an event is in a range ------------------------------------------------------

/** The instant of a local date-time in a zone; with no zone (a floating event) it is read as UTC. */
function instant(local, zone) {
  const m = LOCAL.exec(typeof local === 'string' ? local : '')
  if (!m) return null
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  if (typeof zone !== 'string' || !zone) return utc
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(utc)).map((p) => [p.type, +p.value]))
    return utc - (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - utc)
  } catch {
    return utc
  }
}

function span(duration) {
  const m = DURATION.exec(typeof duration === 'string' ? duration : '')
  if (!m) return 0
  return (+(m[1] ?? 0) * 7 + +(m[2] ?? 0)) * DAY + +(m[3] ?? 0) * 3_600_000 + +(m[4] ?? 0) * 60_000 + +(m[5] ?? 0) * 1000
}

/** [begin, end] of an event in milliseconds, or null without a readable start. */
function times(event) {
  const begin = instant(event.start, event.showWithoutTime === true ? null : event.timeZone)
  if (begin === null) return null
  return [begin, begin + (event.showWithoutTime === true ? Math.max(DAY, span(event.duration)) : span(event.duration))]
}

const rfc3339 = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
const local = (ms) => new Date(ms).toISOString().slice(0, 19)

// Records ---------------------------------------------------------------------------------------------------------------

const repeats = (event) => ['recurrenceRule', 'recurrenceRules', 'recurrenceOverrides'].some((name) => event[name])
const isEvent = (record) => isObject(record) && (record['@type'] ?? 'Event') === 'Event'

/** The names a key reaches, lower case: the steps of a patch path, `~1` read as the `/` it stands for. */
const stepsOf = (key) => key.split('/').flatMap((step) => step.replaceAll('~1', '/').replaceAll('~0', '~').split('/')).map((part) => part.toLowerCase())

/** Whether an event or a patch of one names a guest, a reply address or an organizer, at any depth. */
function inviting(value) {
  const stack = [value]
  while (stack.length) {
    const item = stack.pop()
    if (Array.isArray(item)) stack.push(...item)
    else if (isObject(item)) {
      for (const [key, inner] of Object.entries(item)) {
        if (stepsOf(key).some((part) => INVITING.has(part))) return true
        stack.push(inner)
      }
    }
  }
  return false
}

function tooDeep(value, depth) {
  if (!isObject(value) && !Array.isArray(value)) return false
  if (depth <= 0) return true
  return Object.values(value).some((inner) => tooDeep(inner, depth - 1))
}

/** The properties a module may write, or 422: the hub's `written`. */
function written(record, fixed, kind, patch) {
  if (!isObject(record) || !Object.keys(record).length) throw invalid()
  const out = {}
  for (const [name, value] of Object.entries(record)) {
    const steps = name.split('/')
    const pathRefused = steps.length > 1 && (!patch || steps.includes(''))
    if (name.length > MAX_PATH || !FIELD.test(steps[0]) || fixed.has(steps[0].toLowerCase()) || pathRefused) throw invalid()
    if (steps[0].toLowerCase() === '@type') {
      if (name !== '@type' || value !== kind || patch) throw invalid()
      continue
    }
    if (value === null && !patch) throw invalid()
    out[name] = value
  }
  if (!Object.keys(out).length) throw invalid()
  return out
}

/** A JMAP PatchObject applied: a name or a path, null removes. */
function patched(record, patch) {
  for (const [path, value] of Object.entries(patch)) {
    const steps = path.split('/')
    let at = record
    for (const step of steps.slice(0, -1)) at = isObject(at[step]) ? at[step] : (at[step] = {})
    if (value === null) delete at[steps.at(-1)]
    else at[steps.at(-1)] = value
  }
  return record
}

const chosen = (record, id, fields) => (fields === null ? { ...record, id } : { id, ...Object.fromEntries(fields.filter((name) => name in record).map((name) => [name, record[name]])) })

const collection = (row) => ({
  id: row.id,
  name: typeof row.name === 'string' ? row.name : '',
  description: typeof row.description === 'string' ? row.description : null,
  color: typeof row.color === 'string' ? row.color : null,
  sort_order: Number.isInteger(row.sortOrder) ? row.sortOrder : 0,
  is_default: row.isDefault === true,
  may_write: isObject(row.myRights) ? Boolean(row.myRights.mayWriteAll || row.myRights.mayWriteOwn || row.myRights.mayWrite) : true,
})

function defaultOf(rows) {
  const marked = rows.find((row) => row.isDefault === true)
  if (marked) return marked.id
  return [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.id < b.id ? -1 : 1))[0]?.id ?? null
}

/**
 * A person's Brax Mail account as the stand-in keeps it: invented events around `now` and invented people. One event
 * has a guest (it cannot be changed here), one repeats, and one record is a task, which the routes never show.
 */
export function sampleAccount(now = Date.now()) {
  const day = (n, time) => `${local(Math.floor(now / DAY) * DAY + n * DAY).slice(0, 10)}T${time}`
  return {
    calendars: [
      { id: 'cal1', name: 'Calendar', isDefault: true, sortOrder: 0, myRights: { mayReadItems: true, mayWriteAll: true } },
      { id: 'cal2', name: 'Family', isDefault: false, sortOrder: 1 },
      { id: 'tasks', name: 'Tasks', description: TASK_LIST, isDefault: false, sortOrder: 2 },
    ],
    books: [
      { id: 'ab1', name: 'Contacts', isDefault: true, sortOrder: 0 },
      { id: 'ab2', name: 'Work', sortOrder: 1 },
    ],
    events: {
      ev1: { '@type': 'Event', uid: 'u1', title: 'Dentist', start: day(1, '10:00:00'), timeZone: 'Etc/UTC', duration: 'PT1H', calendarIds: { cal1: true }, description: 'Bring the x-ray', locations: { l1: { '@type': 'Location', name: 'Clinic' } } },
      ev2: { '@type': 'Event', uid: 'u2', title: 'Football practice', start: day(2, '17:00:00'), timeZone: 'Etc/UTC', duration: 'PT90M', calendarIds: { cal2: true } },
      ev3: { '@type': 'Event', uid: 'u3', title: 'Board meeting', start: day(3, '09:00:00'), timeZone: 'Etc/UTC', duration: 'PT2H', calendarIds: { cal1: true }, participants: { p1: { name: 'Ruth Example', calendarAddress: 'mailto:ruth@example.org' } } },
      ev4: { '@type': 'Event', uid: 'u4', title: 'Team stand-up', start: day(-28, '08:30:00'), timeZone: 'Etc/UTC', duration: 'PT15M', calendarIds: { cal1: true }, recurrenceRule: { '@type': 'RecurrenceRule', frequency: 'weekly' } },
      tk1: { '@type': 'Task', uid: 't1', title: 'Buy milk', start: day(1, '08:00:00'), timeZone: 'Etc/UTC', calendarIds: { tasks: true } },
    },
    cards: {
      ct1: { '@type': 'Card', version: '1.0', uid: 'urn:uuid:00000000-0000-4000-8000-000000000001', kind: 'individual', name: { full: 'Nora Lind' }, emails: { e1: { address: 'nora.lind@example.org' } }, notes: { n1: { note: 'Met at the fair' } }, addressBookIds: { ab1: true } },
      ct2: { '@type': 'Card', version: '1.0', uid: 'urn:uuid:00000000-0000-4000-8000-000000000002', kind: 'individual', name: { full: 'Tomas Reyes' }, phones: { p1: { number: '+15550100' } }, organizations: { o1: { name: 'Example Works' } }, addressBookIds: { ab2: true } },
    },
    calendarCapability: true,
    contactsCapability: true,
  }
}

/** The members the stub edge knows (tooling/dev-member.ts), by the hub role each has. */
export const DEV_PEOPLE = { 'dev-owner': 'owner', 'dev-admin': 'admin', 'dev-member': 'member', 'dev-viewer': 'member' }

/**
 * Start a stand-in hub on 127.0.0.1. `slug` is the module it believes it is called by (a create's uid is made from
 * it); `grant` the module's permissions; `people` the members, `{ id: role }`, each given sampleAccount(); `log` gets
 * a line a request.
 */
export async function standInRecordsHub({ port = 0, slug = 'example', grant = GRANT_TODAY, people = DEV_PEOPLE, now = () => Date.now(), log = null } = {}) {
  const state = { grant: new Set(grant), active: true, mail: true, people: new Map(), relations: [], failures: [], drops: 0, lost: 0, dropsAfter: 0, holds: [], setError: null, filters: true, unknownFields: new Set(), requests: [] }
  const sockets = new Set()
  const held = new Set()

  function send(res, status, body) {
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(text) })
    res.end(text)
  }

  // Arguments, as the hub reads them ---------------------------------------------------------------------------------

  function fieldsOf(text, usual) {
    if (text === null || text === '') return [...usual]
    if (text === '*') return null
    const names = text.split(',')
    if (names.length > MAX_FIELDS || !names.every((name) => FIELD.test(name))) throw invalid('invalid_fields')
    return names
  }
  function number(text, usual, low, high) {
    if (text === null) return usual
    if (!/^[0-9]{1,9}$/.test(text) || Number(text) < low || Number(text) > high) throw invalid()
    return Number(text)
  }
  function recordId(text, code = 'invalid_request') {
    if (typeof text !== 'string' || !RECORD_ID.test(text)) throw invalid(code)
    return text
  }
  function only(query, allowed) {
    for (const name of query.keys()) if (!allowed.includes(name)) throw invalid()
  }
  function moment(text) {
    const m = MOMENT.exec(text)
    if (!m) throw invalid()
    const at = Date.parse(text)
    if (Number.isNaN(at)) throw invalid()
    return at
  }
  function eventsPlan(query) {
    only(query, ['from', 'to', 'calendar', 'fields', 'limit', 'expand'])
    const from = query.has('from') ? moment(query.get('from')) : now()
    const to = query.has('to') ? moment(query.get('to')) : null
    if (!['true', 'false'].includes(query.get('expand') ?? 'false')) throw invalid()
    const end = to ?? from + 7 * DAY
    if (!(end > from) || end - from > 366 * DAY) throw invalid('invalid_range')
    return {
      from,
      to: end,
      fromText: query.get('from') || rfc3339(from),
      toText: query.get('to') || rfc3339(end),
      expand: query.get('expand') === 'true',
      calendar: query.has('calendar') ? recordId(query.get('calendar')) : null,
      limit: number(query.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT),
      fields: fieldsOf(query.get('fields'), EVENT_FIELDS),
    }
  }
  function contactsPlan(query) {
    only(query, ['address_book', 'text', 'fields', 'limit', 'position'])
    const text = query.get('text')
    if (text !== null && !(text.length >= 1 && text.length <= MAX_TEXT)) throw invalid()
    return {
      addressBook: query.has('address_book') ? recordId(query.get('address_book')) : null,
      text,
      position: number(query.get('position'), 0, 0, 10_000_000),
      limit: number(query.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT),
      fields: fieldsOf(query.get('fields'), CONTACT_FIELDS),
    }
  }
  function onlyFields(query, usual) {
    only(query, ['fields'])
    return fieldsOf(query.get('fields'), usual)
  }
  /** `{<record>: {...}, <place>?: id}` as JSON, at most `limit` bytes. */
  function bodyOf(req, raw, limit, record, place) {
    const kind = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (kind !== 'application/json' || raw.length > limit) throw invalid()
    let body = null
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      body = null
    }
    if (!isObject(body) || !(record in body) || Object.keys(body).some((name) => name !== record && name !== place) || tooDeep(body, MAX_DEPTH)) throw invalid()
    return [body[record], body[place] != null ? recordId(body[place]) : null]
  }
  function idempotencyKey(req) {
    const key = req.headers['idempotency-key'] ?? ''
    if (!IDEMPOTENCY_KEY.test(key)) throw invalid('idempotency_key_required')
    return key
  }

  // Who may: the module, then the person, before anything of Brax Mail ----------------------------------------------------

  function checked(req, person, key) {
    if (!state.active) throw refusal(403, 'module_not_active')
    if (!state.grant.has(key)) throw refusal(403, 'scope_required')
    if (!MEMBER.test(person)) throw invalid('unknown_member')
    const acting = req.headers['brax-acting-member'] ?? ''
    if (!acting) throw invalid('acting_member_required')
    const whose = state.people.get(person)
    if (!whose) throw invalid('unknown_member')
    if (acting !== person && !state.relations.some((r) => r.acting === acting && r.person === person && r.keys.includes(key))) throw refusal(403, 'relation_required')
    const by = state.people.get(acting)
    if (!by || !by.active || !whose.active) throw refusal(403, 'active_membership_required')
    if (acting === person && !(whose.holds ?? ROLE_HOLDS[whose.role] ?? []).includes(key)) throw refusal(403, 'permission_required')
    return whose
  }

  /** The person's account, or Brax Mail's refusal. */
  function account(whose) {
    if (!state.mail) throw refusal(503, 'mail_not_configured')
    if (!whose.mailbox) throw refusal(403, 'mail_access_refused')
    return whose.account
  }
  function ownCalendars(mail) {
    const own = mail.calendarCapability ? mail.calendars.filter((row) => row.description !== TASK_LIST) : []
    if (!own.length) throw refusal(409, 'no_calendar')
    return own
  }
  function calendarAccount(mail) {
    if (!mail.calendarCapability) throw refusal(409, 'no_calendar')
  }
  function ownBooks(mail) {
    if (!mail.contactsCapability || !mail.books.length) throw refusal(409, 'no_address_book')
    return mail.books
  }
  function contactsAccount(mail) {
    if (!mail.contactsCapability) throw refusal(409, 'no_address_book')
  }
  function storedEvent(mail, id) {
    const event = mail.events[id]
    if (!event || !isEvent(event)) throw refusal(404, 'event_not_found')
    return event
  }
  function writableEvent(mail, id) {
    const event = storedEvent(mail, id)
    if (event.baseEventId) throw refusal(409, 'event_is_occurrence')
    if (inviting(event)) throw refusal(409, 'event_has_guests')
    return event
  }
  /** Brax Mail refusing a create or a change, as refuseValues() set it. */
  function setRefused(kind, missing) {
    const error = state.setError
    if (!error) return
    if (error.type === 'notFound') throw refusal(404, missing)
    if (error.type === 'invalidProperties' || error.type === 'invalidPatch') {
      const first = new Set((Array.isArray(error.properties) ? error.properties : []).filter((n) => typeof n === 'string').map((n) => n.split('/')[0]))
      throw refusal(422, kind, { properties: [...first].filter((n) => NAME.test(n)).sort() })
    }
    if (error.type === 'overQuota') throw refusal(409, 'over_quota')
    if (error.type === 'tooLarge' || error.type === 'requestTooLarge') throw refusal(413, 'too_large')
    throw refusal(502, 'mail_unreachable', { write_attempted: true })
  }
  const newId = (prefix) => prefix + randomBytes(4).toString('hex')

  // The twelve routes: each returns [status, body, whether it wrote] ------------------------------------------------------

  const routes = {
    'GET calendars'(req, whose, query) {
      only(query, [])
      const own = ownCalendars(account(whose))
      return [200, { calendars: own.map(collection), default: defaultOf(own) }]
    },
    'GET calendar/events'(req, whose, query) {
      const plan = eventsPlan(query)
      const mail = account(whose)
      const own = new Set(ownCalendars(mail).map((row) => row.id))
      if (plan.calendar !== null && !own.has(plan.calendar)) throw invalid('unknown_calendar')
      const matched = []
      for (const [id, event] of Object.entries(mail.events)) {
        if (!isEvent(event)) continue
        const inside = Object.keys(event.calendarIds ?? {})
        if (inside.length && !inside.some((calendar) => own.has(calendar))) continue
        if (plan.calendar !== null && !inside.includes(plan.calendar)) continue
        const shown = times(event)
        if (shown === null) matched.push([null, id, event])
        else if (repeats(event) ? shown[0] < plan.to : shown[1] > plan.from && shown[0] < plan.to) matched.push([repeats(event) && !plan.expand ? null : shown[0], id, event])
      }
      matched.sort((a, b) => (a[0] === null) - (b[0] === null) || (a[0] ?? 0) - (b[0] ?? 0) || (a[1] < b[1] ? -1 : 1))
      const events = matched.slice(0, plan.limit).map(([, id, event]) => chosen(event, id, plan.fields))
      return [200, { from: plan.fromText, to: plan.toText, count: matched.length, truncated: matched.length > events.length, events }]
    },
    'GET calendar/events/{id}'(req, whose, query, id) {
      const fields = onlyFields(query, EVENT_FIELDS)
      recordId(id)
      const mail = account(whose)
      calendarAccount(mail)
      return [200, { event: chosen(storedEvent(mail, id), id, fields) }]
    },
    'POST calendar/events'(req, whose, query, id, raw, person) {
      const key = idempotencyKey(req)
      const [given, calendar] = bodyOf(req, raw, MAX_EVENT_BODY, 'event', 'calendar')
      const event = written(given, EVENT_FIXED, 'Event', false)
      if (inviting(event)) throw invalid('invitations_not_supported')
      const mail = account(whose)
      const own = ownCalendars(mail)
      if (calendar !== null && !own.some((row) => row.id === calendar)) throw invalid('unknown_calendar')
      const uid = eventUid(slug, person, key)
      const earlier = Object.keys(mail.events).find((one) => mail.events[one].uid === uid)
      if (earlier) return [200, { id: earlier, uid, created: false }]
      setRefused('invalid_event', 'event_not_found')
      const made = newId('ev')
      mail.events[made] = { ...event, '@type': 'Event', uid, calendarIds: { [calendar ?? defaultOf(own)]: true } }
      return [201, { id: made, uid, created: true }, true]
    },
    'PATCH calendar/events/{id}'(req, whose, query, id, raw) {
      const [given, calendar] = bodyOf(req, raw, MAX_EVENT_BODY, 'event', 'calendar')
      const patch = !isObject(given) || Object.keys(given).length || calendar === null ? written(given, EVENT_FIXED, 'Event', true) : {}
      if (inviting(patch)) throw invalid('invitations_not_supported')
      recordId(id)
      const mail = account(whose)
      if (calendar !== null) {
        if (!ownCalendars(mail).some((row) => row.id === calendar)) throw invalid('unknown_calendar')
      } else calendarAccount(mail)
      const stored = writableEvent(mail, id)
      setRefused('invalid_event', 'event_not_found')
      patched(stored, calendar !== null ? { ...patch, calendarIds: { [calendar]: true } } : patch)
      return [200, { id, uid: typeof stored.uid === 'string' ? stored.uid : null, changed: true }, true]
    },
    'DELETE calendar/events/{id}'(req, whose, query, id) {
      recordId(id)
      const mail = account(whose)
      calendarAccount(mail)
      const stored = writableEvent(mail, id)
      delete mail.events[id]
      return [200, { id, uid: typeof stored.uid === 'string' ? stored.uid : null, deleted: true }, true]
    },
    'GET address-books'(req, whose, query) {
      only(query, [])
      const own = ownBooks(account(whose))
      return [200, { address_books: own.map(collection), default: defaultOf(own) }]
    },
    'GET address-book/contacts'(req, whose, query) {
      const plan = contactsPlan(query)
      const mail = account(whose)
      contactsAccount(mail)
      if (!state.filters && (plan.addressBook !== null || plan.text !== null)) throw invalid('filter_not_supported')
      let ids = Object.keys(mail.cards)
      if (plan.addressBook !== null) ids = ids.filter((id) => plan.addressBook in (mail.cards[id].addressBookIds ?? {}))
      if (plan.text !== null) ids = ids.filter((id) => JSON.stringify(mail.cards[id]).toLowerCase().includes(plan.text.toLowerCase()))
      // A card may carry its photo: a page of whole cards holds at most 50, whatever `limit` says.
      const limit = plan.fields === null ? Math.min(plan.limit, MAX_WHOLE_CARDS) : plan.limit
      if (plan.fields?.some((name) => state.unknownFields.has(name))) throw invalid('invalid_fields')
      return [200, { position: plan.position, total: ids.length, contacts: ids.slice(plan.position, plan.position + limit).map((id) => chosen(mail.cards[id], id, plan.fields)) }]
    },
    'GET address-book/contacts/{id}'(req, whose, query, id) {
      const fields = onlyFields(query, CONTACT_FIELDS)
      recordId(id)
      const mail = account(whose)
      contactsAccount(mail)
      if (!mail.cards[id]) throw refusal(404, 'contact_not_found')
      return [200, { contact: chosen(mail.cards[id], id, fields) }]
    },
    'POST address-book/contacts'(req, whose, query, id, raw, person) {
      const key = idempotencyKey(req)
      const [given, book] = bodyOf(req, raw, MAX_CONTACT_BODY, 'contact', 'address_book')
      const card = written(given, CONTACT_FIXED, 'Card', false)
      const mail = account(whose)
      const own = ownBooks(mail)
      if (book !== null && !own.some((row) => row.id === book)) throw invalid('unknown_address_book')
      const uid = contactUid(slug, person, key)
      const earlier = Object.keys(mail.cards).find((one) => mail.cards[one].uid === uid)
      if (earlier) return [200, { id: earlier, uid, created: false }]
      setRefused('invalid_contact', 'contact_not_found')
      const made = newId('ct')
      mail.cards[made] = { version: '1.0', ...card, '@type': 'Card', uid, addressBookIds: { [book ?? defaultOf(own)]: true } }
      return [201, { id: made, uid, created: true }, true]
    },
    'PATCH address-book/contacts/{id}'(req, whose, query, id, raw) {
      const [given, book] = bodyOf(req, raw, MAX_CONTACT_BODY, 'contact', 'address_book')
      const patch = !isObject(given) || Object.keys(given).length || book === null ? written(given, CONTACT_FIXED, 'Card', true) : {}
      recordId(id)
      const mail = account(whose)
      if (book !== null) {
        if (!ownBooks(mail).some((row) => row.id === book)) throw invalid('unknown_address_book')
      } else contactsAccount(mail)
      if (!mail.cards[id]) throw refusal(404, 'contact_not_found')
      setRefused('invalid_contact', 'contact_not_found')
      patched(mail.cards[id], book !== null ? { ...patch, addressBookIds: { [book]: true } } : patch)
      return [200, { id, changed: true }, true]
    },
    'DELETE address-book/contacts/{id}'(req, whose, query, id) {
      recordId(id)
      const mail = account(whose)
      contactsAccount(mail)
      if (!mail.cards[id]) throw refusal(404, 'contact_not_found')
      delete mail.cards[id]
      return [200, { id, deleted: true }, true]
    },
  }
  const KEYS = {
    'GET calendars': READ, 'GET calendar/events': READ, 'GET calendar/events/{id}': READ,
    'POST calendar/events': WRITE, 'PATCH calendar/events/{id}': WRITE, 'DELETE calendar/events/{id}': WRITE,
    'GET address-books': LOOK, 'GET address-book/contacts': LOOK, 'GET address-book/contacts/{id}': LOOK,
    'POST address-book/contacts': EDIT, 'PATCH address-book/contacts/{id}': EDIT, 'DELETE address-book/contacts/{id}': EDIT,
  }

  function decoded(part) {
    try {
      return decodeURIComponent(part)
    } catch {
      return part
    }
  }

  /** The route of a request: its name in `routes`, the person and the record's id; null when there is none. */
  function routeOf(method, pathname) {
    if (!pathname.startsWith(`${BASE}/`)) return null
    const [person, ...rest] = pathname.slice(BASE.length + 1).split('/')
    const under = rest.join('/')
    for (const plain of ['calendars', 'calendar/events', 'address-books', 'address-book/contacts']) {
      if (under === plain && routes[`${method} ${plain}`]) return { name: `${method} ${plain}`, person: decoded(person), id: null }
    }
    for (const records of ['calendar/events', 'address-book/contacts']) {
      const id = under.startsWith(`${records}/`) ? under.slice(records.length + 1) : ''
      if (id && !id.includes('/') && routes[`${method} ${records}/{id}`]) return { name: `${method} ${records}/{id}`, person: decoded(person), id: decoded(id) }
    }
    return null
  }

  function records(req, res, url, raw) {
    const route = routeOf(req.method, url.pathname)
    const seen = { at: Date.now(), method: req.method, path: url.pathname + url.search, route: route?.name ?? null, person: route?.person ?? null, acting: req.headers['brax-acting-member'] ?? null, key: req.headers['idempotency-key'] ?? null, status: null }
    state.requests.push(seen)
    const answer = (status, body) => {
      const finish = () => {
        seen.status = status
        log?.(`${new Date().toISOString()} ${seen.method} ${seen.path} -> ${status}${body?.error ? ` ${body.error.code}` : ''}`)
        if (!res.destroyed) send(res, status, body)
      }
      const hold = state.holds.shift()
      if (!hold) return finish()
      const timer = setTimeout(() => {
        held.delete(timer)
        finish()
      }, hold)
      held.add(timer)
    }
    const refused = (status, code, extra = {}) => answer(status, { error: { code, message: code, ...extra } })
    if (state.drops > 0) {
      state.drops--
      seen.status = 'dropped'
      return void req.socket.destroy()
    }
    if (state.failures.length) {
      const failure = state.failures.shift()
      return failure.code === null ? answer(failure.status, 'Bad Gateway') : refused(failure.status, failure.code, failure.extra)
    }
    // A route the hub does not have: FastAPI's own answer, which is not a record that is gone.
    if (!route) return answer(404, { detail: 'Not Found' })
    try {
      const whose = checked(req, route.person, KEYS[route.name])
      const [status, body, wrote] = routes[route.name](req, whose, url.searchParams, route.id, raw, route.person)
      if (wrote && state.dropsAfter > 0) {
        state.dropsAfter--
        seen.status = 'dropped_after_the_write'
        return void req.socket.destroy()
      }
      if (wrote && state.lost > 0) {
        state.lost--
        return refused(502, 'mail_unreachable', { write_attempted: true })
      }
      answer(status, { ...body, person: route.person })
    } catch (error) {
      if (!error.status) throw error
      refused(error.status, error.code, error.extra)
    }
  }

  function control(res, url, raw) {
    try {
      const body = raw.length ? JSON.parse(raw.toString('utf8')) : {}
      if (url.pathname === '/_stub/fail') return send(res, 200, { failing: hub.fail(Number(body.status), body.code ?? null, Number(body.times ?? 1)) })
      if (url.pathname === '/_stub/lose') return send(res, 200, { losing: hub.loseAnswer(Number(body.times ?? 1)) })
      if (url.pathname === '/_stub/grant') return send(res, 200, { grant: hub.grant(body.scopes ?? []) })
      send(res, 404, { detail: 'Not Found' })
    } catch (error) {
      send(res, 400, { detail: String(error.message ?? error) })
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub.local')
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= MAX_CONTACT_BODY + 1) chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks)
      try {
        if (req.method === 'POST' && url.pathname.startsWith('/_stub/')) return control(res, url, raw)
        records(req, res, url, raw)
      } catch (error) {
        send(res, 500, { error: { code: 'internal_error', message: String(error.message ?? error) } })
      }
    })
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
      for (const timer of held) clearTimeout(timer)
      held.clear()
      for (const socket of sockets) socket.destroy()
    })
  await listen(port)
  const bound = server.address().port

  const hub = {
    url: `http://127.0.0.1:${bound}`,
    port: bound,
    slug,
    /** Add or replace a member: `role` owner, admin, member or guest; `active` false: access off; `mailbox` false: none in Brax Mail. */
    person(id, { role = 'member', active = true, mailbox = true, holds = undefined, account: given = sampleAccount(now()) } = {}) {
      const one = { id, role, active, mailbox, holds, account: given }
      state.people.set(id, one)
      return one
    },
    /** The person's Brax Mail account as kept here: { calendars, books, events, cards, calendarCapability, contactsCapability }. */
    account: (id) => state.people.get(id)?.account,
    /** `acting` holds a person role of this module over `person` with these permissions. */
    relate(acting, person, keys = [READ]) {
      state.relations.push({ acting, person, keys })
    },
    /** The module's grant from now on: a list of permissions. */
    grant(scopes) {
      state.grant = new Set(scopes)
      return [...state.grant]
    },
    /** false: the module is switched off, every call answers 403 `module_not_active`. */
    active(on) {
      state.active = on
    },
    /** false: Brax Mail is switched off on this hub, every call answers 503 `mail_not_configured`. */
    mail(on) {
      state.mail = on
    },
    /** The next `times` requests answer this status and code, before anything is looked at; `code` null: a proxy's text. */
    fail(status, code = 'mail_unreachable', times = 1, extra = {}) {
      for (let i = 0; i < times; i++) state.failures.push({ status, code, extra })
      return state.failures.length
    },
    /** The next `times` requests lose their connection without an answer, and nothing is done. */
    drop(times = 1) {
      state.drops += times
    },
    /** The next `times` writes are made and their answer is lost: 502 `mail_unreachable` with `write_attempted: true`. */
    loseAnswer(times = 1) {
      state.lost += times
      return state.lost
    },
    /** The next `times` writes are made and the connection is cut before the answer. */
    dropAfterWrite(times = 1) {
      state.dropsAfter += times
    },
    /** The next `times` answers come `ms` late; what they answer is done at once. */
    hold(ms, times = 1) {
      for (let i = 0; i < times; i++) state.holds.push(ms)
    },
    /** Brax Mail refuses every create and change with this JMAP SetError (`{ type: 'invalidProperties', properties }`, `overQuota`, `tooLarge`); null: no more. */
    refuseValues(error) {
      state.setError = error
    },
    /** false: Brax Mail cannot filter contacts, `text` and `address_book` answer 422 `filter_not_supported`. */
    filters(on) {
      state.filters = on
    },
    /** A property Brax Mail does not know: asking for it by name answers 422 `invalid_fields`. */
    unknownField(name) {
      state.unknownFields.add(name)
    },
    down: unlisten,
    up: () => listen(bound),
    close: unlisten,
    /** Every request seen: { at, method, path, route, person, acting, key, status }; status 'dropped' without an answer. */
    get requests() {
      return state.requests
    },
  }
  for (const [id, role] of Object.entries(people)) hub.person(id, { role })
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
    const grant = flags['contacts-write'] ? [...GRANT_TODAY, EDIT] : GRANT_TODAY
    const hub = await standInRecordsHub({ port, slug: typeof flags.slug === 'string' ? flags.slug : 'example', grant, log: console.log })
    console.log(`hub records stub on ${hub.url}${BASE}/{person}/ (HUB_RECORDS_URL=${hub.url}); people: ${Object.keys(DEV_PEOPLE).join(', ')}; grant: ${grant.join(', ')}`)
  } else if (command === 'fail') {
    if (!positional[1]) throw new Error('usage: fail <status> [<code>] [--times n]')
    console.log(JSON.stringify(await post('/_stub/fail', { status: Number(positional[1]), code: positional[2] ?? 'mail_unreachable', times: Number(flags.times ?? 1) })))
  } else if (command === 'lose') {
    console.log(JSON.stringify(await post('/_stub/lose', { times: Number(flags.times ?? 1) })))
  } else if (command === 'grant') {
    console.log(JSON.stringify(await post('/_stub/grant', { scopes: (positional[1] ?? '').split(',').filter(Boolean) })))
  } else {
    throw new Error('usage: node tooling/hub-records-stub.mjs serve [--port 38411] [--contacts-write] | fail <status> [<code>] [--times n] | lose [--times n] | grant <a,b>')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(String(error.message ?? error))
    process.exit(1)
  })
}
