// The only reader of the process environment (brax-security-rbs step 1, "one accessor"). Server-only: imported by
// *.server.ts files, the jobs and the Node entry; nothing under src/routes or src/components may import it.
// Everything has a local default so a developer needs no environment file: PGlite under .data/, no credential, the
// gateway stub's keys on 38400.
//
// Settings a hub passes as Docker secrets arrive as NAME_FILE (a path under /run/secrets); the file wins over NAME.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type AppEnvName = 'local' | 'lab' | 'hub'

export interface AppEnv {
  appEnv: AppEnvName
  port: number
  /** The app's root: module.yaml, supabase/, dist/ live here. */
  root: string
  /** pgdata, files, outbox and snapshots live under here: .data/ locally, the module volume (/data) on a hub. */
  dataDir: string
  /** tinbase engine: native Postgres on Linux and macOS, PGlite on Windows; TINBASE_ENGINE overrides. */
  engine: 'native' | 'pglite'
  /** Where the native engine's Postgres binaries are (baked into the image at /opt/tinbase-pg; ~/.cache/tinbase locally). */
  pgCacheDir: string | undefined
  /** The HS256 secret tinbase signs every token with. A dev default exists only when APP_ENV=local. */
  jwtSecret: string
  /** The built client the production process serves (dist/client); unused in development, where Vite serves it. */
  clientDir: string
  /** LCC behind the hub's edge, reached over mTLS with the module credential. */
  lccUrl: string
  /** The module credential directory (module.key, module.crt, root.crt, module.json), or null when there is none. */
  credentialDir: string | null
  /** TLS name to expect on LCC's certificate; defaults to the host of module.json's lcc.url, then hub_domain. */
  lccTlsName: string | undefined
  /** Local only: where the tool gateway stub serves its keys instead of LCC's /services/module/gateway-keys. */
  gatewayKeysUrl: string | undefined
  /** Local only: a stand-in hub for the event feed (tooling/hub-events-stub.mjs), followed when there is no credential. */
  hubEventsUrl: string | undefined
  /** 'off' stops the job runner in this process (the suites, the RLS test). */
  jobs: 'on' | 'off'
}

let cached: AppEnv | undefined

function setting(name: string): string | undefined {
  const file = process.env[`${name}_FILE`]
  if (file) return readFileSync(file, 'utf8').trim()
  return process.env[name] || undefined
}

function appEnvName(raw: string | undefined): AppEnvName {
  if (raw === undefined || raw === '' || raw === 'local') return 'local'
  if (raw === 'lab' || raw === 'hub') return raw
  throw new Error(`APP_ENV must be local, lab or hub (got ${raw})`)
}

export function getEnv(): AppEnv {
  if (cached) return cached
  const appEnv = appEnvName(process.env.APP_ENV)
  const root = resolve(process.env.APP_ROOT || process.cwd())
  const dataDir = resolve(process.env.DATA_DIR || (appEnv === 'local' ? join(root, '.data') : '/data'))
  const engineRaw = process.env.TINBASE_ENGINE
  const engine = engineRaw === 'native' || engineRaw === 'pglite' ? engineRaw : process.platform === 'win32' ? 'pglite' : 'native'
  const jwtSecret = setting('JWT_SECRET')
  if (!jwtSecret && appEnv !== 'local') throw new Error('JWT_SECRET_FILE (or JWT_SECRET) is required outside APP_ENV=local')
  const credentialDir = process.env.MODULE_CREDENTIAL_DIR || (appEnv === 'local' ? null : '/credential')
  cached = {
    appEnv,
    port: Number(process.env.PORT ?? 8080),
    root,
    dataDir,
    engine,
    pgCacheDir: process.env.TINBASE_PG_CACHE_DIR || undefined,
    // The local default is deliberately not Supabase's public demo secret: tinbase refuses that one on a non-loopback
    // bind, and a module never binds tinbase anywhere anyway.
    jwtSecret: jwtSecret ?? 'brax-local-dev-secret-not-for-a-hub-0123456789',
    clientDir: process.env.CLIENT_DIR || join(root, 'dist', 'client'),
    lccUrl: (process.env.LCC_URL || 'https://lcc-edge:8443').replace(/\/+$/, ''),
    credentialDir: credentialDir && existsSync(credentialDir) ? credentialDir : null,
    lccTlsName: process.env.LCC_TLS_NAME || undefined,
    gatewayKeysUrl: appEnv === 'local' ? process.env.GATEWAY_KEYS_URL || 'http://127.0.0.1:38400/gateway-keys' : undefined,
    hubEventsUrl: appEnv === 'local' ? process.env.HUB_EVENTS_URL || undefined : undefined,
    jobs: process.env.JOBS === 'off' ? 'off' : 'on',
  }
  return cached
}
