#!/usr/bin/env node
// After `vite build`: puts the Node entry next to the built server so `node dist/server/index.js` runs the app, and
// says which file the server bundle is. module.yaml and supabase/ are read from the app root at run time.
import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const out = join(root, 'dist', 'server')
if (!existsSync(join(out, 'entry.js'))) {
  const files = existsSync(out) ? readdirSync(out) : []
  throw new Error(`dist/server/entry.js was not built (found: ${files.join(', ') || 'nothing'})`)
}
copyFileSync(join(root, 'server', 'index.mjs'), join(out, 'index.js'))
console.log('dist/server/index.js written (node dist/server/index.js serves the app)')
