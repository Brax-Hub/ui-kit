#!/usr/bin/env node
// Pre-release security scan for a Brax Business App on the hub-module stack (brax-security-rbs step 4; plan A4).
// Run with `npm run security-scan`; part of `npm run gate`. Exit 1 on the first failing rule, after listing them all.
// Node 22.18+ strips the types at load time; keep this file free of enums and other non-erasable syntax.
//
// Usage: node tooling/security-scan.ts [app root]        (the root defaults to the working directory)
// The rules are exported for tooling/security-scan.test.ts, which runs each against a fixture that must fail it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse as parseYaml } from 'yaml'

export interface Finding {
  rule: string
  problems: string[]
}

/** Top-level keys the manifest validator knows (lcc app/module_manifest.py, TOP, validator 0.2.0). */
export const MANIFEST_TOP_KEYS = [
  'manifest_version', 'slug', 'name', 'version', 'description', 'kind', 'scopes', 'documentation', 'issue_tracker',
  'codeowners', 'min_platform', 'stage', 'surfaces', 'options', 'schema', 'backup', 'backup_exclude', 'dependencies',
  'after_dependencies', 'mcp', 'tools', 'cards', 'redact',
]
export const MANIFEST_TOOL_KEYS = ['name', 'description', 'side_effect', 'ceiling', 'scopes', 'version', 'subject', 'relation', 'schema_sha256', 'parameters']

function listFiles(dir: string, pattern: RegExp, acc: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') listFiles(full, pattern, acc)
    } else if (pattern.test(entry)) acc.push(full)
  }
  return acc
}

