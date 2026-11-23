import { readFileSync } from 'node:fs'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { parse } from 'yaml'
import { devMemberPlugin } from './tooling/dev-member.ts'

// The module is served under the hub's entry prefix (module.yaml ingress.entry), so links, assets and server-function
// URLs all live under it: Vite's base puts the assets there, and TanStack Start derives the router basepath, the
// server-function base (<entry>_serverFn/) and the dev client base from it. A bare /assets/... is a 404 behind the edge.
const manifest = parse(readFileSync(new URL('./module.yaml', import.meta.url), 'utf8')) as { slug: string; surfaces?: { service?: { ingress?: { entry?: string } } } }
export const BASE = manifest.surfaces?.service?.ingress?.entry ?? `/modules/${manifest.slug}/`

export default defineConfig(({ mode }) => ({
  base: BASE,
  resolve: { tsconfigPaths: true },
  plugins: [
    // The stub edge plays the hub in development only (brax-hub-module step 2); the MCP path gets no member.
    ...(mode === 'development' ? [devMemberPlugin({ mcpPath: `${BASE}mcp` })] : []),
    tanstackStart({ srcDirectory: 'src', server: { entry: './server/entry.ts' } }),
    viteReact(),
  ],
}))
