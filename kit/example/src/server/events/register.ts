// The example's use of the hub's event feed (TASKS APM10): the calendar's three kinds. The kit's client
// (hub/events.server.ts) asks the hub and waits, runs the handler of each event in order and keeps the cursor in
// `hub_cursors`; this file is what an app writes: one handler a kind, and what to do when everything must be read again.
//
// A handler may run twice for the same event (the module stopped before the cursor was written), so each writes by
// the event's id: noting the same change again leaves the same row. An event holds ids only (`person`, `data.event`,
// `data.uid` for an event a tool created); a module that shows the record fetches it through its read route.
//
// The hub shows these kinds to a module that holds `calendar.read` (module.yaml) and only for a person who consents.
// Locally: `npm run hub-events`, then `HUB_EVENTS_URL=http://127.0.0.1:38410 npm run dev`, then
// `node tooling/hub-events-stub.mjs emit calendar_event.created --person dev-owner --event ev_1`.
import { followHubEvents, type EventRun, type HubEvent, type HubEventsDef } from '../hub/events.server'

type Change = 'created' | 'changed' | 'deleted'

/** Note the last change of one calendar event, for the member whose calendar it is. */
const note = (change: Change) => async (event: HubEvent, { service, log }: EventRun) => {
  const id = event.data.event
  if (!id || !event.person) return log(`${event.id} names no event or no person; nothing to note`)
  const { data: member, error: memberError } = await service.from('memberships').select('id').eq('hub_member_id', event.person).maybeSingle()
  if (memberError) throw new Error(memberError.message)
  if (!member) return log(`${event.id} is about ${event.person}, who is not a member here yet`)
  const row = { event: id, member_id: member.id, change, changed_at: event.at, ...(event.data.uid ? { uid: event.data.uid } : {}) }
  const { error } = await service.from('calendar_changes').upsert(row, { onConflict: 'event' })
  if (error) throw new Error(error.message)
}

export const EVENTS: HubEventsDef = {
  handlers: {
    'calendar_event.created': note('created'),
    'calendar_event.changed': note('changed'),
    'calendar_event.deleted': note('deleted'),
  },
  // Called before the first event ever ('start'), when the hub refused the cursor (retention passed it, or the hub
  // was restored) and when an event was given up on: changes may have been missed. A module that keeps records lists
  // them here through its read route and replaces its copy. The example keeps notes only, so it drops the ones it
  // can no longer trust.
  async readAll(reason, { service, log }) {
    if (reason === 'start') return
    const { error } = await service.from('calendar_changes').delete().neq('event', '')
    if (error) throw new Error(error.message)
    log(`calendar notes dropped: ${reason}`)
  },
}

export function registerAppEvents() {
  return followHubEvents(EVENTS)
}
