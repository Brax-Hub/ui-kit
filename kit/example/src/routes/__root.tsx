import { hubStylesheetLinks } from '@brax-hub/ui/hub'
import { AppFrame, AppMain, Avatar, Link as TextLink, Rail, RailItem, RailLabel, Tag } from '@brax-hub/ui/parts'
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import { getShellFn } from '@/server/app.functions'
import appCss from '../styles.css?url'

// The hub signs people in: every request arrives with the member already named, so there is nothing to redirect to.
export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Brax Example' }],
    links: [
      // The app's stylesheet first (the UI kit, at the version this app pinned), then the hub's three, which win: its
      // copy of the kit's values, the accent its owner picked, and the two licensed faces.
      { rel: 'stylesheet', href: appCss },
      ...hubStylesheetLinks,
      { rel: 'icon', type: 'image/svg+xml', href: `${import.meta.env.BASE_URL}favicon.svg` },
    ],
  }),
  loader: () => getShellFn(),
  staleTime: Infinity,
  shellComponent: RootDocument,
  component: Shell,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

/** The frame protocol with the hub shell (HUB-SHELL.md section 4.4): announce readiness, follow its theme. */
function useHubShell() {
  useEffect(() => {
    if (window.parent === window) return
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || !event.data || event.data.v !== 1) return
      if (event.data.type === 'hub.theme') document.documentElement.dataset.theme = event.data.theme === 'dark' ? 'dark' : 'light'
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage({ v: 1, type: 'module.ready' }, location.origin)
    return () => window.removeEventListener('message', onMessage)
  }, [])
}

function Shell() {
  const shell = Route.useLoaderData()
  useHubShell()
  const isAdmin = shell.member.role === 'owner' || shell.member.role === 'admin'
  return (
    <AppFrame>
      <Rail aria-label={shell.app.name}>
        <RailLabel className="pt-0">{shell.app.name}</RailLabel>
        <RailItem asChild>
          <Link to="/" activeOptions={{ exact: true, includeSearch: false }}>
            Items
          </Link>
        </RailItem>
        {isAdmin ? (
          <RailItem asChild>
            <Link to="/settings">Settings</Link>
          </RailItem>
        ) : null}
        <div className="mt-auto flex items-center gap-3 px-3 pt-4" data-testid="member">
          <Avatar name={shell.member.name} />
          <span className="min-w-0 flex-1 truncate">{shell.member.name}</span>
          <Tag>{shell.member.role}</Tag>
        </div>
      </Rail>
      <AppMain>
        <Outlet />
        <footer className="mt-auto flex flex-wrap items-center gap-3 border-t border-line px-10 py-3 text-small text-ink-3">
          Signed in by the hub. Locally, switch the seeded member:
          {['owner', 'admin', 'member', 'viewer'].map((role) => (
            <TextLink key={role} asChild>
              <a href={`${import.meta.env.BASE_URL}?as=${role}`}>{role}</a>
            </TextLink>
          ))}
        </footer>
      </AppMain>
    </AppFrame>
  )
}
