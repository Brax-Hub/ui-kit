// The tool gateway's delegated token, verified the way brax-chat crates/tool-gateway-verify does it (ADR-022 D5,
// CONTRACT-AI-0.1 section 25.3): a compact JWS signed EdDSA (Ed25519) with typ brax-dt+jwt, issued by svc-tool-gateway,
// 60 seconds, bound to the module (aud = the slug), the caller (sub), the acting person (act.sub, a hub membership
// id), the tool name and version, and the RFC 8785 digest of the arguments. The order of checks is the crate's:
// format, header, key by kid, signature, then the claims, and the replay log last, so nothing unsigned is believed.
import { createHash, createPublicKey, verify as verifySignature, type KeyObject } from 'node:crypto'

export const ALG = 'EdDSA'
export const TYP = 'brax-dt+jwt'
export const ISSUER = 'svc-tool-gateway'
export const TTL_S = 60
export const DEFAULT_SKEW_S = 5
export const REPLAY_WINDOW_S = 120
const MAX_SAFE = Number.MAX_SAFE_INTEGER

export interface GatewayKey {
  kid: string
  alg: string
  pub: string
}

export interface Claims {
  iss: string
  aud: string
  sub: string
  act: { sub: string }
  hub: string
  tool: string
  tool_version: number
  args_sha256: string
  jti: string
  iat: number
  exp: number
}

export interface Expected {
  aud: string
  sub?: string
  acting?: string
  tool: string
  toolVersion: number
  args: unknown
}

export type TokenErrorCode =
  | 'format'
  | 'algorithm'
  | 'type'
  | 'unknown_kid'
  | 'signature'
  | 'claims'
  | 'issuer'
  | 'lifetime'
  | 'expired'
  | 'not_yet_valid'
  | 'audience'
  | 'caller'
  | 'acting'
  | 'tool'
  | 'version'
  | 'arguments'
  | 'replay'

export class TokenError extends Error {
  code: TokenErrorCode
  kid: string | undefined
  constructor(code: TokenErrorCode, kid?: string) {
    super(code)
    this.name = 'TokenError'
    this.code = code
    this.kid = kid
  }
}

/** RFC 8785 canonical JSON, integers only (the gateway's canonicaliser refuses fractions and integers beyond 2^53-1). */
export function canonical(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || Math.abs(value) > MAX_SAFE) throw new TokenError('arguments')
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    // Members sorted by their UTF-16 code units: what JavaScript's default string comparison does.
    const keys = Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}'
  }
  throw new TokenError('arguments')
}

/** `sha256:` and the hex SHA-256 of the canonical arguments. */
export function argsSha256(args: unknown): string {
  return 'sha256:' + createHash('sha256').update(canonical(args), 'utf8').digest('hex')
}

/** The jti values accepted, each with the second it may be forgotten. One per process. */
export class ReplayLog {
  private seen = new Map<string, number>()
  record(jti: string, nowS: number): boolean {
    for (const [key, forgetAt] of this.seen) if (forgetAt <= nowS) this.seen.delete(key)
    if (this.seen.has(jti)) return false
    this.seen.set(jti, nowS + REPLAY_WINDOW_S)
    return true
  }
  get size() {
    return this.seen.size
  }
}

function b64url(segment: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) throw new TokenError('format')
  return Buffer.from(segment, 'base64url')
}

function publicKey(key: GatewayKey): KeyObject | null {
  if (key.alg !== ALG) return null
  let raw: Buffer
  try {
    raw = Buffer.from(key.pub.trim(), 'base64')
  } catch {
    return null
  }
  if (raw.length !== 32) return null
  try {
    return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' })
  } catch {
    return null
  }
}

const CLAIM_KEYS = ['iss', 'aud', 'sub', 'act', 'hub', 'tool', 'tool_version', 'args_sha256', 'jti', 'iat', 'exp'].sort()

