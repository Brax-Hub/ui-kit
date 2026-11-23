#!/usr/bin/env node
// Copies the kit into an app and keeps the copy honest.
//
//   node kit/init.mjs <slug> <target dir>          make a new app: kit/example as the scaffold, the kit's managed
//                                                  files on top, every "example" slug replaced by <slug>
//   node kit/init.mjs --sync <slug> <target dir>   refresh the managed files only (your routes, tools and schema stay)
//   node kit/init.mjs --check <slug> <target dir>  exit 1 when a managed file in the app differs from the kit
//
// Managed files (the kit owns them; an app changes them only by changing the kit):
//   kit/server/**            -> src/server/**         (except src/server/tools/** and src/server/db/database.types.ts)
//   kit/dev/*                -> tooling/*             (the stub edge, the gateway stub, the AI stub)
//   kit/tooling/*            -> tooling/*             (*.yml -> .github/workflows/, {{slug}} templated)
//
// Not managed: the app's own suites (tooling/rls-test.mjs, smoke.mjs, screenshots.mjs, mcp.test.mjs). They test the
// app's tables and tools, so init copies the example's once as a starting point and --sync and --check leave them be.
//   kit/Dockerfile           -> Dockerfile
//   kit/deploy/*.MODULE.*    -> deploy/*.<slug>.*     ({{slug}}, {{slug_}} (hyphens to underscores) and {{SLUG}} templated)
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const mode = args[0]?.startsWith('--') ? args.shift().slice(2) : 'init'
const [slug, target] = args
if (!slug || !target || !/^[a-z][a-z0-9_-]{1,31}$/.test(slug)) {
  console.error('usage: node kit/init.mjs [--sync|--check] <slug> <target dir>')
  process.exit(2)
}
const SLUG = slug.toUpperCase().replace(/-/g, '_')

function walk(dir, acc = [], base = dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc, base)
    else acc.push(relative(base, full).replace(/\\/g, '/'))
  }
  return acc
}

/** [source in kit, destination in app, templated?] for every managed file. */
function managed() {
  const pairs = []
  for (const rel of walk(join(KIT, 'server'))) {
    if (rel.startsWith('tools/')) continue
    pairs.push([join(KIT, 'server', rel), join(target, 'src', 'server', rel), false])
  }
  for (const rel of walk(join(KIT, 'dev'))) pairs.push([join(KIT, 'dev', rel), join(target, 'tooling', rel), false])
  for (const rel of walk(join(KIT, 'tooling'))) {
    if (rel.includes('/')) continue
    const workflow = rel.endsWith('.yml')
    const dest = workflow ? join(target, '.github', 'workflows', rel) : join(target, 'tooling', rel)
    pairs.push([join(KIT, 'tooling', rel), dest, workflow])
  }
  pairs.push([join(KIT, 'Dockerfile'), join(target, 'Dockerfile'), true])
  pairs.push([join(KIT, '.dockerignore'), join(target, '.dockerignore'), false])
  for (const rel of walk(join(KIT, 'deploy'))) pairs.push([join(KIT, 'deploy', rel), join(target, 'deploy', rel.replace('MODULE', slug)), true])
  return pairs
}

const template = (text) => text.replace(/\{\{slug\}\}/g, slug).replace(/\{\{slug_\}\}/g, slug.replace(/-/g, '_')).replace(/\{\{SLUG\}\}/g, SLUG)
const expected = (source, templated) => (templated ? template(readFileSync(source, 'utf8')) : readFileSync(source, 'utf8'))

if (mode === 'init') {
  if (existsSync(target) && readdirSync(target).length) {
    console.error(`${target} is not empty; use --sync to refresh the kit's files in an existing app`)
    process.exit(2)
  }
  cpSync(join(KIT, 'example'), target, { recursive: true, filter: (src) => !/[\\/](node_modules|dist|\.data|\.tanstack|routeTree\.gen\.ts)([\\/]|$)/.test(src) })
  for (const file of ['package.json', 'module.yaml', 'vite.config.ts', 'src/routes/__root.tsx', 'README.md']) {
    const path = join(target, file)
    if (!existsSync(path)) continue
    writeFileSync(path, readFileSync(path, 'utf8').replace(/brax-example/g, `brax-${slug}`).replace(/\bexample\b/g, slug).replace(/Brax Example/g, `Brax ${slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`))
  }
}

let drift = 0
for (const [source, dest, templated] of managed()) {
  const want = expected(source, templated)
  if (mode === 'check') {
    const have = existsSync(dest) ? readFileSync(dest, 'utf8') : null
    if (have !== want) {
      drift++
      console.log(`drift: ${relative(target, dest).replace(/\\/g, '/')} differs from ${relative(KIT, source).replace(/\\/g, '/')}${have === null ? ' (missing)' : ''}`)
    }
    continue
  }
  mkdirSync(dirname(dest), { recursive: true })
  if (templated) writeFileSync(dest, want)
  else copyFileSync(source, dest)
}
if (mode === 'check') {
  console.log(drift ? `${drift} managed file(s) drifted from the kit` : 'every managed file matches the kit')
  process.exit(drift ? 1 : 0)
}
console.log(`${mode === 'init' ? 'created' : 'synced'} ${target} for module ${slug}`)
