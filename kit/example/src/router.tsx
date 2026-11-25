import { Page, PageHeader } from '@brax-hub/ui/parts'
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
      <Page>
        <PageHeader title="Something went wrong" description={error instanceof Error ? error.message : String(error)} />
      </Page>
    ),
    defaultNotFoundComponent: () => (
      <Page>
        <PageHeader title="Page not found" description="That page does not exist, or you do not have access to it." />
      </Page>
    ),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
