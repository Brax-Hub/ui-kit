// How src/routes/__root.tsx loads the dev inspector without touching production bundles or SSR.
// Copy the component into the root route file and render it once inside <body>, next to <Scripts />.
//
// - import.meta.env.DEV is replaced at build time, so Vite drops the dynamic import from production output.
// - The import runs inside useEffect, so it never executes during server rendering on the Worker.
// - '@/lib/dev-inspect' is tooling/dev-inspect.ts copied into src/lib/ (it imports only bippy, nothing from
//   src/server, so the security scan's rules for src/routes stay satisfied).
import { useEffect } from 'react'

export function DevInspector() {
  useEffect(() => {
    if (import.meta.env.DEV) void import('@/lib/dev-inspect')
  }, [])
  return null
}

// In RootDocument:
//   <body>
//     <ThemeProvider>{children}</ThemeProvider>
//     <Toaster />
//     <DevInspector />
//     <Scripts />
//   </body>
