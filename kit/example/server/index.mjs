// The container's process: serve the built app on PORT with tinbase and the job runner inside. Copied to
// dist/server/index.js by the build (tooling/build-server.mjs) so `node dist/server/index.js` is the entrypoint.
//
// Environment (src/server/env.server.ts reads it): PORT (8080), DATA_DIR (/data), JWT_SECRET_FILE, LCC_URL,
// MODULE_CREDENTIAL_DIR (/credential), TINBASE_ENGINE (native), TINBASE_PG_CACHE_DIR (/opt/tinbase-pg), APP_ENV (hub).
// The server entry boots tinbase (migrations, then the seed on an empty database) before it answers.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from 'srvx'

const here = dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT ??= join(here, '..', '..')
process.env.CLIENT_DIR ??= join(here, '..', 'client')

const { default: app } = await import('./entry.js')
const port = Number(process.env.PORT ?? 8080)
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' })
console.log(JSON.stringify({ at: new Date().toISOString(), listening: port }))
