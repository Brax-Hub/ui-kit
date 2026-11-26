// The module's client for a person's calendar and address book in Brax Mail (TASKS APM20 as changed on 25 November
// 2026, "Keep in Brax Mail"; ADR-045 "Open" 1; the hub server's app/module_records.py and app/mail_records.py). The
// Calendar and Contacts modules hold no records of their own: a person's events and contacts stay in their Brax Mail
// account, their phone syncs with Brax Mail as before, and a module reads and changes them through the hub, one
// function a route:
//
//   GET    /services/module/people/{person}/calendars                          listCalendars     calendar.read
//   GET    /services/module/people/{person}/calendar/events                    listEvents        calendar.read
//   GET    /services/module/people/{person}/calendar/events/{id}               readEvent         calendar.read
//   POST   /services/module/people/{person}/calendar/events                    createEvent       calendar.write
//   PATCH  /services/module/people/{person}/calendar/events/{id}               changeEvent       calendar.write
//   DELETE /services/module/people/{person}/calendar/events/{id}               deleteEvent       calendar.write
//   GET    /services/module/people/{person}/address-books                      listAddressBooks  contacts.read
//   GET    /services/module/people/{person}/address-book/contacts              listContacts      contacts.read
//   GET    /services/module/people/{person}/address-book/contacts/{id}         readContact       contacts.read
//   POST   /services/module/people/{person}/address-book/contacts              createContact     contacts.write
//   PATCH  /services/module/people/{person}/address-book/contacts/{id}         changeContact     contacts.write
//   DELETE /services/module/people/{person}/address-book/contacts/{id}         deleteContact     contacts.write
//
// Who. Every function takes `who` first: the hub membership id of the person whose records these are, and the person
// acting (the header `Brax-Acting-Member`). For a person using the app themself the two are the same, so `who` is
// that one id; `{ person, acting }` is for acting for somebody else, which the hub allows only through a person role
// of this module over them.
//
// A record is Brax Mail's own: an event is a JSCalendar object, a contact a JSContact card, each with Brax Mail's
// `id`. The common properties are typed below and the rest is left open. `fields` names the properties wanted
// (`'*'`: all Brax Mail holds); `id` always comes back.
//
// Trying again. The client does it, a small number of times (`tries`, 3), with the pause the feed client uses (one
// second, doubled, each shortened by a random part up to half):
//   - a read: on 502, on any other 5xx and when no answer came in time;
//   - a create: the same, with the SAME `Idempotency-Key`, so a try whose answer was lost finds the record it made
//     and makes no second one. The key is made once per thing the person did: pass `key` (newIdempotencyKey(), made
//     where the person acted and kept with what they asked for) and a later call of yours is safe to repeat too;
//     without it the client makes one per call, which covers its own tries only. The result says `created`;
//   - a change: the same; the hub writes the same values again;
//   - a delete: the same; 404 on a delete is done, not an error (`deleted` says whether the hub deleted it now).
// Nothing is tried again on a 4xx refusal, nor on 503 `mail_not_configured` (Brax Mail is switched off on that hub).
//
// A refusal is one error, HubRecordsError, with the hub's `code`, its `message`, `properties` on `invalid_event` and
// `invalid_contact`, and `writeAttempted` from a write's 502. RECORDS_ERRORS lists every code with whether the same
// call again can help and a sentence a person can be shown.
//
// Not there yet (26 November 2026), and so not something this file can make work:
//   - `contacts.write` is in the hub's vocabulary, but the manifest validator does not list it, so no module.yaml can
//     ask for it and the three contact writes answer 403 `scope_required` to a real module;
//   - nothing here, and nothing in the hub's own tests, has run against a real Brax Mail.
//
// Never written here, by the hub's rule: an invitation (`participants`, `replyTo`, `organizerCalendarAddress`: 422
// `invitations_not_supported`), an event that has guests (409 `event_has_guests`), one occurrence of a repeating
// event by its own id (409 `event_is_occurrence`; patch the stored event). Those stay in the person's own Calendar
// screen. Tasks and task lists are not shown; a calendar or an address book somebody shares with the person is not
// either.
//
// This file imports nothing of the app (no environment, no database) and only erasable TypeScript, so
// tooling/records.test.mjs loads it with plain `node --test`. hub/records.server.ts binds it to the module
// credential.
import { randomUUID } from 'node:crypto'
import type { CallHub, HubAnswer, HubCall } from './event-feed'

export const PEOPLE_PATH = '/services/module/people'

/** The permission each function needs, in the module's grant (module.yaml `scopes`) and held by the person. */
export const RECORDS_SCOPES = {
  listCalendars: 'calendar.read',
  listEvents: 'calendar.read',
  readEvent: 'calendar.read',
  createEvent: 'calendar.write',
  changeEvent: 'calendar.write',
  deleteEvent: 'calendar.write',
  listAddressBooks: 'contacts.read',
  listContacts: 'contacts.read',
  readContact: 'contacts.read',
  createContact: 'contacts.write',
  changeContact: 'contacts.write',
  deleteContact: 'contacts.write',
} as const

