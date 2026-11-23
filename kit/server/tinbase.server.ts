// tinbase, booted once per process and never listening on a port (brax-data step 1). The browser never reaches it:
// every query goes through backend.fetch from memberClient(ctx) or serviceClient(reason) in db/client.server.ts.
//
// Engine: native embedded Postgres 17 on Linux and macOS (a unix socket in a private directory, never TCP), PGlite on
// Windows (TINBASE_ENGINE overrides). Data under DATA_DIR/pgdata, stored files under DATA_DIR/files, mail the app
// sends under DATA_DIR/outbox until the hub has a mail route. Migrations and the seed come from supabase/ the way the
// Supabase CLI reads them. The hub signs people in, so GoTrue is off (authEnabled: false) and /auth/v1 answers 404.
//
// One backend per process: Vite re-evaluates this module on change (and once per module runner), and a second
// engine on the same data directory neither sees nor keeps the first one's writes, so the boot promise is kept on
// globalThis and reused.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createBackend, type MailMessage, type Mailer, type TinbaseBackend } from 'tinbase'
import { createNativeEngine, FsStorageDriver, loadSupabaseProject } from 'tinbase/node'
import { getEnv } from './env.server'

/** Buckets created at boot if absent; private, so storage.objects policies decide who reads what. */
export const BUCKETS = [
  { id: 'documents', public: false, fileSizeLimit: 50 * 1024 * 1024, allowedMimeTypes: null },
  { id: 'images', public: false, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] },
]

/** Mail the app sends lands as a file under DATA_DIR/outbox: LCC's module API has no sending route yet (brax-hub-module 6). */
export function outboxMailer(dir: string): Mailer & { dir: string } {
  return {
    dir,
    async send(msg: MailMessage) {
      mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const to = msg.to.replace(/[^a-z0-9@._-]/gi, '_')
      writeFileSync(join(dir, `${stamp}-${to}.eml`), `To: ${msg.to}\nSubject: ${msg.subject}\nContent-Type: text/plain; charset=utf-8\n\n${msg.text}\n`)
    },
  }
}

const KEY = Symbol.for('brax.tinbase.backend')

async function boot(): Promise<TinbaseBackend> {
  const env = getEnv()
  mkdirSync(env.dataDir, { recursive: true })
  // The seed (demo data) loads locally and on a lab hub only; a real install (APP_ENV=hub) always starts empty.
  const project = await loadSupabaseProject(env.root, { enabled: env.appEnv !== 'hub' })
  const log = (msg: string) => console.log(JSON.stringify({ at: new Date().toISOString(), tinbase: msg }))
  const engine = env.engine === 'native' ? await createNativeEngine({ dataDir: join(env.dataDir, 'pgdata'), cacheDir: env.pgCacheDir, log }) : undefined
  const backend = await createBackend({
    ...project, // migrations: supabase/migrations/*.sql, seedSql: supabase/seed.sql (once, on an empty database; not on APP_ENV=hub)
    authEnabled: false,
    ...(engine ? { engine } : { dataDir: join(env.dataDir, 'pgdata') }),
    jwtSecret: env.jwtSecret,
    buckets: BUCKETS,
    storageDriver: new FsStorageDriver(join(env.dataDir, 'files')),
    mailer: outboxMailer(join(env.dataDir, 'outbox')),
    log,
  })
  if (backend.db.migrationFailure) {
    const f = backend.db.migrationFailure
    await backend.close()
    throw new Error(`migration ${f.name} failed: ${f.error}${f.skipped.length ? ` (not attempted: ${f.skipped.join(', ')})` : ''}`)
  }
  const stop = () => {
    backend.close().then(() => process.exit(0), () => process.exit(1))
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  return backend
}

const held = globalThis as unknown as Record<symbol, Promise<TinbaseBackend> | undefined>
export const backendPromise: Promise<TinbaseBackend> = (held[KEY] ??= boot())
export const backend = await backendPromise
export const anonKey = backend.anonKey
export const serviceRoleKey = backend.serviceRoleKey
