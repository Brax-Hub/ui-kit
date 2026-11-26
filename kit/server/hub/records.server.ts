// A person's calendar and address book in Brax Mail, reached through the hub (TASKS APM20): hub/records.ts bound to
// the module credential. An app's server side calls one function a route and writes no HTTP:
//
//   import { hubRecords, HubRecordsError } from '../hub/records.server'
//
//   const { events } = await hubRecords().listEvents(context.hubMemberId, { limit: 5, fields: ['title', 'start'] })
//   const made = await hubRecords().createEvent(context.hubMemberId, { title, start, duration: 'PT1H' }, { key })
//
// - Who: the first argument is the hub membership id of the person whose records these are, who is also the person
//   acting (`context.hubMemberId` in a server function or a tool handler). `{ person, acting }` is for acting for
//   somebody else; the hub allows it only through a person role of this module over them.
// - Where it asks: the hub's module API over mTLS with the module credential (LCC_URL, MODULE_CREDENTIAL_DIR), as
//   hub/lcc.server.ts does, on connections of its own, so a call never waits behind the event feed's open request.
//   Without a credential (local development, the suites) every call rejects with `no_hub`, unless HUB_RECORDS_URL names
//   a stand-in hub (`node tooling/hub-records-stub.mjs serve`, APP_ENV=local only).
// - What the manifest must ask for (module.yaml `scopes`): `calendar.read` to list and read events, `calendar.write`
//   to create, change and delete them, `contacts.read` to list and read contacts. `contacts.write` cannot be asked for
//   yet: the three contact writes answer 403 `scope_required` on a hub of today.
// - A refusal is a HubRecordsError: `code` (RECORDS_ERRORS lists them), `again` (whether the same call can pass),
//   `say` (a sentence for the person). Show the sentence; never the code alone.
// - A create is sent with an `Idempotency-Key`. Make it where the person acts (newIdempotencyKey() with the form) and
//   pass it as `key`, so a second submit of the same form makes no second record.
import { getEnv } from '../env.server'
import { hubTransport, type HubAddress, type HubTransport } from './event-feed'
import { moduleCredential } from './lcc.server'
import { createHubRecords, HubRecordsError, type HubRecords } from './records'

export * from './records'

interface Held {
  transport: HubTransport | null
  records: HubRecords | null
}

const KEY = Symbol.for('brax.hub.records')
const held = globalThis as unknown as Record<symbol, Held | undefined>
const holder = (): Held => (held[KEY] ??= { transport: null, records: null })
/** Requests open at once; a call past that waits for one to end. */
const CONNECTIONS = 4

/** The hub with the module credential; locally, the stand-in HUB_RECORDS_URL names; null when there is neither. */
function hubAddress(): HubAddress | null {
  const env = getEnv()
  const credential = moduleCredential()
  if (credential) return { url: env.lccUrl, tls: { key: credential.key, cert: credential.cert, ca: credential.ca, servername: credential.servername } }
  if (env.appEnv === 'local' && env.hubRecordsUrl) return { url: env.hubRecordsUrl }
  return null
}

/** Whether there is a hub to ask: false in local development without a stand-in, where every call rejects with `no_hub`. */
export const hasHubRecords = (): boolean => hubAddress() !== null

/** The client, one a process (Vite evaluating this module again makes no second set of connections). */
export function hubRecords(): HubRecords {
  const h = holder()
  if (h.records) return h.records
  const address = hubAddress()
  if (!address) {
    // Not kept: a credential or a stand-in named later is found at the next call.
    return createHubRecords({ call: () => Promise.reject(new HubRecordsError({ code: 'no_hub', what: 'call' })) })
  }
  h.transport = hubTransport(address, { connections: CONNECTIONS })
  return (h.records = createHubRecords({ call: h.transport.call }))
}

/** Close the connections kept between two calls (a graceful close, the suites). The next call opens them again. */
export function closeHubRecords(): void {
  const h = holder()
  h.transport?.close()
  h.transport = h.records = null
}