export type RecordsFunction = keyof typeof RECORDS_SCOPES

/**
 * The feed kinds a write through these routes makes (hub/event-feed.ts), and the ids each may carry in `data`: the
 * record's `event` or `contact`, and its `uid` when the hub knows it. Ids only, never a title or a name: the handler
 * reads the record with readEvent or readContact. The hub shows the calendar kinds to a module that holds
 * `calendar.read` and the contact kinds to one that holds `contacts.read`.
 */
export const RECORDS_FEED_KINDS = {
  'calendar_event.created': ['event', 'uid'],
  'calendar_event.changed': ['event', 'uid'],
  'calendar_event.deleted': ['event', 'uid'],
  'contact.created': ['contact', 'uid'],
  'contact.changed': ['contact', 'uid'],
  'contact.deleted': ['contact', 'uid'],
} as const

// The refusals --------------------------------------------------------------------------------------------------------

export interface RecordsRefusal {
  /** The HTTP status the hub answers with; 0 for the client's own codes, which no answer carries. */
  status: number
  /** Whether the same call again, unchanged, can be answered. The client has already tried `tries` times. */
  again: boolean
  /** A sentence a person can be shown. */
  say: string
}

const APP_FAULT = 'This app asked the hub for something the hub could not read. That is a fault in the app.'

/**
 * Every code a call can be refused with, in the order the hub checks: the module, the person, the arguments, then
 * Brax Mail's own answers; the client's own codes last. `again: false` means somebody has to change something first
 * (the comment says who).
 */
export const RECORDS_ERRORS = {
  // The module. The owner's to put right, in Hub administration.
  client_certificate_required: { status: 401, again: false, say: 'This app is not connected to the hub properly. The hub owner can install it again.' },
  invalid_client_certificate: { status: 401, again: false, say: 'This app is not connected to the hub properly. The hub owner can install it again.' },
  expired_client_certificate: { status: 401, again: false, say: 'This app is not connected to the hub properly. The hub owner can install it again.' },
  module_not_active: { status: 403, again: false, say: 'This app is switched off on this hub.' },
  // The module's grant does not hold the route's permission: module.yaml does not ask for it, or the owner did not approve it.
  scope_required: { status: 403, again: false, say: 'This app has not been allowed to do this. The hub owner decides what an app may do, in Hub administration.' },
  // The person. The first two are the app's fault: no acting person sent, or an id that is not a member of this hub.
  acting_member_required: { status: 422, again: false, say: APP_FAULT },
  unknown_member: { status: 422, again: false, say: 'The hub does not know this person.' },
  // Acting for somebody else without a person role of this module over them.
  relation_required: { status: 403, again: false, say: 'You may not do this for this person.' },
  active_membership_required: { status: 403, again: false, say: 'Access to this hub is switched off for this person.' },
  // The person does not hold the permission over their own records: a guest holds none, an admin reads and does not write.
  permission_required: { status: 403, again: false, say: 'Your role on this hub does not allow this.' },
  // The arguments. The app's fault, except the last, which is the hub's rule.
  invalid_request: { status: 422, again: false, say: APP_FAULT },
  invalid_range: { status: 422, again: false, say: 'These dates cannot be listed: the end has to be after the start, and at most 366 days later.' },
  invalid_fields: { status: 422, again: false, say: APP_FAULT },
  idempotency_key_required: { status: 422, again: false, say: APP_FAULT },
  invitations_not_supported: { status: 422, again: false, say: 'Inviting people is done in your own Calendar screen, not here.' },
  // Brax Mail's own answers.
  mail_not_configured: { status: 503, again: false, say: 'Brax Mail is not switched on for this hub, so there is no calendar or address book to open.' },
  mail_access_refused: { status: 403, again: false, say: 'There is no Brax Mail mailbox for this person on this hub, so there is no calendar or address book to open.' },
  no_calendar: { status: 409, again: false, say: 'This Brax Mail account has no calendar yet.' },
  no_address_book: { status: 409, again: false, say: 'This Brax Mail account has no address book yet.' },
  event_not_found: { status: 404, again: false, say: 'This event is no longer in the calendar.' },
  contact_not_found: { status: 404, again: false, say: 'This contact is no longer in the address book.' },
  unknown_calendar: { status: 422, again: false, say: 'This calendar is no longer there.' },
  unknown_address_book: { status: 422, again: false, say: 'This address book is no longer there.' },
  // Brax Mail refused the values; `properties` names which.
  invalid_event: { status: 422, again: false, say: 'Brax Mail did not accept the event as written.' },
  invalid_contact: { status: 422, again: false, say: 'Brax Mail did not accept the contact as written.' },
  filter_not_supported: { status: 422, again: false, say: 'Brax Mail cannot search contacts this way.' },
  event_has_guests: { status: 409, again: false, say: 'This event has guests. Change or delete it in your own Calendar screen, so they are told.' },
  event_is_occurrence: { status: 409, again: false, say: 'This is one occurrence of a repeating event. Change the repeating event instead.' },
  over_quota: { status: 409, again: false, say: 'This Brax Mail account is full.' },
  too_large: { status: 413, again: false, say: 'This is too large for Brax Mail to keep.' },
  // Brax Mail did not answer the hub in time, or answered something the hub could not use. On a write `writeAttempted`
  // says whether the write may have reached Brax Mail; a create with the same key, a change and a delete are safe again.
  mail_unreachable: { status: 502, again: true, say: 'Brax Mail did not answer. Try again in a moment.' },
  // The client's own. No answer from the hub: no connection, a dropped one, or none within `timeoutMs`.
  hub_unreachable: { status: 0, again: true, say: 'The hub did not answer. Try again in a moment.' },
  // No module credential, and locally no HUB_RECORDS_URL: there is no hub to ask (hub/records.server.ts).
  no_hub: { status: 0, again: false, say: 'This app is not running on a hub here, so there is no calendar or address book to open.' },
  // A 2xx answer that is not what the route gives: the hub and this file disagree.
  unexpected_answer: { status: 0, again: false, say: 'The hub answered something this app did not understand.' },
  // The caller's own `signal` ended the call.
  aborted: { status: 0, again: false, say: 'This was stopped before the hub answered.' },
} as const satisfies Record<string, RecordsRefusal>

