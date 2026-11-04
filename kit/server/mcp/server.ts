// The module's MCP server at <entry>mcp (ADR-022 D2; CONTRACT-AI-0.1 section 25.3): Streamable HTTP at revision
// 2025-11-25 in the form the hub's tool gateway speaks (brax-chat crates/tool-gateway/src/mcp/client.rs): one JSON-RPC
// 2.0 message per POST, answered as application/json, no batches, no server-initiated stream, no session state (the
// gateway opens a session per call: initialize, notifications/initialized, tools/call).
//
// tools/list is generated from module.yaml and nothing else, so it equals the manifest byte for byte: the gateway
// compares the two at registration and offers no tool that differs (ADR-022 rule 5).
//
// tools/call runs only after verifyDelegatedToken accepted the Bearer the gateway minted for this exact call (60 s,
// Ed25519, bound to this module, the caller, the acting person, the tool, its version and the arguments' digest),
// with keys from LCC's GET /services/module/gateway-keys (cached; refreshed once on an unknown kid). The handler
// then acts as the acting member: the membership behind the token's act.sub, the member token, memberClient.
// A bad, expired, replayed or mismatched token is a JSON-RPC error, logged with the code word and nothing else;
// a refusal the model should read (no such member, the handler failed) is a tool result with isError.
//
// The official @modelcontextprotocol/sdk supports this revision, but its server generates tools/list from its own
// registry and wraps the HTTP path in sessions and SSE; the hand-written handler below keeps the manifest as the one
// source of the tool list and the token check as the one gate before a handler, which the scanner can see.
import { memberClient, type MemberClient } from '../db/client.server'
import { findMemberByHubId, type MemberContext } from '../hub/identity.server'
import { lcc } from '../hub/lcc.server'
import { handlers as appHandlers } from '../tools'
import { argsSha256, ReplayLog, TokenError, verifyDelegatedToken, type GatewayKey } from './delegated-token'
import { entryOf, inputSchemaOf, loadManifest, toolVersion, type Manifest } from './manifest'

export const MCP_REVISION = '2025-11-25'
export const MCP_OLDER_REVISION = '2025-06-18'
export const MAX_MCP_BODY = 256 * 1024
const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
/** Application errors for a refused delegated token: -32000 minus nothing, one code, the word in `data.code`. */
const TOKEN_REFUSED = -32001
const UNAUTHENTICATED = -32002

export interface ToolTextContent {
  type: 'text'
  text: string
}

export interface ToolResult {
  content: ToolTextContent[]
  structuredContent?: unknown
  isError?: boolean
}

export interface ToolCall {
  member: MemberContext
  client: MemberClient
  args: Record<string, unknown>
  /** net.braxtech/call_id from the gateway, for idempotent handlers. */
  callId: string | null
}

/** A handler returns a ToolResult, or any JSON value which becomes text plus structuredContent. */
export type ToolHandler = (call: ToolCall) => Promise<ToolResult | unknown>

export interface McpServerOptions {
  manifest?: Manifest
  handlers: Record<string, ToolHandler>
  /** Where the keys come from; lcc.gatewayKeys() unless a test injects its own. */
  gatewayKeys?: () => Promise<{ ok: true; value: GatewayKey[] } | { ok: false; reason: string }>
  findMember?: (hubMemberId: string) => Promise<MemberContext | null>
  clientFor?: (member: MemberContext) => Promise<MemberClient>
  now?: () => number
}

type Json = Record<string, unknown>

function rpcResult(id: unknown, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

function rpcError(status: number, id: unknown, code: number, message: string, data?: Json): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

function toolError(code: string, message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: code }], structuredContent: { error: { code, message } } }
}

function asResult(value: unknown): ToolResult {
  if (value && typeof value === 'object' && Array.isArray((value as ToolResult).content)) return value as ToolResult
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  return { content: [{ type: 'text', text }], ...(typeof value === 'string' ? {} : { structuredContent: value ?? null }) }
}

function log(event: Json) {
  console.warn(JSON.stringify({ at: new Date().toISOString(), mcp: event }))
}

