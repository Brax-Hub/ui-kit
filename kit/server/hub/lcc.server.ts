// The module's client for the hub's control service (LCC) over mTLS through lcc-edge:8443 (BRAX-HUB-MODULES.md
// section 4; lcc app/modules.py and app/module_routes.py at origin/main). The module presents the certificate hubctl
// wrote at install (MODULE_CREDENTIAL_DIR: module.key, module.crt with its chain, root.crt, module.json) and LCC
// resolves it to an active module, then checks the granted scope per route.
//
// Every call returns a Result and never throws for the states a feature must show instead of an error:
//   { ok: false, reason: 'no_hub' }        no credential directory (local development, the suites)
//   { ok: false, reason: 'not_enabled' }   403 scope_required (the owner did not grant the scope) or module_not_active
//   { ok: false, reason: 'error' }         any other refusal, with the status and LCC's error code
//   { ok: false, reason: 'unreachable' }   no connection
import { readFileSync } from 'node:fs'
import { Agent, request as httpsRequest } from 'node:https'
import { join } from 'node:path'
import { getEnv } from '../env.server'

export type LccResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'no_hub' }
  | { ok: false; reason: 'not_enabled'; code: string }
  | { ok: false; reason: 'error'; status: number; code: string }
  | { ok: false; reason: 'unreachable'; message: string }

/** GET /services/module/me: the module as LCC knows it, with the scopes the owner granted. */
export interface ModuleMe {
  module_id: string
  slug: string
  kind: string
  principal: string
  scopes: string[]
  hub_domain: string
  xmpp_domain: string
}

/** GET /services/module/people (people.read): the org, its people, teams (the hub's groups), relations and this module's consents. */
export interface HubPeople {
  org: { id: string; kind: string; name: string; owner: string | null }
  people: { id: string; username: string; role: string; display_name: string; kind: string; birth_year: number | null; age_band: string | null }[]
  teams: { id: string; org: string; name: string; lead: string | null; members: string[]; created_at: string }[]
  relations: unknown[]
  consents: { person: string; scopes: string[]; by: string }[]
}

/** GET /services/module/contacts (contacts.read): chat addresses of the hub's members. */
export interface HubContacts {
  items: { address: string; display_name: string; role: string }[]
}

/** POST /services/module/chat/cards (chat.send): an info, result or status card to one member, signed by LCC. */
export interface SendCard {
  /** A membership id or a bare JID. */
  to: string
  kind: 'info' | 'result' | 'status'
  /** A card id this manifest declares under cards[]; its kind must match. */
  template?: string
  /** The card document (title, body, ...; no actions: a module may not send choice or form cards). */
  card: Record<string, unknown>
  /** The member the module acts for, when the card is on someone's behalf (Brax-Acting-Member). */
  actingMember?: string
}

export interface SentCard {
  id: string
  card_id: string
  kid: string
  message_id: string
  from: string
  to: string
  provenance: unknown
}

/** POST /api/requests (requests.create, or none for scope_consent): a question the hub asks someone with a choice card. */
export interface CreateRequest {
  subject: string
  ask?: Record<string, unknown>
  answers?: string[]
  expires_in?: number
}

export interface GatewayKey {
  kid: string
  alg: string
  pub: string
}

export interface Credential {
  key: Buffer
  cert: Buffer
  ca: Buffer
  servername: string | undefined
}

let credential: Credential | null | undefined
let agent: Agent | undefined

function loadCredential(): Credential | null {
  if (credential !== undefined) return credential
  const env = getEnv()
  if (!env.credentialDir) return (credential = null)
  const dir = env.credentialDir
  let servername = env.lccTlsName
  try {
    const meta = JSON.parse(readFileSync(join(dir, 'module.json'), 'utf8')) as { hub_domain?: string; lcc?: { url?: string } }
    if (!servername && meta.lcc?.url) servername = new URL(meta.lcc.url).hostname
    if (!servername && meta.hub_domain) servername = meta.hub_domain
  } catch {
    // module.json is optional: hubctl writes it, a hand-made credential may not
  }
  credential = {
    key: readFileSync(join(dir, 'module.key')),
    cert: readFileSync(join(dir, 'module.crt')),
    ca: readFileSync(join(dir, 'root.crt')),
    servername,
  }
  return credential
}