export type RecordsErrorCode = keyof typeof RECORDS_ERRORS

/** What a code means; for a code this file does not list, by its status: a 5xx may pass, anything else will not. */
export function recordsRefusal(code: string, status = 0): RecordsRefusal {
  if (Object.hasOwn(RECORDS_ERRORS, code)) return RECORDS_ERRORS[code as RecordsErrorCode]
  return status >= 500
    ? { status, again: true, say: 'The hub could not do this just now. Try again in a moment.' }
    : { status, again: false, say: 'The hub refused this, and this app does not know why.' }
}

export class HubRecordsError extends Error {
  /** The hub's code, or one of the client's own (`hub_unreachable`, `no_hub`, `unexpected_answer`, `aborted`). */
  code: RecordsErrorCode | (string & {})
  /** The HTTP status; 0 when no answer came. */
  status: number
  /** The property names Brax Mail refused, on `invalid_event` and `invalid_contact` (never their values). */
  properties: string[]
  /** From a write's 502: true when the write may have reached Brax Mail, false when it did not; null when the hub did not say. */
  writeAttempted: boolean | null
  /** Whether the same call again can be answered (RECORDS_ERRORS). For a create: with `idempotencyKey`. */
  again: boolean
  /** A sentence a person can be shown. */
  say: string
  /** The function that was refused: `createEvent`. */
  what: string
  /** How many times the call was sent; 0 when it was refused before it was sent. */
  tries: number
  /** The `Idempotency-Key` of a create, so the caller can send the same call again later. */
  idempotencyKey: string | null

  /** `message` is the hub's own; it is often the code again. */
  constructor(fields: { code: string; message?: string; status?: number; properties?: string[]; writeAttempted?: boolean | null; what: string; tries?: number; idempotencyKey?: string | null }) {
    super(fields.message || fields.code)
    this.name = 'HubRecordsError'
    const meaning = recordsRefusal(fields.code, fields.status)
    this.code = fields.code
    this.status = fields.status ?? 0
    this.properties = fields.properties ?? []
    this.writeAttempted = fields.writeAttempted ?? null
    this.again = meaning.again
    this.say = meaning.say
    this.what = fields.what
    this.tries = fields.tries ?? 0
    this.idempotencyKey = fields.idempotencyKey ?? null
  }
}

// The records ---------------------------------------------------------------------------------------------------------

/** A calendar or an address book of the person's own account, as the hub lists it. */
export interface RecordCollection {
  id: string
  name: string
  description: string | null
  /** As Brax Mail holds it (a CSS colour), or null. */
  color: string | null
  sort_order: number
  is_default: boolean
  may_write: boolean
}
export type CalendarRow = RecordCollection
export type AddressBookRow = RecordCollection

export interface Calendars {
  person: string
  calendars: CalendarRow[]
  /** The id of the calendar a new event goes to. */
  default: string
}

export interface AddressBooks {
  person: string
  address_books: AddressBookRow[]
  /** The id of the address book a new contact goes to. */
  default: string
}

export interface EventLocation {
  '@type'?: 'Location'
  name?: string
  description?: string
  [property: string]: unknown
}

export interface EventRecurrenceRule {
  '@type'?: 'RecurrenceRule'
  frequency?: 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly' | 'minutely' | 'secondly'
  interval?: number
  count?: number
  /** A local date-time, as `start`. */
  until?: string
  byDay?: { day: string; nthOfPeriod?: number }[]
  [property: string]: unknown
}

