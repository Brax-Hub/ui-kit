// The stub edge for local development and CI (brax-hub-module step 2): a Vite dev-server middleware that plays the
// hub by injecting the three member headers for a seeded member. It must never load outside APP_ENV=local, and the
// security scan checks that nothing in src/ imports it.
//
// vite.config.ts (development only):
//   plugins: [ ...(mode === 'development' ? [sourceTagger(), devMemberPlugin()] : []), tailwindcss(), tanstackStart(), viteReact() ]
//
// Which member: the DEV_MEMBER environment variable (default "owner"), overridden per request by ?as=<role|id> (which
// also sets the brax-dev-member cookie so the following requests keep it) so the suites can switch role mid-run.
// Seeded ids follow brax-data step 5: dev-owner, dev-admin, dev-member, dev-viewer.
import type { Plugin } from 'vite'

const SEEDED: Record<string, { id: string; name: string; role: 'owner' | 'admin' | 'member' }> = {
  owner: { id: 'dev-owner', name: 'Olive Owner', role: 'owner' },
  admin: { id: 'dev-admin', name: 'Adam Admin', role: 'admin' },
  member: { id: 'dev-member', name: 'Mia Member', role: 'member' },
  viewer: { id: 'dev-viewer', name: 'Vic Viewer', role: 'member' }, // viewer is an app-level role on the membership row
}

function pick(key: string | undefined) {
  if (!key) return SEEDED.owner
  if (SEEDED[key]) return SEEDED[key]
  const byId = Object.values(SEEDED).find((m) => m.id === key)
  return byId ?? { id: key, name: key, role: 'member' as const }
}

export function devMemberPlugin(): Plugin {
  return {
    name: 'brax-dev-member',
    apply: 'serve',
    configureServer(server) {
      if ((process.env.APP_ENV ?? 'local') !== 'local') throw new Error('brax-dev-member only runs with APP_ENV=local')
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const cookie = /(?:^|;\s*)brax-dev-member=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
        const as = url.searchParams.get('as') ?? cookie ?? process.env.DEV_MEMBER
        const m = pick(as ?? undefined)
        if (url.searchParams.get('as')) res.setHeader('Set-Cookie', `brax-dev-member=${encodeURIComponent(as!)}; Path=/; SameSite=Lax`)
        // Exactly what the hub's edge does: drop anything the client sent in these names, then set them.
        delete req.headers['x-brax-member-id']
        delete req.headers['x-brax-member-name']
        delete req.headers['x-brax-member-role']
        req.headers['x-brax-member-id'] = m.id
        req.headers['x-brax-member-name'] = m.name
        req.headers['x-brax-member-role'] = m.role
        next()
      })
    },
  }
}
