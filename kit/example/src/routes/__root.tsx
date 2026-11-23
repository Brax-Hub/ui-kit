import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import { getShellFn } from '@/server/app.functions'
import appCss from '../styles.css?url'

// The hub signs people in: every request arrives with the member already named, so there is nothing to redirect to.
export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Brax Example' }],
    links: [
      { rel: 'stylesheet', href: appCss },
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
    <div className="shell">
      <header className="topbar">
        <strong>{shell.app.name}</strong>
        <nav>
          <Link to="/" activeOptions={{ exact: true }}>
            Items
          </Link>
          {isAdmin ? <Link to="/settings">Settings</Link> : null}
        </nav>
        <span className="member" data-testid="member">
          {shell.member.name} <span className="badge">{shell.member.role}</span>
        </span>
      </header>
      <Outlet />
      <footer className="devbar">
        Signed in by the hub. Locally, switch the seeded member:{' '}
        {['owner', 'admin', 'member', 'viewer'].map((role) => (
          <a key={role} href={`${import.meta.env.BASE_URL}?as=${role}`}>
            {role}
          </a>
        ))}
      </footer>
    </div>
  )
}
