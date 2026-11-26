// The example's use of the hub's routes over a person's calendar in Brax Mail (TASKS APM20): the member's next events
// on the Items page. The module holds no events: they stay in the member's Brax Mail account, and this asks the hub
// for them each time, as that member (`context.hubMemberId` is both the person and the person acting).
//
// The kit's client (hub/records.server.ts) sends the request, tries a failed read again and turns a refusal into one
// error; this file is what an app writes: which fields it wants, and what the page is told when the hub says no. A
// refusal is not thrown at the page: it gets the sentence for the person (`say`), so the rest of the page still shows.
//
// The hub answers a module that holds `calendar.read` (module.yaml), for a member who holds it over themself (an
// owner, an admin or a member; a guest does not). Locally there is no hub: `npm run hub-records`, then
// `HUB_RECORDS_URL=http://127.0.0.1:38411 npm run dev`.
import { createServerFn } from '@tanstack/react-start'
import { hasHubRecords, hubRecords, HubRecordsError, type CalendarEvent } from './hub/records.server'
import { requireMember } from './middleware/rbs'

export interface NextEvent {
  id: string
  title: string
  /** The day, 2026-11-27, and the time of day, 10:00 (null for an all-day event), as the event holds them. */
  date: string | null
  time: string | null
  /** The event's own time zone; null for one that is the same wall-clock time everywhere. */
  zone: string | null
  place: string | null
  repeats: boolean
}

export type NextEvents =
  | { state: 'ok'; events: NextEvent[]; more: boolean }
  /** No hub here (local development without the stand-in). */
  | { state: 'no_hub' }
  /** The hub said no, or did not answer: `say` is the sentence for the person, `again` whether a reload can help. */
  | { state: 'refused'; code: string; say: string; again: boolean }

const FIELDS = ['title', 'start', 'timeZone', 'showWithoutTime', 'locations', 'recurrenceRule']

function shown(event: CalendarEvent): NextEvent {
  const start = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(event.start ?? '')
  const place = Object.values(event.locations ?? {}).find((location) => typeof location?.name === 'string' && location.name)?.name
  return {
    id: event.id,
    title: event.title?.trim() || '(no title)',
    date: start?.[1] ?? null,
    time: event.showWithoutTime || !start ? null : start[2]!,
    zone: event.timeZone ?? null,
    place: place ?? null,
    repeats: Boolean(event.recurrenceRule),
  }
}

export const nextEventsFn = createServerFn({ method: 'GET' })
  .middleware([requireMember()])
  // input: none
  .handler(async ({ context }): Promise<NextEvents> => {
    if (!hasHubRecords()) return { state: 'no_hub' }
    try {
      // The next seven days, which is the hub's range when none is given. A page waits for this, so: two tries, five seconds each.
      const page = await hubRecords().listEvents(context.hubMemberId, { limit: 5, fields: FIELDS, tries: 2, timeoutMs: 5000 })
      return { state: 'ok', events: page.events.map(shown), more: page.truncated }
    } catch (error) {
      if (!(error instanceof HubRecordsError)) throw error
      return { state: 'refused', code: error.code, say: error.say, again: error.again }
    }
  })
