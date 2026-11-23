// Global request middleware, in order: the MCP server answers its own path (the tool gateway reaches it on the module
// network with a delegated token and no member; src/server/mcp/server.ts refuses anything else); the health check is
// the one public path; every other request must name the hub's member (the edge sets the headers; locally the stub
// edge does; anything else answers 401 before a page or a function runs); the built client's files are served in
// production (Vite serves them in development); server functions are same-origin RPC endpoints checked by TanStack's
// CSRF middleware; and every response says it may be framed by its own origin only (HUB-SHELL.md section 4.2).
import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

const BASE = import.meta.env.BASE_URL

const mcp = createMiddleware({ type: 'request' }).server(async ({ request, next }) => {
  const { pathname } = new URL(request.url)
  if (pathname !== `${BASE}mcp`) return next()
  const { mcpServer } = await import('./server/mcp/server')
  return mcpServer().handle(request)
})

const hubMember = createMiddleware({ type: 'request' }).server(async ({ request, next }) => {
  const { pathname } = new URL(request.url)
  if (pathname === `${BASE}healthz`) return new Response('ok', { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } })
  const { readHubMember, NotSignedIn } = await import('./server/hub/identity.server')
  try {
    readHubMember(request)
  } catch (error) {
    if (error instanceof NotSignedIn) {
      return new Response('Unauthorized: this app is reached through a Brax Hub, which names the member on every request.', { status: 401, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } })
    }
    throw error
  }
  return next()
})

const clientFiles = createMiddleware({ type: 'request' }).server(async ({ request, next }) => {
  if (import.meta.env.DEV) return next()
  const { serveClientFile } = await import('./server/static.server')
  return (await serveClientFile(request, BASE)) ?? next()
})

const csrf = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })

const frameAncestors = createMiddleware({ type: 'request' }).server(async ({ next }) => {
  const result = await next()
  result.response.headers.set('Content-Security-Policy', "frame-ancestors 'self'")
  result.response.headers.set('X-Content-Type-Options', 'nosniff')
  result.response.headers.set('Referrer-Policy', 'same-origin')
  return result
})

export const startInstance = createStart(() => ({
  requestMiddleware: [mcp, hubMember, clientFiles, csrf, frameAncestors],
}))