export interface EventAlert {
  '@type'?: 'Alert'
  trigger?: { '@type'?: string; offset?: string; relativeTo?: 'start' | 'end'; when?: string; [property: string]: unknown }
  /** `email` makes Brax Mail mail the person themself a reminder; it goes to nobody else. */
  action?: 'display' | 'email'
  [property: string]: unknown
}

/** The properties of a JSCalendar event (RFC 8984) as Brax Mail holds it: the common ones typed, the rest open. */
export interface EventProperties {
  '@type'?: 'Event'
  title?: string
  description?: string
  /** A local date-time, without an offset: 2026-11-27T10:00:00. With `timeZone` absent or null the event floats. */
  start?: string
  /** An IANA zone name: Europe/Paris. */
  timeZone?: string | null
  /** An ISO 8601 duration: PT1H, P1D. */
  duration?: string
  /** An all-day event. */
  showWithoutTime?: boolean
  status?: 'confirmed' | 'cancelled' | 'tentative'
  freeBusyStatus?: 'free' | 'busy'
  privacy?: 'public' | 'private' | 'secret'
  locations?: Record<string, EventLocation>
  /** Brax Mail writes the rule in the singular. */
  recurrenceRule?: EventRecurrenceRule
  /** By the local date-time of the occurrence: a patch of it, or `{ excluded: true }`. */
  recurrenceOverrides?: Record<string, Record<string, unknown>>
  alerts?: Record<string, EventAlert>
  keywords?: Record<string, boolean>
  categories?: Record<string, boolean>
  color?: string
  [property: string]: unknown
}

/** An event as it comes back: Brax Mail's `id` always, and of the rest what `fields` asked for. */
export interface CalendarEvent extends EventProperties {
  id: string
  /** The same for every copy of the event; of an event this module made, built by the hub from the `Idempotency-Key`. */
  uid?: string
  /** The calendars it is in, by id. */
  calendarIds?: Record<string, boolean>
  /** Of one occurrence listed with `expand`: the stored event it belongs to. Write that one. */
  baseEventId?: string
  /** Guests. Read only: an event that has any is not changed or deleted here. */
  participants?: Record<string, Record<string, unknown>>
}

/**
 * What a new event may carry. Never `id`, `uid` or `calendarIds` (the hub sets them; `calendar` in the options names
 * where it goes), and never `participants`, `replyTo` or `organizerCalendarAddress`: no invitation leaves here.
 */
export type NewEvent = EventProperties

/** A change: the properties to set, null to remove one, and a JMAP patch path for one member (`locations/l1/name`). */
export type EventPatch = { [Property in keyof EventProperties]?: EventProperties[Property] | null }

export interface EventsPage {
  person: string
  /** Oldest first. A repeating event comes once, with its rule, unless `expand` was asked. */
  events: CalendarEvent[]
  /** How many matched; more than `events.length` when `truncated`. */
  count: number
  truncated: boolean
  /** The range that was listed, as asked or as the hub chose it. */
  from: string
  to: string
}

export interface CardName {
  full?: string
  components?: { kind: string; value: string; [property: string]: unknown }[]
  [property: string]: unknown
}

/** The properties of a JSContact card (RFC 9553) as Brax Mail holds it: the common ones typed, the rest open. */
export interface CardProperties {
  '@type'?: 'Card'
  version?: string
  kind?: 'individual' | 'group' | 'org' | 'location' | 'device' | 'application'
  name?: CardName
  nicknames?: Record<string, { name: string; [property: string]: unknown }>
  organizations?: Record<string, { name?: string; units?: { name: string }[]; [property: string]: unknown }>
  titles?: Record<string, { name: string; kind?: 'title' | 'role'; [property: string]: unknown }>
  emails?: Record<string, { address: string; contexts?: Record<string, boolean>; pref?: number; label?: string; [property: string]: unknown }>
  phones?: Record<string, { number: string; features?: Record<string, boolean>; contexts?: Record<string, boolean>; pref?: number; label?: string; [property: string]: unknown }>
  addresses?: Record<string, { full?: string; components?: { kind: string; value: string }[]; countryCode?: string; contexts?: Record<string, boolean>; [property: string]: unknown }>
  onlineServices?: Record<string, { service?: string; uri?: string; user?: string; [property: string]: unknown }>
  anniversaries?: Record<string, { kind: 'birth' | 'death' | 'wedding'; date: unknown; [property: string]: unknown }>
  notes?: Record<string, { note: string; [property: string]: unknown }>
  /** A card may carry its photo here, inline. */
  media?: Record<string, { kind: 'photo' | 'sound' | 'logo'; uri: string; mediaType?: string; [property: string]: unknown }>
  keywords?: Record<string, boolean>
  [property: string]: unknown
}

/** A contact as it comes back: Brax Mail's `id` always, and of the rest what `fields` asked for. */
export interface ContactCard extends CardProperties {
  id: string
  uid?: string
  /** The address books it is in, by id. */
  addressBookIds?: Record<string, boolean>
}