function tlsAgent(c: Credential): Agent {
  return (agent ??= new Agent({ key: c.key, cert: c.cert, ca: c.ca, servername: c.servername, keepAlive: true }))
}

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<LccResult<T>> {
  const c = loadCredential()
  if (!c) return { ok: false, reason: 'no_hub' }
  const env = getEnv()
  const url = new URL(env.lccUrl + path)
  const payload = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((resolve) => {
    const req = httpsRequest(
      url,
      {
        method,
        agent: tlsAgent(c),
        headers: { accept: 'application/json', ...(payload ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) } : {}), ...headers },
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json: unknown = null
          try {
            json = text ? JSON.parse(text) : null
          } catch {
            json = null
          }
          const status = res.statusCode ?? 0
          if (status >= 200 && status < 300) return resolve({ ok: true, value: json as T })
          const code = errorCode(json)
          if (status === 403 && (code === 'scope_required' || code === 'module_not_active')) return resolve({ ok: false, reason: 'not_enabled', code })
          resolve({ ok: false, reason: 'error', status, code })
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (error) => resolve({ ok: false, reason: 'unreachable', message: error.message }))
    if (payload) req.write(payload)
    req.end()
  })
}

/** LCC answers FastAPI-style: {"detail": "scope_required"} or {"error": {"code": ...}}. */
function errorCode(json: unknown): string {
  if (!json || typeof json !== 'object') return 'unknown'
  const o = json as { detail?: unknown; error?: unknown }
  if (typeof o.detail === 'string') return o.detail
  if (o.error && typeof o.error === 'object' && typeof (o.error as { code?: unknown }).code === 'string') return (o.error as { code: string }).code
  if (typeof o.error === 'string') return o.error
  return 'unknown'
}

/** The module credential, or null without a hub. For a client that holds its own connection (hub/events.server.ts). */
export const moduleCredential = (): Credential | null => loadCredential()

export const lcc = {
  /** True when a credential exists, i.e. the module runs inside a hub. */
  hasHub: () => loadCredential() !== null,
  me: () => call<ModuleMe>('GET', '/services/module/me'),
  people: () => call<HubPeople>('GET', '/services/module/people'),
  contacts: () => call<HubContacts>('GET', '/services/module/contacts'),
  sendCard: ({ to, kind, template, card, actingMember }: SendCard) =>
    call<SentCard>('POST', '/services/module/chat/cards', { to, ...(template ? { template } : {}), card: { ...card, kind } }, actingMember ? { 'brax-acting-member': actingMember } : {}),
  createRequest: (kind: string, body: CreateRequest) => call<Record<string, unknown>>('POST', '/api/requests', { kind, ...body }),
  /** The tool gateway's token keys, to verify delegated tokens (CONTRACT-AI-0.1 section 25.3). Locally GATEWAY_KEYS_URL names the stub. */
  gatewayKeys: async (): Promise<LccResult<GatewayKey[]>> => {
    const env = getEnv()
    if (env.appEnv === 'local' && env.gatewayKeysUrl && !loadCredential()) {
      try {
        const res = await fetch(env.gatewayKeysUrl)
        if (!res.ok) return { ok: false, reason: 'error', status: res.status, code: 'gateway_stub' }
        const json = (await res.json()) as { keys?: GatewayKey[] }
        return { ok: true, value: json.keys ?? [] }
      } catch (error) {
        return { ok: false, reason: 'unreachable', message: error instanceof Error ? error.message : String(error) }
      }
    }
    const result = await call<{ keys: GatewayKey[] }>('GET', '/services/module/gateway-keys')
    return result.ok ? { ok: true, value: result.value.keys ?? [] } : result
  },
}

export type Lcc = typeof lcc
