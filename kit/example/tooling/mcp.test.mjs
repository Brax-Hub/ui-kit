// The delegated token verifier against tokens minted the gateway's way (the stub's mint is a port of
// tool-gateway/src/token.rs), and, when BASE_URL names a running dev server, the MCP server over HTTP.
// Run with `node --test tooling/mcp.test.mjs`.
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { argsSha256 as stubDigest, mint, publicEntry } from './gateway-stub.mjs'
import { argsSha256, canonical, ReplayLog, TokenError, verifyDelegatedToken } from '../src/server/mcp/delegated-token.ts'

const { privateKey } = generateKeyPairSync('ed25519')
const key = { kid: 'gw-test', privateKey }
const keys = [publicEntry(key)]
const NOW = 1_793_451_600
const args = { text: 'milk', n: 3 }
const binding = (overrides = {}) => ({ aud: 'example', sub: 'agent:agt_fixture', acting: 'dev-owner', hub: 'hub_fixture', tool: 'list_items', toolVersion: 1, argsSha256: argsSha256(args), ...overrides })
const expected = (overrides = {}) => ({ aud: 'example', tool: 'list_items', toolVersion: 1, args, ...overrides })
const refused = (fn) => {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof TokenError, `expected a TokenError, got ${error}`)
    return error.code
  }
  return 'accepted'
}

test('the canonical form is RFC 8785: sorted members, no whitespace, integers only', () => {
  assert.equal(canonical({ b: 1, a: 'x', c: [true, null, { z: 0, y: 'é\n' }] }), '{"a":"x","b":1,"c":[true,null,{"y":"é\\n","z":0}]}')
  assert.equal(argsSha256({ b: 1, a: 'x' }), argsSha256({ a: 'x', b: 1 }))
  assert.equal(argsSha256({}), stubDigest({}))
  assert.equal(argsSha256(args), stubDigest(args))
  assert.throws(() => canonical({ n: 1.5 }), /arguments/)
  assert.throws(() => canonical({ n: 2 ** 53 }), /arguments/)
})

test('a minted token round-trips and expires after 60 s plus the skew', () => {
  const m = mint(key, binding(), NOW)
  assert.match(m.jti, /^dtk_[A-Za-z0-9_-]{22}$/)
  const claims = verifyDelegatedToken(m.token, keys, expected(), new ReplayLog(), NOW)
  assert.equal(claims.act.sub, 'dev-owner')
  assert.equal(claims.exp, NOW + 60)
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected(), new ReplayLog(), NOW + 65)), 'accepted')
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected(), new ReplayLog(), NOW + 66)), 'expired')
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected(), new ReplayLog(), NOW - 5)), 'accepted')
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected(), new ReplayLog(), NOW - 6)), 'not_yet_valid')
})

test('a token is bound to the module, the tool, the version and the arguments, and is spent once', () => {
  const m = mint(key, binding(), NOW)
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected({ args: { text: 'milk', n: 4 } }), new ReplayLog(), NOW)), 'arguments')
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected({ tool: 'add_item' }), new ReplayLog(), NOW)), 'tool')
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected({ toolVersion: 2 }), new ReplayLog(), NOW)), 'version')
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected({ aud: 'other' }), new ReplayLog(), NOW)), 'audience')
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected({ sub: 'agent:agt_other' }), new ReplayLog(), NOW)), 'caller')
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected({ acting: 'dev-admin' }), new ReplayLog(), NOW)), 'acting')
  const log = new ReplayLog()
  verifyDelegatedToken(m.token, keys, expected(), log, NOW)
  assert.equal(refused(() => verifyDelegatedToken(m.token, keys, expected(), log, NOW + 1)), 'replay')
  assert.equal(log.size, 1)
})

test('keys, headers and claims are checked before anything is believed', () => {
  const m = mint(key, binding(), NOW)
  assert.equal(refused(() => verifyDelegatedToken(m.token, [], expected(), new ReplayLog(), NOW)), 'unknown_kid')
  assert.equal(refused(() => verifyDelegatedToken(m.token, [{ ...keys[0], alg: 'ES256' }], expected(), new ReplayLog(), NOW)), 'unknown_kid')
  const { privateKey: other } = generateKeyPairSync('ed25519')
  assert.equal(refused(() => verifyDelegatedToken(m.token, [publicEntry({ kid: 'gw-test', privateKey: other })], expected(), new ReplayLog(), NOW)), 'signature')
  const [h, c, s] = m.token.split('.')
  const altered = Buffer.from(Buffer.from(c, 'base64url').toString('utf8').replace('dev-owner', 'dev-admin')).toString('base64url')
  assert.equal(refused(() => verifyDelegatedToken(`${h}.${altered}.${s}`, keys, expected(), new ReplayLog(), NOW)), 'signature')
  assert.equal(refused(() => verifyDelegatedToken('a.b', keys, expected(), new ReplayLog(), NOW)), 'format')
  const header = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  assert.equal(refused(() => verifyDelegatedToken(`${header({ alg: 'none', typ: 'brax-dt+jwt', kid: 'gw-test' })}.${c}.${s}`, keys, expected(), new ReplayLog(), NOW)), 'algorithm')
  assert.equal(refused(() => verifyDelegatedToken(`${header({ alg: 'EdDSA', typ: 'JWT', kid: 'gw-test' })}.${c}.${s}`, keys, expected(), new ReplayLog(), NOW)), 'type')
  const long = mint(key, binding(), NOW)
  assert.equal(long.exp - NOW, 60)
})

test('the MCP server answers over HTTP when BASE_URL names a dev server', async (t) => {
  const base = process.env.BASE_URL
  if (!base) return t.skip('BASE_URL not set')
  const url = `${base.replace(/\/$/, '')}/mcp`
  const post = async (message, headers = {}) => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(message) })
    return { status: res.status, json: res.status === 202 ? null : await res.json() }
  }
  const list = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  assert.deepEqual(
    list.json.result.tools.map((t) => t.name),
    ['list_items', 'add_item'],
  )
  const bare = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_items', arguments: {} } })
  assert.equal(bare.json.error.data.code, 'token_required')
  mkdtempSync(join(tmpdir(), 'unused-'))
})