/** What a new contact may carry. Never `id`, `uid` or `addressBookIds`; `addressBook` in the options names where it goes. */
export type NewContact = CardProperties

/** A change: the properties to set, null to remove one, and a JMAP patch path for one member (`emails/e2`). */
export type ContactPatch = { [Property in keyof CardProperties]?: CardProperties[Property] | null }

export interface ContactsPage {
  person: string
  /** In Brax Mail's own order. */
  contacts: ContactCard[]
  /** Where this page starts; the next one starts at `position + contacts.length`. */
  position: number
  /** How many match in all; null when Brax Mail did not say. */
  total: number | null
}

// The calls -----------------------------------------------------------------------------------------------------------

/** The person whose records these are, who is also the person acting; or the two, when somebody acts for another. */
export type Who = string | { person: string; acting: string }

/** Property names of the record (`['title', 'start']`), or `'*'` for all Brax Mail holds. Absent: the hub's usual ones. */
export type Fields = readonly string[] | '*'

export interface CallOptions {
  /** Ends the call at once: the open request, and a pause before the next try. The call rejects with `aborted`. */
  signal?: AbortSignal
  /** How many times the call may be sent in all, for this call only. */
  tries?: number
  /** How long to wait for one answer, for this call only. */
  timeoutMs?: number
}

export interface EventsQuery extends CallOptions {
  /** The start of the range; a text is RFC 3339 with an offset. Default: now. */
  from?: Date | string
  /** The end of the range. Default: seven days after `from`; at most 366 days after it. */
  to?: Date | string
  /** One calendar, by id. */
  calendar?: string
  fields?: Fields
  /** At most this many events: 100 by default, 500 at most. */
  limit?: number
  /** A repeating event's occurrences one by one, as Brax Mail lists them. */
  expand?: boolean
}

export interface ContactsQuery extends CallOptions {
  /** One address book, by id. */
  addressBook?: string
  /** Contacts that hold this text (1 to 200 characters). Not proven on a real Brax Mail: 422 `filter_not_supported` if it cannot. */
  text?: string
  fields?: Fields
  /** Where the page starts: 0, then `position + contacts.length` of the page before. */
  position?: number
  /** At most this many: 100 by default, 500 at most, and 50 at most with `fields: '*'` (a card may carry its photo). */
  limit?: number
}

export interface ReadOptions extends CallOptions {
  fields?: Fields
}

export interface CreateEventOptions extends CallOptions {
  /** The calendar it goes to, by id. Default: the person's default calendar. */
  calendar?: string
  /** The `Idempotency-Key`: made once per thing the person did (newIdempotencyKey()). Default: one made for this call. */
  key?: string
}

export interface CreateContactOptions extends CallOptions {
  /** The address book it goes to, by id. Default: the person's default address book. */
  addressBook?: string
  key?: string
}

export interface ChangeEventOptions extends CallOptions {
  /** Move the event to this calendar. */
  calendar?: string
}

export interface ChangeContactOptions extends CallOptions {
  /** Move the contact to this address book. */
  addressBook?: string
}

export interface Created {
  person: string
  /** Brax Mail's id of the record. */
  id: string
  uid: string
  /**
   * true: this call made the record. false: it was there already, made by an earlier call with the same key, and
   * nothing was written. After a try whose answer was lost the hub can only say "there already"; the client then says
   * true, because the record it finds is the one its own earlier try made, unless the same key was also used by an
   * earlier call, which the client cannot tell apart.
   */
  created: boolean
  /** The `Idempotency-Key` that was sent: the one given, or the one the client made. */
  key: string
  /** How many times the call was sent. */
  tries: number
}

export interface Changed {
  person: string
  id: string
  /** Of an event, when Brax Mail holds one. */
  uid: string | null
  tries: number
}

export interface Deleted {
  person: string
  id: string
  /**
   * true: the hub deleted it in answer to this call (or to an earlier try of it whose answer was lost). false: the
   * hub no longer had it (404), so it was deleted before, or was never there. Either way it is gone.
   */
  deleted: boolean
  tries: number
}

