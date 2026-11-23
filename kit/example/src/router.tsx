import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

/** The module is served under the hub's entry prefix (module.yaml ingress.entry); Vite's base carries it here. */
export const BASEPATH = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: BASEPATH,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultErrorComponent: ({ error }) => (
      <main className="page">
        <h1>Something went wrong</h1>
        <p className="muted">{error instanceof Error ? error.message : String(error)}</p>
      </main>
    ),
    defaultNotFoundComponent: () => (
      <main className="page">
        <h1>Page not found</h1>
        <p className="muted">That page does not exist, or you do not have access to it.</p>
      </main>
    ),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
