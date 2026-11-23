#!/usr/bin/env node
// A local stand-in for the hub's tool gateway (brax-chat crates/tool-gateway), so the MCP path is testable without a
// hub. It holds a dev Ed25519 key, serves the keys in the shape of LCC's GET /services/module/gateway-keys
// ({ keys: [{ kid, alg: 'EdDSA', pub }] }), and can mint a delegated token (ADR-022 D5) and call a tool through the
// app's MCP server the way the gateway does: initialize, notifications/initialized, tools/call with the token.
//
//   node kit/dev/gateway-stub.mjs serve [--port 38400]
//   node kit/dev/gateway-stub.mjs call <tool> '<json args>' [--as owner|admin|member|viewer|<hub member id>]
//        [--url http://localhost:3310/modules/<slug>/mcp] [--aud <slug>] [--caller agent:agt_dev] [--version 1]
//        [--expired] [--replay] [--bad-args]      (refusals, to see the server say no)
//   node kit/dev/gateway-stub.mjs keys
//
// The key lives in .data/gateway-stub/token.key (kid gw-local-<date>), like the gateway's state directory. `call`
// serves the keys on the port for the duration of the call when nothing is listening there, so the app's
// GATEWAY_KEYS_URL (default http://127.0.0.1:38400/gateway-keys) answers.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PORT = Number(process.env.GATEWAY_STUB_PORT ?? 38400)
const SEEDED = { owner: 'dev-owner', admin: 'dev-admin', member: 'dev-member', viewer: 'dev-viewer' }
const TTL_S = 60

const argv = process.argv.slice(2)
const flags = {}
const positional = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const name = a.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next
      i++
    } else flags[name] = true
  } else positional.push(a)
}
const command = positional[0] ?? 'serve'

export { loadKey, publicEntry, keysServer }

function keyFile() {
  const dir = process.env.GATEWAY_STUB_DIR ?? join(process.cwd(), '.data', 'gateway-stub')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'token.key')
}

/** The dev key: { kid, private_pem }; made on first use. */
function loadKey() {
  const file = keyFile()
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    return { kid: saved.kid, privateKey: createPrivateKey(saved.private_pem) }
  }
  const { privateKey } = generateKeyPairSync('ed25519')
  const kid = `gw-local-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
  writeFileSync(file, JSON.stringify({ kid, private_pem: privateKey.export({ type: 'pkcs8', format: 'pem' }) }, null, 2), { mode: 0o600 })
  return { kid, privateKey }
}

function publicEntry({ kid, privateKey }) {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' })
  return { kid, alg: 'EdDSA', pub: Buffer.from(jwk.x, 'base64url').toString('base64') }
}

/** RFC 8785 canonical JSON, integers only, as the gateway's canonicaliser. */
function canonical(value) {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error('arguments carry a non-integer number; the gateway refuses those')
    return String(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
}

export const argsSha256 = (args) => 'sha256:' + createHash('sha256').update(canonical(args), 'utf8').digest('hex')
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

/** Mint a delegated token exactly as tool-gateway/src/token.rs does. */
export function mint(key, binding, nowS = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'EdDSA', typ: 'brax-dt+jwt', kid: key.kid }
  const jti = 'dtk_' + randomBytes(16).toString('base64url')
  const claims = {
    iss: 'svc-tool-gateway',
    aud: binding.aud,
    sub: binding.sub,
    act: { sub: binding.acting },
    hub: binding.hub,
    tool: binding.tool,
    tool_version: binding.toolVersion,
    args_sha256: binding.argsSha256,
    jti,
    iat: nowS,
    exp: nowS + TTL_S,
  }
  const input = `${b64url(header)}.${b64url(claims)}`
  const signature = sign(null, Buffer.from(input, 'utf8'), key.privateKey)
  return { token: `${input}.${signature.toString('base64url')}`, jti, exp: claims.exp }
}

function keysServer(key, port) {
  const body = JSON.stringify({ keys: [publicEntry(key)] })
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'GET' && (url.pathname === '/gateway-keys' || url.pathname === '/services/module/gateway-keys')) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      return res.end(body)
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end('{"error":"not_found"}')
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

async function post(url, message, headers = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(message) })
  const text = await res.text()
  if (message.id === undefined) return { status: res.status }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  return { status: res.status, json }
}

async function readManifestSlug() {
  for (const candidate of ['module.yaml', 'kit/example/module.yaml']) {
    const file = join(process.cwd(), candidate)
    if (!existsSync(file)) continue
    const slug = /^slug:\s*['"]?([a-z0-9_-]+)/m.exec(readFileSync(file, 'utf8'))?.[1]
    if (slug) return slug
  }
  return 'example'
}

async function main() {
  const key = loadKey()
  if (command === 'keys') return console.log(JSON.stringify({ keys: [publicEntry(key)] }, null, 2))
  if (command === 'serve') {
    const port = Number(flags.port ?? PORT)
    await keysServer(key, port)
    return console.log(`gateway stub: keys at http://127.0.0.1:${port}/gateway-keys (kid ${key.kid})`)
  }
  if (command !== 'call') throw new Error('usage: gateway-stub.mjs serve | call <tool> <json> [--as owner] | keys')
  const tool = positional[1]
  if (!tool) throw new Error('call needs a tool name')
  const args = positional[2] ? JSON.parse(positional[2]) : {}
  const slug = flags.aud ?? (await readManifestSlug())
  const url = flags.url ?? `http://localhost:3310/modules/${slug}/mcp`
  const as = flags.as ?? 'owner'
  const acting = SEEDED[as] ?? as
  const port = Number(flags.port ?? PORT)
  let server = null
  try {
    server = await keysServer(key, port)
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error // someone (serve) already answers there
  }
  try {
    const init = await post(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'gateway-stub', version: '0' } } })
    if (!init.json?.result) throw new Error(`initialize failed: ${JSON.stringify(init.json)}`)
    const revision = init.json.result.protocolVersion
    await post(url, { jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-protocol-version': revision })
    const digest = argsSha256(flags['bad-args'] ? { ...args, tampered: true } : args)
    const now = Math.floor(Date.now() / 1000) - (flags.expired ? 600 : 0)
    const minted = mint(key, { aud: slug, sub: flags.caller ?? 'agent:agt_dev', acting, hub: flags.hub ?? 'hub_local', tool, toolVersion: Number(flags.version ?? 1), argsSha256: digest }, now)
    const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args, _meta: { 'net.braxtech/call_id': 'call_' + randomBytes(6).toString('hex') } } }
    const headers = { 'mcp-protocol-version': revision, authorization: `Bearer ${minted.token}` }
    const answer = await post(url, call, headers)
    console.log(JSON.stringify(answer.json, null, 2))
    if (flags.replay) {
      const again = await post(url, call, headers)
      console.log('replay:', JSON.stringify(again.json))
    }
    if (answer.json?.error || answer.json?.result?.isError) process.exitCode = 2
  } finally {
    server?.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('gateway-stub:', error.message)
    process.exit(1)
  })
}