/** One function a route. Each rejects with a HubRecordsError when the hub refuses or does not answer. */
export interface HubRecords {
  /** The person's own calendars, without the task lists, and which one a new event goes to. */
  listCalendars(who: Who, options?: CallOptions): Promise<Calendars>
  /** The person's events in a range, oldest first. */
  listEvents(who: Who, query?: EventsQuery): Promise<EventsPage>
  readEvent(who: Who, id: string, options?: ReadOptions): Promise<CalendarEvent>
  createEvent(who: Who, event: NewEvent, options?: CreateEventOptions): Promise<Created>
  /** Set, or with null remove, properties of one event; `{}` with `calendar` only moves it. */
  changeEvent(who: Who, id: string, patch: EventPatch, options?: ChangeEventOptions): Promise<Changed>
  deleteEvent(who: Who, id: string, options?: CallOptions): Promise<Deleted>
  /** The person's own address books, and which one a new contact goes to. */
  listAddressBooks(who: Who, options?: CallOptions): Promise<AddressBooks>
  /** A page of the person's contacts, in Brax Mail's order. */
  listContacts(who: Who, query?: ContactsQuery): Promise<ContactsPage>
  readContact(who: Who, id: string, options?: ReadOptions): Promise<ContactCard>
  /** Needs `contacts.write`, which no manifest can ask for yet: 403 `scope_required` on a real hub today. */
  createContact(who: Who, contact: NewContact, options?: CreateContactOptions): Promise<Created>
  /** Needs `contacts.write`, as createContact. */
  changeContact(who: Who, id: string, patch: ContactPatch, options?: ChangeContactOptions): Promise<Changed>
  /** Needs `contacts.write`, as createContact. */
  deleteContact(who: Who, id: string, options?: CallOptions): Promise<Deleted>
}

export interface HubRecordsOptions {
  /** One request to the hub's module API: `hubTransport(address, { connections }).call` of hub/event-feed.ts. */
  call: CallHub
  /** How many times a call may be sent in all: the first and the tries after a failure that may pass (3). */
  tries?: number
  /** How long the client waits for one answer (25 s; the hub gives a route 20 s). */
  timeoutMs?: number
  /** The pause before another try: `firstMs` (1000), doubled each time up to `maxMs` (60000), with jitter. */
  pause?: { firstMs?: number; maxMs?: number }
  /** Told of every try that failed and will be sent again. Never a title, a name, an address or a time. */
  log?: (message: string, fields?: Record<string, unknown>) => void
}

/** A key for one create: 36 characters the hub accepts. Make it once per thing the person did, and keep it. */
export const newIdempotencyKey = (): string => randomUUID()

// What the hub accepts, checked before anything is sent, so an id from a form can never reach another route.
const MEMBER = /^[A-Za-z0-9_.:-]{1,128}$/
const RECORD_ID = /^[A-Za-z0-9._:@+-]{1,255}$/
const FIELD = /^[A-Za-z@][A-Za-z0-9.:_-]{0,63}$/
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/
const MAX_FIELDS = 40
/** Errors of a connection that never carried the request: nothing can have been written. */
const NEVER_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'])

type Json = Record<string, unknown>
type Kind = 'read' | 'create' | 'change' | 'delete'

interface Plan {
  what: RecordsFunction
  kind: Kind
  call: HubCall
  key?: string
  /** For a delete: the code of the 404 that means it is gone. */
  gone?: string
  /** Whether a 2xx body is what the route gives. */
  holds: (body: Json) => boolean
}

interface Outcome {
  body: Json
  status: number
  tries: number
  /** A try before the last may have reached Brax Mail with the write. */
  mayHaveWritten: boolean
}

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300)

/** The hub's `{ "error": { code, message, properties?, write_attempted? } }`; FastAPI's own `{ "detail": code }` too. */
function refusalOf(body: unknown): { code: string; message: string; properties: string[]; writeAttempted: boolean | null } {
  const none = { code: 'unknown', message: '', properties: [], writeAttempted: null }
  if (!isObject(body)) return none
  if (typeof body.detail === 'string') return { ...none, code: body.detail, message: body.detail }
  const error = body.error
  if (typeof error === 'string') return { ...none, code: error, message: error }
  if (!isObject(error) || typeof error.code !== 'string') return none
  return {
    code: error.code,
    message: typeof error.message === 'string' ? error.message : error.code,
    properties: Array.isArray(error.properties) ? error.properties.filter((name): name is string => typeof name === 'string') : [],
    writeAttempted: typeof error.write_attempted === 'boolean' ? error.write_attempted : null,
  }
}

/** Resolves after `ms`, or at once when `signal` aborts. */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
  })
}