function read(file: string): string {
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

type Rule = (root: string, rel: (p: string) => string) => string[]

const srcFiles = (root: string) => listFiles(join(root, 'src'), /\.(ts|tsx|mts|js|mjs)$/)

export const RULES: Record<string, Rule> = {
  // 1. The member headers are read in one place, and signJwt is called in that same place.
  'identity headers read only in src/server/hub/identity.server.ts': (root, rel) => {
    const problems: string[] = []
    for (const file of srcFiles(root)) {
      const r = rel(file)
      if (r === 'src/server/hub/identity.server.ts') continue
      if (/x-brax-member-/i.test(read(file))) problems.push(`${r}: reads the member headers`)
    }
    if (!existsSync(join(root, 'src/server/hub/identity.server.ts'))) problems.push('src/server/hub/identity.server.ts is missing')
    return problems
  },
  'signJwt called only in identity.server.ts': (root, rel) => {
    const problems: string[] = []
    for (const file of srcFiles(root)) {
      const r = rel(file)
      if (r === 'src/server/hub/identity.server.ts') continue
      if (/\bsignJwt\s*\(/.test(read(file))) problems.push(`${r}: calls signJwt`)
    }
    return problems
  },
  // 2. tinbase never has its auth service on and never listens on a port inside the app.
  'no authEnabled: true': (root, rel) => srcFiles(root).filter((f) => /authEnabled\s*:\s*true/.test(read(f))).map((f) => `${rel(f)}: authEnabled: true`),
  'no tinbase port listener in src/': (root, rel) => {
    const problems: string[] = []
    for (const file of srcFiles(root)) {
      const text = read(file)
      const r = rel(file)
      if (/import\s*\{[^}]*\b(serve|findAvailablePort)\b[^}]*\}\s*from\s*['"]tinbase\/node['"]/.test(text)) problems.push(`${r}: imports serve from tinbase/node`)
      if (/\bserve\s*\(\s*backend\b/.test(text)) problems.push(`${r}: serves the backend on a port`)
      if (/from\s*['"]tinbase\/node['"]/.test(text) && /\.listen\s*\(/.test(text)) problems.push(`${r}: listens on a port next to tinbase`)
    }
    return problems
  },
  // 3. The service role is used only with a reason, and only on the server.
  'serviceClient( only with a string literal reason': (root, rel) => {
    const problems: string[] = []
    for (const file of srcFiles(root)) {
      const text = read(file)
      const r = rel(file)
      if (r === 'src/server/db/client.server.ts') continue
      if (!r.startsWith('src/server/')) {
        if (/\bserviceClient\s*\(/.test(text)) problems.push(`${r}: serviceClient outside src/server`)
        continue
      }
      // Comments do not count; a template literal counts when it starts with a literal word (`job:${name}`).
      const code = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
      const re = /\bserviceClient\s*\(\s*([^)]*)\)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(code))) {
        const arg = m[1]!.trim()
        const literal = /^(['"])[a-z][a-z0-9:_-]*\1$/.test(arg)
        const template = /^`[a-z][a-z0-9:_-]*(\$\{[\w.]+\}[a-z0-9:_-]*)*`$/.test(arg)
        if (!literal && !template) problems.push(`${r}: serviceClient(${arg || ''}) without a string literal reason`)
      }
    }
    return problems
  },
  // 4. The only way into a tool handler is tools/call after the delegated token verified.
  'tools/call behind verifyDelegatedToken': (root, rel) => {
    const problems: string[] = []
    const server = join(root, 'src/server/mcp/server.ts')
    const text = read(server)
    if (!text) return ['src/server/mcp/server.ts is missing']
    const callAt = text.indexOf("'tools/call'")
    const verifyAt = text.indexOf('verifyDelegatedToken(')
    const dispatchAt = text.search(/\bhandlers\[[^\]]+\]\s*!?\s*\(/)
    if (callAt === -1) problems.push('src/server/mcp/server.ts: no tools/call method')
    if (verifyAt === -1) problems.push('src/server/mcp/server.ts: never calls verifyDelegatedToken(')
    if (dispatchAt === -1) problems.push('src/server/mcp/server.ts: no handler dispatch (handlers[name](...)) found')
    if (verifyAt !== -1 && dispatchAt !== -1 && dispatchAt < verifyAt) problems.push('src/server/mcp/server.ts: a handler is dispatched before verifyDelegatedToken(')
    for (const file of srcFiles(root)) {
      const r = rel(file)
      if (r === 'src/server/mcp/server.ts' || r.startsWith('src/server/tools/')) continue
      if (/from\s*['"][^'"]*\/tools(\/[^'"]*)?['"]/.test(read(file))) problems.push(`${r}: imports a tool handler outside the MCP server`)
    }
    return problems
  },
  'manifest tools equal the handler set': (root) => {
    const manifest = parseYaml(read(join(root, 'module.yaml'))) as { tools?: { name: string }[] } | null
    const declared = new Set((manifest?.tools ?? []).map((t) => t.name))
    const files = new Set(listFiles(join(root, 'src/server/tools'), /\.ts$/).map((f) => relative(join(root, 'src/server/tools'), f).replace(/\\/g, '/').replace(/\.ts$/, '')).filter((n) => n !== 'index'))
    const problems: string[] = []
    for (const name of declared) if (!files.has(name)) problems.push(`module.yaml tool ${name} has no src/server/tools/${name}.ts`)
    for (const name of files) if (!declared.has(name)) problems.push(`src/server/tools/${name}.ts is not a tool in module.yaml`)
    const index = read(join(root, 'src/server/tools/index.ts'))
    for (const name of declared) if (!new RegExp(`\\b${name}\\b`).test(index)) problems.push(`src/server/tools/index.ts does not register ${name}`)
    return problems
  },
  // 5. The container runs as a non-root user and nothing is published.
  'Dockerfile ends with a non-root USER': (root) => {
    const text = read(join(root, 'Dockerfile'))
    if (!text) return ['Dockerfile is missing']
    const users = [...text.matchAll(/^\s*USER\s+(\S+)/gm)].map((m) => m[1]!)
    const last = users.at(-1)
    if (!last) return ['Dockerfile: no USER directive']
    if (last === 'root' || last === '0' || last.startsWith('0:')) return [`Dockerfile: the last USER is ${last}`]
    return []
  },
  'overlay publishes no port and declares an internal network': (root) => {
    const files = listFiles(join(root, 'deploy'), /^compose\..*\.ya?ml$/)
    if (files.length === 0) return ['deploy/compose.<slug>.yaml is missing']
    const problems: string[] = []
    for (const file of files) {
      const text = read(file)
      const name = relative(root, file).replace(/\\/g, '/')
      if (/^\s*ports\s*:/m.test(text)) problems.push(`${name}: publishes ports`)
      if (!/^\s*internal\s*:\s*true/m.test(text)) problems.push(`${name}: no internal: true network`)
      if (!/^\s*read_only\s*:\s*true/m.test(text)) problems.push(`${name}: the module is not read_only`)
    }
    return problems
  },
  // 6. module.yaml carries only the keys the validator knows (the full check is hubctl.py validate).
  'module.yaml has no unknown keys': (root) => {
    const text = read(join(root, 'module.yaml'))
    if (!text) return ['module.yaml is missing']
    let manifest: Record<string, unknown>
    try {
      manifest = parseYaml(text) as Record<string, unknown>
    } catch (error) {
      return [`module.yaml: not YAML (${error instanceof Error ? error.message : String(error)})`]
    }
    const problems: string[] = []
    for (const key of Object.keys(manifest ?? {})) if (!MANIFEST_TOP_KEYS.includes(key)) problems.push(`module.yaml: unknown key ${key}`)
    const tools = Array.isArray(manifest?.tools) ? (manifest.tools as Record<string, unknown>[]) : []
    tools.forEach((tool, i) => {
      for (const key of Object.keys(tool)) if (!MANIFEST_TOOL_KEYS.includes(key)) problems.push(`module.yaml: tools[${i}] unknown key ${key}`)
      if (tool.ceiling === 'auto' && tool.side_effect === true) problems.push(`module.yaml: tools[${i}] auto is refused with side_effect`)
    })
    if (tools.length && !manifest.mcp) problems.push('module.yaml: tools needs mcp')
    if (manifest.mcp && !tools.length) problems.push('module.yaml: mcp needs tools')
    const user = (manifest.surfaces as { service?: { user?: string } } | undefined)?.service?.user
    if (user === 'root' || user === '0') problems.push('module.yaml: surfaces.service.user is root')
    return problems
  },
  // 7. Browser-reachable code holds no secrets and imports nothing server-only.
  'no secrets or server-only imports in routes and components': (root, rel) => {
    const problems: string[] = []
    const files = [...listFiles(join(root, 'src/routes'), /\.tsx?$/), ...listFiles(join(root, 'src/components'), /\.tsx?$/), ...listFiles(join(root, 'src/lib'), /\.tsx?$/)]
    const patterns: [RegExp, string][] = [
      [/process\.env\./, 'process.env read'],
      [/JWT_SECRET|serviceRoleKey|credential\//, 'secret or credential reference'],
      [/Bearer\s+[A-Za-z0-9._-]{20,}/, 'hardcoded bearer token'],
      [/from\s+['"][^'"]*\.server(\.ts)?['"]/, 'import from a *.server file'],
      [/from\s+['"]@\/server\/(env|tinbase|db\/client|hub\/|mcp\/|jobs(\/|['"])|tools(\/|['"]))/, 'import of server-only code'],
    ]
    for (const file of files) {
      const text = read(file)
      for (const [re, label] of patterns) if (re.test(text)) problems.push(`${rel(file)}: ${label}`)
    }
    return problems
  },
  // 8. Every server function carries middleware (or says why it is public) and a validator (or says it takes no input).
  'server functions carry middleware and validators': (root, rel) => {
    const problems: string[] = []
    for (const file of listFiles(join(root, 'src/server'), /\.functions\.ts$/)) {
      const text = read(file)
      const re = /createServerFn\(/g
      let match: RegExpExecArray | null
      while ((match = re.exec(text))) {
        const before = text.slice(0, match.index)
        const line = before.split('\n').length
        const after = text.slice(match.index)
        const endIdx = after.search(/\n\s*\n|\nexport /)
        const statement = endIdx === -1 ? after : after.slice(0, endIdx)
        const isPublic = /\/\/\s*public:/.test(before.split('\n').slice(-3).join('\n'))
        if (!/\.middleware\(\[/.test(statement) && !isPublic) problems.push(`${rel(file)}:${line}: createServerFn without .middleware([ or a // public: comment`)
        const hasValidator = /\.(validator|inputValidator)\(/.test(statement)
        const declaresNoInput = /\/\/\s*input:\s*none/.test(statement)
        if (!hasValidator && !declaresNoInput) problems.push(`${rel(file)}:${line}: createServerFn without .validator( (add // input: none if it takes no data)`)
      }
    }
    return problems
  },
  // 9. supabase-js is created in one file; the dev stub is loaded only by vite.config.ts in development.
  'createClient only in client.server.ts; the stub edge only in vite.config.ts': (root, rel) => {
    const problems: string[] = []
    for (const file of srcFiles(root)) {
      const r = rel(file)
      const text = read(file)
      if (r !== 'src/server/db/client.server.ts' && /\bcreateClient\s*(<[^>]*>)?\s*\(/.test(text)) problems.push(`${r}: calls createClient`)
      if (/from\s+['"][^'"]*dev-member['"]/.test(text)) problems.push(`${r}: imports the stub edge`)
    }
    const vite = read(join(root, 'vite.config.ts'))
    if (/devMemberPlugin/.test(vite) && !/mode === 'development' \? \[[^\]]*devMemberPlugin\(/.test(vite)) problems.push("vite.config.ts: devMemberPlugin() is not gated by mode === 'development'")
    const stub = read(join(root, 'tooling/dev-member.ts'))
    if (stub && !/APP_ENV[^\n]*!== 'local'[^\n]*throw/.test(stub)) problems.push('tooling/dev-member.ts: the stub does not refuse to load outside APP_ENV=local')
    return problems
  },
  // 10. Every table a migration creates is locked down in that same migration (brax-data 3; brax-security-rbs 3).
  'RLS migration audit': (root) => {
    const problems: string[] = []
    for (const file of listFiles(join(root, 'supabase/migrations'), /\.sql$/)) {
      const text = read(file)
      const name = relative(root, file).replace(/\\/g, '/')
      const lower = text.toLowerCase()
      const tableRe = /create table (?:if not exists )?(?:public\.)?"?(\w+)"?/g
      let m: RegExpExecArray | null
      while ((m = tableRe.exec(lower))) {
        const t = m[1]!
        const need: [RegExp, string][] = [
          [new RegExp(`alter table (?:public\\.)?"?${t}"? enable row level security`), 'enable row level security'],
          [new RegExp(`alter table (?:public\\.)?"?${t}"? force row level security`), 'force row level security'],
          [new RegExp(`grant [a-z, ]+ on (?:public\\.)?"?${t}"? to authenticated`), 'a grant to authenticated'],
          [new RegExp(`revoke all on (?:public\\.)?"?${t}"? from anon`), 'a revoke from anon'],
        ]
        for (const [re, label] of need) if (!re.test(lower)) problems.push(`${name}: table ${t} lacks ${label}`)
        for (const cmd of ['select', 'insert', 'update', 'delete']) {
          if (!new RegExp(`create policy \\w+ on (?:public\\.)?"?${t}"? for ${cmd} to authenticated`).test(lower)) problems.push(`${name}: table ${t} has no ${cmd} policy to authenticated`)
        }
      }
      const policyRe = /create policy (\w+) on (?:\w+\.)?"?(\w+)"? for (\w+)[\s\S]*?;/g
      while ((m = policyRe.exec(lower))) {
        if (m[3] === 'all') problems.push(`${name}: policy ${m[1]} on ${m[2]} is "for all"`)
        const body = m[0]
        if (/\busing \(|\bwith check \(/.test(body) && /\bauth\.(uid|jwt|role)\(\)/.test(body) && !/\(select auth\.(uid|jwt|role)\(\)/.test(body)) problems.push(`${name}: policy ${m[1]} calls auth.* without the (select ...) wrapper`)
        if (/auth\.role\(\) = 'authenticated'/.test(body)) problems.push(`${name}: policy ${m[1]} uses auth.role() = 'authenticated'`)
      }
      const viewRe = /create (?:or replace )?view (?:public\.)?"?(\w+)"?([^;]*);/g
      while ((m = viewRe.exec(lower))) if (!/security_invoker\s*=\s*true/.test(m[2]!)) problems.push(`${name}: view ${m[1]} is not security_invoker`)
      const fnRe = /create (?:or replace )?function ([\w.]+)\s*\([^)]*\)[\s\S]*?(?=create (?:or replace )?function |create table|create policy|alter table|create view|$)/g
      while ((m = fnRe.exec(lower))) {
        const body = m[0]
        if (!/security definer/.test(body)) continue
        if (!/set search_path\s*=/.test(body)) problems.push(`${name}: definer function ${m[1]} does not set search_path`)
        if (!new RegExp(`revoke execute on function [^;]*${m[1]!.replace('.', '\\.')}`).test(lower)) problems.push(`${name}: definer function ${m[1]} has no revoke execute`)
      }
    }
    return problems
  },
}

export function scan(root: string): { findings: Finding[]; passes: string[] } {
  const rel = (p: string) => relative(root, p).replace(/\\/g, '/')
  const findings: Finding[] = []
  const passes: string[] = []
  for (const [rule, run] of Object.entries(RULES)) {
    const problems = run(root, rel)
    if (problems.length) findings.push({ rule, problems })
    else passes.push(rule)
  }
  return { findings, passes }
}

const invokedDirectly = process.argv[1] && /security-scan\.ts$/.test(process.argv[1].replace(/\\/g, '/'))
if (invokedDirectly) {
  const root = process.argv[2] ? join(process.cwd(), process.argv[2]) : process.cwd()
  const { findings, passes } = scan(root)
  for (const p of passes) console.log(`ok    ${p}`)
  for (const f of findings) console.log(`FAIL  ${f.rule}\n    ${f.problems.join('\n    ')}`)
  console.log(findings.length ? `\nsecurity scan: ${findings.length} rule(s) failed` : `\nsecurity scan: ${passes.length} rules passed`)
  process.exit(findings.length ? 1 : 0)
}
