#!/usr/bin/env node
// This app's own security rules, run after the kit's scanner in `npm run security-scan`. The kit's
// tooling/security-scan.ts is managed by kit/init.mjs, so rules only this app needs live here (brax-security-rbs,
// step 4). A rule every app needs belongs in the kit instead. Scaffolded once; the app owns it.
// Exit 1 when a rule fails, after listing them all. Node 22.18+ strips the types.
//
// Usage: node tooling/app-scan.ts [app root]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.argv[2] ? join(process.cwd(), process.argv[2]) : process.cwd()
const rel = (p: string) => relative(root, p).replace(/\\/g, '/')
const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

function files(dir: string, pattern: RegExp, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files(full, pattern, acc)
    else if (pattern.test(entry)) acc.push(full)
  }
  return acc
}

/** Each rule returns the problems it found; an empty list passes. */
const RULES: Record<string, () => string[]> = {
  // Example: every table this app creates has row-level security switched on in the same migrations.
  'app tables enable row-level security': () => {
    const sql = files(join(root, 'supabase/migrations'), /\.sql$/).sort().map(read).join('\n').toLowerCase()
    const tables = [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/g)].map((m) => m[1])
    return tables
      .filter((t) => !new RegExp(`alter table (?:public\\.)?${t} enable row level security`).test(sql))
      .map((t) => `table ${t} has no "enable row level security" (${rel(join(root, 'supabase/migrations'))})`)
  },
}

let failed = 0
for (const [name, rule] of Object.entries(RULES)) {
  const problems = rule()
  if (problems.length) {
    failed++
    console.error(`FAIL ${name}`)
    for (const p of problems) console.error(`  ${p}`)
  }
}
console.log(`app scan: ${Object.keys(RULES).length - failed} of ${Object.keys(RULES).length} rules passed`)
process.exit(failed ? 1 : 0)
