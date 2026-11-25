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
//
// The hub's theme. Every page links three stylesheets of the hub after its own (ui/README.md in Brax-Hub/ui-kit,
// "Taking the UI kit into an app"): /hub/assets/ui/values.css, /hub/assets/theme.css and
// /hub/assets/fonts/hub-fonts.css. The stub answers them, so a page loads here as it does on a hub: the values are the
// installed kit's own file, the fonts stylesheet is empty (the two licensed faces are the hub's, so the system faces
// show), and the theme is empty until an accent is named the way a hub's owner names one: DEV_ACCENT=2563EB, or
// ?accent=2563EB on any page (kept in the brax-dev-accent cookie; ?accent= with nothing after it forgets it). Six hex
// digits, nothing else.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
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

const HUB_VALUES = '/hub/assets/ui/values.css'
const HUB_THEME = '/hub/assets/theme.css'
const HUB_FONTS = '/hub/assets/fonts/hub-fonts.css'
const accentOf = (value: string | null | undefined) => /^[0-9a-f]{6}$/i.exec(value ?? '')?.[0]

export function devMemberPlugin(options: { mcpPath?: string } = {}): Plugin {
  return {
    name: 'brax-dev-member',
    apply: 'serve',
    configureServer(server) {
      if ((process.env.APP_ENV ?? 'local') !== 'local') throw new Error('brax-dev-member only runs with APP_ENV=local')
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname === HUB_VALUES || url.pathname === HUB_THEME || url.pathname === HUB_FONTS) {
          const accent = accentOf(/(?:^|;\s*)brax-dev-accent=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? process.env.DEV_ACCENT)
          const body =
            url.pathname === HUB_VALUES
              ? readFileSync(createRequire(join(server.config.root, 'package.json')).resolve('@brax-hub/ui/values.css'), 'utf8')
              : url.pathname === HUB_FONTS
                ? '/* the stub edge: the two licensed faces are served by a hub only */\n'
                : accent
                  ? `/* the stub edge: the accent a hub's owner picked */\nhtml:root { --accent: #${accent}; }\n`
                  : '/* the stub edge: no accent named (DEV_ACCENT or ?accent=), so the UI kit keeps its own */\n'
          res.setHeader('Content-Type', 'text/css; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          return res.end(body)
        }
        const cookies: string[] = []
        if (url.searchParams.has('accent')) {
          const accent = accentOf(url.searchParams.get('accent'))
          cookies.push(accent ? `brax-dev-accent=${accent}; Path=/; SameSite=Lax` : 'brax-dev-accent=; Path=/; Max-Age=0; SameSite=Lax')
        }
        const names =['x-brax-member-id', 'x-brax-member-name', 'x-brax-member-role']
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
        if (url.searchParams.get('as')) cookies.push(`brax-dev-member=${encodeURIComponent(as!)}; Path=/; SameSite=Lax`)
        if (cookies.length) res.setHeader('Set-Cookie', cookies)
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
