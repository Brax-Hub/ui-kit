// The stub edge for local development and CI (brax-hub-module step 2): a Vite dev-server middleware that plays the
// hub by injecting the three member headers for a seeded member. It must never load outside APP_ENV=local, and the
// security scan checks that nothing in src/ imports it and that vite.config.ts loads it only in development.
//
// vite.config.ts (development only):
//   plugins: [ ...(mode === 'development' ? [devMemberPlugin()] : []), tanstackStart(), viteReact() ]
//
// Which member: the DEV_MEMBER environment variable (default "owner"), overridden per request by ?as=<role|id> (which
// also sets the brax-dev-member cookie so the following requests keep it) so the suites can switch role mid-run.
// Seeded ids follow supabase/seed.sql: dev-owner, dev-admin, dev-member, dev-viewer.
//
// The MCP path (<entry>mcp) gets no member headers: the tool gateway reaches it on the module network with a
// delegated token and nothing else, and the server must refuse anything that is not that token.
import type { Plugin } from 'vite'

export const SEEDED: Record<string, { id: string; name: string; role: 'owner' | 'admin' | 'member' }> = {
  owner: { id: 'dev-owner', name: 'Olivia Owner', role: 'owner' },
  admin: { id: 'dev-admin', name: 'Adam Admin', role: 'admin' },
  member: { id: 'dev-member', name: 'Mia Member', role: 'member' },
  viewer: { id: 'dev-viewer', name: 'Victor Viewer', role: 'member' }, // viewer is an app-level role on the membership row
}

export function pick(key: string | undefined) {
  if (!key) return SEEDED.owner!
  if (SEEDED[key]) return SEEDED[key]!
  const byId = Object.values(SEEDED).find((m) => m.id === key)
  return byId ?? { id: key, name: key, role: 'member' as const }
}

export function devMemberPlugin(options: { mcpPath?: string } = {}): Plugin {
  return {
    name: 'brax-dev-member',
    apply: 'serve',
    configureServer(server) {
      if ((process.env.APP_ENV ?? 'local') !== 'local') throw new Error('brax-dev-member only runs with APP_ENV=local')
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const names = ['x-brax-member-id', 'x-brax-member-name', 'x-brax-member-role']
        const strip = () => {
          const raw: string[] = []
          for (let i = 0; i < req.rawHeaders.length; i += 2) {
            if (!names.includes(req.rawHeaders[i]!.toLowerCase())) raw.push(req.rawHeaders[i]!, req.rawHeaders[i + 1]!)
          }
          req.rawHeaders.splice(0, req.rawHeaders.length, ...raw)
          for (const name of names) delete req.headers[name]
        }
        if (options.mcpPath && url.pathname === options.mcpPath) {
          strip()
          return next()
        }
        const cookie = /(?:^|;\s*)brax-dev-member=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
        const as = url.searchParams.get('as') ?? (cookie ? decodeURIComponent(cookie) : undefined) ?? process.env.DEV_MEMBER
        const m = pick(as ?? undefined)
        if (url.searchParams.get('as')) res.setHeader('Set-Cookie', `brax-dev-member=${encodeURIComponent(as!)}; Path=/; SameSite=Lax`)
        // Exactly what the hub's edge does: drop anything the client sent in these names, then set them. Both the
        // parsed headers and the raw wire list, because the server's Request answers a single header from the parsed
        // object but rebuilds the whole set from the wire list once a body is read as form data.
        strip()
        const values: Record<string, string> = { 'x-brax-member-id': m.id, 'x-brax-member-name': encodeURIComponent(m.name), 'x-brax-member-role': m.role }
        for (const [name, value] of Object.entries(values)) {
          req.headers[name] = value
          req.rawHeaders.push(name, value)
        }
        next()
      })
    },
  }
}