export function createHubRecords(options: HubRecordsOptions): HubRecords {
  const firstMs = options.pause?.firstMs ?? 1000
  const maxMs = options.pause?.maxMs ?? 60_000
  const log = options.log ?? ((message, fields) => console.log(JSON.stringify({ at: new Date().toISOString(), hub_records: message, ...fields })))

  /** Refused here, before anything is sent, with the code the hub gives for the same thing. */
  function refuse(what: RecordsFunction, code: RecordsErrorCode, key?: string): never {
    throw new HubRecordsError({ code, status: RECORDS_ERRORS[code].status, what, idempotencyKey: key })
  }

  function path(what: RecordsFunction, who: Who, rest: string, id?: string): { path: string; headers: Record<string, string>; person: string } {
    const person = typeof who === 'string' ? who : who?.person
    const acting = typeof who === 'string' ? who : who?.acting
    if (typeof person !== 'string' || !MEMBER.test(person)) refuse(what, 'unknown_member')
    if (typeof acting !== 'string' || !acting) refuse(what, 'acting_member_required')
    if (!MEMBER.test(acting)) refuse(what, 'unknown_member')
    if (id !== undefined && (typeof id !== 'string' || !RECORD_ID.test(id))) refuse(what, 'invalid_request')
    const record = id === undefined ? '' : `/${encodeURIComponent(id)}`
    return { path: `${PEOPLE_PATH}/${encodeURIComponent(person)}/${rest}${record}`, headers: { 'brax-acting-member': acting }, person }
  }

  function fieldsText(what: RecordsFunction, fields: Fields | undefined): string | undefined {
    if (fields === undefined) return undefined
    if (fields === '*') return '*'
    if (!Array.isArray(fields) || fields.length === 0 || fields.length > MAX_FIELDS || !fields.every((name) => typeof name === 'string' && FIELD.test(name))) refuse(what, 'invalid_fields')
    return fields.join(',')
  }

  /** A moment as the hub reads it: RFC 3339 with an offset, without the fraction a Date writes. */
  const moment = (value: Date | string | undefined) => (value instanceof Date ? value.toISOString().replace(/\.\d{3}Z$/, 'Z') : value)
  const whole = (what: RecordsFunction, value: number | undefined) => {
    if (value === undefined) return undefined
    if (!Number.isInteger(value) || value < 0) refuse(what, 'invalid_request')
    return String(value)
  }
  const place = (what: RecordsFunction, id: string | undefined) => {
    if (id !== undefined && (typeof id !== 'string' || !RECORD_ID.test(id))) refuse(what, 'invalid_request')
    return id
  }

  /** One try: the answer, or what kept it from coming and whether the request can have reached the hub. */
  async function once(plan: Plan, timeoutMs: number, signal: AbortSignal | undefined): Promise<{ answer: HubAnswer } | { failure: string; sent: boolean }> {
    const own = new AbortController()
    const end = () => own.abort()
    const timer = setTimeout(end, timeoutMs)
    signal?.addEventListener('abort', end, { once: true })
    if (signal?.aborted) own.abort()
    try {
      return { answer: await options.call(plan.call, own.signal) }
    } catch (error) {
      if (error instanceof HubRecordsError) throw error
      if (own.signal.aborted) return { failure: `no answer within ${timeoutMs} ms`, sent: true }
      return { failure: text(error), sent: !NEVER_SENT.has(String((error as { code?: unknown } | null)?.code ?? '')) }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', end)
    }
  }

  async function send(plan: Plan, call: CallOptions): Promise<Outcome> {
    const tries = Math.max(1, Math.floor(call.tries ?? options.tries ?? 3))
    const timeoutMs = call.timeoutMs ?? options.timeoutMs ?? 25_000
    const write = plan.kind !== 'read'
    let mayHaveWritten = false
    for (let sent = 1; ; sent++) {
      const aborted = (count: number) => new HubRecordsError({ code: 'aborted', what: plan.what, tries: count, idempotencyKey: plan.key })
      if (call.signal?.aborted) throw aborted(sent - 1)
      const result = await once(plan, timeoutMs, call.signal)
      if (call.signal?.aborted) throw aborted(sent)
      let failed: HubRecordsError
      if ('answer' in result) {
        const { status, body } = result.answer
        if (status >= 200 && status < 300) {
          if (!isObject(body) || !plan.holds(body)) throw new HubRecordsError({ code: 'unexpected_answer', status, what: plan.what, tries: sent, idempotencyKey: plan.key })
          return { body, status, tries: sent, mayHaveWritten }
        }
        const refusal = refusalOf(body)
        // A delete that finds nothing is done: an earlier try of this call, or an earlier call, deleted it.
        if (plan.gone && status === 404 && refusal.code === plan.gone) return { body: {}, status, tries: sent, mayHaveWritten }
        failed = new HubRecordsError({ ...refusal, status, what: plan.what, tries: sent, idempotencyKey: plan.key })
        // Only a failure of the hub or of Brax Mail may pass at the next try; a 4xx is an answer.
        if (status < 500 || refusal.code === 'mail_not_configured') throw failed
        if (write && refusal.writeAttempted !== false) mayHaveWritten = true
      } else {
        failed = new HubRecordsError({ code: 'hub_unreachable', message: result.failure, what: plan.what, tries: sent, idempotencyKey: plan.key })
        if (write && result.sent) mayHaveWritten = true
      }
      if (sent >= tries) throw failed
      const base = Math.min(maxMs, firstMs * 2 ** Math.min(sent - 1, 30))
      const pause = Math.round(base / 2 + (Math.random() * base) / 2)
      log('trying again', { what: plan.what, why: failed.status ? `${failed.status} ${failed.code}` : failed.message, tries: sent, pause_ms: pause, ...(write ? { may_have_written: mayHaveWritten } : {}) })
      await sleep(pause, call.signal)
    }
  }

  const has = (name: string, check: (value: unknown) => boolean) => (body: Json) => check(body[name])
  const list = (name: string) => has(name, Array.isArray)
  const record = (name: string) => has(name, (value) => isObject(value) && typeof value.id === 'string')
  const id = has('id', (value) => typeof value === 'string')

  async function create(what: 'createEvent' | 'createContact', who: Who, rest: string, body: Json, given: string | undefined, call: CallOptions): Promise<Created> {
    const key = given ?? newIdempotencyKey()
    if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) refuse(what, 'idempotency_key_required')
    const at = path(what, who, rest)
    const out = await send({ what, kind: 'create', key, call: { method: 'POST', path: at.path, headers: { ...at.headers, 'idempotency-key': key }, body }, holds: id }, call)
    return { person: at.person, id: out.body.id as string, uid: typeof out.body.uid === 'string' ? out.body.uid : '', created: out.body.created === true || out.mayHaveWritten, key, tries: out.tries }
  }

  async function change(what: 'changeEvent' | 'changeContact', who: Who, rest: string, recordId: string, body: Json, call: CallOptions): Promise<Changed> {
    const at = path(what, who, rest, recordId)
    const out = await send({ what, kind: 'change', call: { method: 'PATCH', path: at.path, headers: at.headers, body }, holds: id }, call)
    return { person: at.person, id: recordId, uid: typeof out.body.uid === 'string' ? out.body.uid : null, tries: out.tries }
  }

  async function remove(what: 'deleteEvent' | 'deleteContact', who: Who, rest: string, recordId: string, gone: string, call: CallOptions): Promise<Deleted> {
    const at = path(what, who, rest, recordId)
    const out = await send({ what, kind: 'delete', gone, call: { method: 'DELETE', path: at.path, headers: at.headers }, holds: id }, call)
    return { person: at.person, id: recordId, deleted: out.status !== 404 || out.mayHaveWritten, tries: out.tries }
  }

  async function read<T>(what: RecordsFunction, who: Who, rest: string, recordId: string | undefined, query: Record<string, string | undefined>, holds: Plan['holds'], call: CallOptions): Promise<T> {
    const at = path(what, who, rest, recordId)
    const out = await send({ what, kind: 'read', call: { method: 'GET', path: at.path, headers: at.headers, query }, holds }, call)
    return out.body as T
  }

  return {
    listCalendars: async (who, call = {}) => read<Calendars>('listCalendars', who, 'calendars', undefined, {}, list('calendars'), call),
    listEvents: async (who, query = {}) =>
      read<EventsPage>(
        'listEvents',
        who,
        'calendar/events',
        undefined,
        {
          from: moment(query.from),
          to: moment(query.to),
          calendar: place('listEvents', query.calendar),
          fields: fieldsText('listEvents', query.fields),
          limit: whole('listEvents', query.limit),
          expand: query.expand ? 'true' : undefined,
        },
        list('events'),
        query,
      ),
    readEvent: async (who, eventId, call = {}) =>
      (await read<{ event: CalendarEvent }>('readEvent', who, 'calendar/events', eventId, { fields: fieldsText('readEvent', call.fields) }, record('event'), call)).event,
    createEvent: async (who, event, call = {}) => create('createEvent', who, 'calendar/events', { event, ...(place('createEvent', call.calendar) ? { calendar: call.calendar } : {}) }, call.key, call),
    changeEvent: async (who, eventId, patch, call = {}) => change('changeEvent', who, 'calendar/events', eventId, { event: patch, ...(place('changeEvent', call.calendar) ? { calendar: call.calendar } : {}) }, call),
    deleteEvent: async (who, eventId, call = {}) => remove('deleteEvent', who, 'calendar/events', eventId, 'event_not_found', call),
    listAddressBooks: async (who, call = {}) => read<AddressBooks>('listAddressBooks', who, 'address-books', undefined, {}, list('address_books'), call),
    listContacts: async (who, query = {}) =>
      read<ContactsPage>(
        'listContacts',
        who,
        'address-book/contacts',
        undefined,
        {
          address_book: place('listContacts', query.addressBook),
          text: query.text,
          fields: fieldsText('listContacts', query.fields),
          position: whole('listContacts', query.position),
          limit: whole('listContacts', query.limit),
        },
        list('contacts'),
        query,
      ),
    readContact: async (who, contactId, call = {}) =>
      (await read<{ contact: ContactCard }>('readContact', who, 'address-book/contacts', contactId, { fields: fieldsText('readContact', call.fields) }, record('contact'), call)).contact,
    createContact: async (who, contact, call = {}) =>
      create('createContact', who, 'address-book/contacts', { contact, ...(place('createContact', call.addressBook) ? { address_book: call.addressBook } : {}) }, call.key, call),
    changeContact: async (who, contactId, patch, call = {}) =>
      change('changeContact', who, 'address-book/contacts', contactId, { contact: patch, ...(place('changeContact', call.addressBook) ? { address_book: call.addressBook } : {}) }, call),
    deleteContact: async (who, contactId, call = {}) => remove('deleteContact', who, 'address-book/contacts', contactId, 'contact_not_found', call),
  }
}