function readClaims(json: unknown): Claims {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new TokenError('claims')
  const o = json as Record<string, unknown>
  const keys = Object.keys(o).sort()
  if (keys.length !== CLAIM_KEYS.length || keys.some((k, i) => k !== CLAIM_KEYS[i])) throw new TokenError('claims')
  const act = o.act
  if (!act || typeof act !== 'object' || Array.isArray(act)) throw new TokenError('claims')
  const actKeys = Object.keys(act as object)
  if (actKeys.length !== 1 || actKeys[0] !== 'sub' || typeof (act as { sub: unknown }).sub !== 'string') throw new TokenError('claims')
  for (const k of ['iss', 'aud', 'sub', 'hub', 'tool', 'args_sha256', 'jti']) if (typeof o[k] !== 'string') throw new TokenError('claims')
  for (const k of ['tool_version', 'iat', 'exp']) if (typeof o[k] !== 'number' || !Number.isInteger(o[k]) || (o[k] as number) < 0) throw new TokenError('claims')
  return o as unknown as Claims
}

/** Read the header and claims without verifying: for logs only, never for a decision. */
export function peek(token: string): { header: { alg: string; typ: string; kid: string }; claims: Claims } {
  const parts = token.split('.')
  if (parts.length !== 3) throw new TokenError('format')
  const header = JSON.parse(b64url(parts[0]!).toString('utf8')) as { alg: string; typ: string; kid: string }
  const claims = readClaims(JSON.parse(b64url(parts[1]!).toString('utf8')))
  return { header, claims }
}

/**
 * Verify `token` for `expected` under the gateway's published `keys`. Throws TokenError with the crate's code word;
 * 'unknown_kid' carries the kid so the caller may refresh the keys once and try again.
 */
export function verifyDelegatedToken(token: string, keys: GatewayKey[], expected: Expected, replay: ReplayLog, nowS = Math.floor(Date.now() / 1000), skewS = DEFAULT_SKEW_S): Claims {
  const parts = token.split('.')
  if (parts.length !== 3) throw new TokenError('format')
  const [h, c, s] = parts as [string, string, string]
  let header: Record<string, unknown>
  try {
    header = JSON.parse(b64url(h).toString('utf8')) as Record<string, unknown>
  } catch {
    throw new TokenError('format')
  }
  if (!header || typeof header !== 'object') throw new TokenError('format')
  const headerKeys = Object.keys(header).sort()
  if (headerKeys.join(',') !== 'alg,kid,typ') throw new TokenError('format')
  if (header.alg !== ALG) throw new TokenError('algorithm')
  if (header.typ !== TYP) throw new TokenError('type')
  const kid = String(header.kid)
  const found = keys.find((k) => k.kid === kid)
  const key = found ? publicKey(found) : null
  if (!key) throw new TokenError('unknown_kid', kid)
  let signature: Buffer
  try {
    signature = b64url(s)
  } catch {
    throw new TokenError('signature')
  }
  if (signature.length !== 64 || !verifySignature(null, Buffer.from(`${h}.${c}`, 'utf8'), key, signature)) throw new TokenError('signature')
  let claims: Claims
  try {
    claims = readClaims(JSON.parse(b64url(c).toString('utf8')))
  } catch (error) {
    throw error instanceof TokenError ? error : new TokenError('claims')
  }
  if (claims.iss !== ISSUER) throw new TokenError('issuer')
  if (claims.exp < claims.iat || claims.exp - claims.iat > TTL_S) throw new TokenError('lifetime')
  if (nowS > claims.exp + skewS) throw new TokenError('expired')
  if (claims.iat > nowS + skewS) throw new TokenError('not_yet_valid')
  if (claims.aud !== expected.aud) throw new TokenError('audience')
  if (expected.sub !== undefined && expected.sub !== claims.sub) throw new TokenError('caller')
  if (expected.acting !== undefined && expected.acting !== claims.act.sub) throw new TokenError('acting')
  if (claims.tool !== expected.tool) throw new TokenError('tool')
  if (claims.tool_version !== expected.toolVersion) throw new TokenError('version')
  if (claims.args_sha256 !== argsSha256(expected.args)) throw new TokenError('arguments')
  if (!replay.record(claims.jti, nowS)) throw new TokenError('replay')
  return claims
}