/** Build the request handler once; mount it at `<entry>mcp`. */
export function createMcpServer(options: McpServerOptions) {
  const manifest = options.manifest ?? loadManifest()
  const tools = manifest.tools ?? []
  const byName = new Map(tools.map((t) => [t.name, t]))
  const gatewayKeys = options.gatewayKeys ?? lcc.gatewayKeys
  const findMember = options.findMember ?? findMemberByHubId
  const clientFor = options.clientFor ?? memberClient
  const now = options.now ?? (() => Math.floor(Date.now() / 1000))
  const replay = new ReplayLog()
  let keys: GatewayKey[] = []
  let keysAt = 0

  for (const t of tools) if (!options.handlers[t.name]) throw new Error(`module.yaml names tool ${t.name} but no handler is registered`)
  for (const name of Object.keys(options.handlers)) if (!byName.has(name)) throw new Error(`handler ${name} is not a tool in module.yaml`)

  async function refreshKeys(force: boolean) {
    const t = Date.now()
    if (!force && keys.length && t - keysAt < 10 * 60_000) return
    if (force && t - keysAt < 5_000 && keysAt) return // an unknown kid refreshes at most once per 5 s
    const result = await gatewayKeys()
    if (result.ok) {
      keys = result.value
      keysAt = t
    } else log({ event: 'gateway_keys_unavailable', reason: result.reason })
  }

  async function callTool(id: unknown, params: Json, request: Request): Promise<Response> {
    const name = typeof params.name === 'string' ? params.name : ''
    const tool = byName.get(name)
    if (!tool) {
      log({ event: 'unknown_tool', tool: name })
      return rpcError(404, id, METHOD_NOT_FOUND, `unknown tool ${name}`, { code: 'unknown_tool' })
    }
    const args = (params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments : {}) as Json
    const meta = (params._meta && typeof params._meta === 'object' ? params._meta : {}) as Json
    const callId = typeof meta['net.braxtech/call_id'] === 'string' ? (meta['net.braxtech/call_id'] as string) : null
    const authorization = request.headers.get('authorization') ?? ''
    const [scheme, token] = authorization.split(/\s+/, 2)
    if (!token || scheme?.toLowerCase() !== 'bearer') {
      log({ event: 'token_missing', tool: name })
      return rpcError(401, id, UNAUTHENTICATED, 'a delegated token from the tool gateway is required', { code: 'token_required' })
    }
    const expected = { aud: manifest.slug, tool: name, toolVersion: toolVersion(tool), args }
    let claims
    try {
      await refreshKeys(false)
      try {
        claims = verifyDelegatedToken(token, keys, expected, replay, now())
      } catch (error) {
        if (!(error instanceof TokenError) || error.code !== 'unknown_kid') throw error
        await refreshKeys(true)
        claims = verifyDelegatedToken(token, keys, expected, replay, now())
      }
    } catch (error) {
      if (error instanceof TokenError) {
        log({ event: 'token_refused', tool: name, code: error.code, ...(error.kid ? { kid: error.kid } : {}) })
        return rpcError(403, id, TOKEN_REFUSED, `delegated token refused: ${error.code}`, { code: error.code })
      }
      throw error
    }
    const member = await findMember(claims.act.sub)
    if (!member) {
      log({ event: 'member_unknown', tool: name, jti: claims.jti })
      return rpcResult(id, toolError('member_unknown', 'the acting person has not opened this module yet'))
    }
    if (member.status !== 'active') return rpcResult(id, toolError('member_inactive', 'the acting person is inactive in this module'))
    const started = Date.now()
    try {
      const client = await clientFor(member)
      const value = await options.handlers[name]!({ member, client, args, callId })
      const result = asResult(value)
      return rpcResult(id, { ...result, _meta: { 'net.braxtech/tool_version': expected.toolVersion, 'net.braxtech/duration_ms': Date.now() - started, 'net.braxtech/delegated_token_id': claims.jti } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log({ event: 'tool_failed', tool: name, jti: claims.jti, message: message.slice(0, 300) })
      return rpcResult(id, toolError('tool_failed', message.slice(0, 300)))
    }
  }

  async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
    const length = Number(request.headers.get('content-length') ?? 0)
    if (length > MAX_MCP_BODY) return rpcError(413, null, INVALID_REQUEST, 'message too large')
    let message: unknown
    try {
      const text = await request.text()
      if (text.length > MAX_MCP_BODY) return rpcError(413, null, INVALID_REQUEST, 'message too large')
      message = JSON.parse(text)
    } catch {
      return rpcError(400, null, PARSE_ERROR, 'not JSON')
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return rpcError(400, null, INVALID_REQUEST, 'one JSON-RPC message per POST')
    const m = message as Json
    const method = typeof m.method === 'string' ? m.method : null
    if (!method) return rpcError(400, null, INVALID_REQUEST, 'no method')
    const params = (m.params && typeof m.params === 'object' ? m.params : {}) as Json
    if (!('id' in m) || m.id === undefined) return new Response(null, { status: 202 }) // a notification: nothing to answer
    const id = m.id
    const revision = request.headers.get('mcp-protocol-version')
    if (method === 'initialize') {
      const asked = typeof params.protocolVersion === 'string' && [MCP_REVISION, MCP_OLDER_REVISION].includes(params.protocolVersion) ? params.protocolVersion : MCP_REVISION
      return rpcResult(id, { protocolVersion: asked, capabilities: { tools: {} }, serverInfo: { name: manifest.slug, version: manifest.version } })
    }
    if (revision && revision !== MCP_REVISION && revision !== MCP_OLDER_REVISION) return rpcError(400, id, INVALID_REQUEST, `unsupported MCP-Protocol-Version ${revision}`)
    switch (method) {
      case 'ping':
        return rpcResult(id, {})
      case 'tools/list':
        return rpcResult(id, { tools: tools.map((t) => ({ name: t.name, ...(t.description ? { description: t.description } : {}), inputSchema: inputSchemaOf(t) })) })
      case 'tools/call':
        if (typeof params.name !== 'string') return rpcError(400, id, INVALID_PARAMS, 'tools/call names no tool')
        return callTool(id, params, request)
      default:
        return rpcError(404, id, METHOD_NOT_FOUND, `unknown method ${method}`)
    }
  }

  return {
    handle,
    /** The path the server is mounted at: <entry>mcp. */
    path: entryOf(manifest) + 'mcp',
    manifest,
    argsSha256,
  }
}

export type McpServer = ReturnType<typeof createMcpServer>

let instance: McpServer | undefined

/** The app's server: module.yaml plus the handlers under src/server/tools, built once. */
export function mcpServer(): McpServer {
  return (instance ??= createMcpServer({ handlers: appHandlers }))
}
