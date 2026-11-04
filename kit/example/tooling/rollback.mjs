// Restores a Brax Business App release (git tag + database snapshot + module image digest) from its ledger row,
// or records a new row. Node 22+, no dependencies. Prints the commands; runs them only with --yes, stops at the first failure.
// Usage:
//   node tooling/rollback.mjs [rollback] <tag> --env lab|local [--yes] [--branch] [--app <dir>] [--ledger <file>]
//   node tooling/rollback.mjs record <tag> --env lab|production --version <id> --snapshot <file> [--notes <text>]
//        [--app <dir>] [--ledger <file>]
// Ledger: docs/<app>/releases.md (<app> = package.json name of --app without the "brax-" prefix, default dir = cwd).
// --env production additionally needs --yes --i-know. Lab and production restores read LAB_DATABASE_URL and
// PROD_DATABASE_URL (the hub database's connection string, reachable from the hub host) from the environment; the
// image step writes APP_IMAGE=<digest> into deploy/hub/.env.<env> and prints the redeploy command for the hub host.
// Files on the module volume and secrets are not restored.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const USAGE = `Usage:
  node tooling/rollback.mjs [rollback] <tag> --env lab|local [--yes] [--branch] [--app <dir>] [--ledger <file>]
  node tooling/rollback.mjs record <tag> --env lab|production --version <id> --snapshot <file> [--notes <text>]
  --env production needs --yes --i-know, a fresh snapshot and the owner's go. Without --yes nothing is run.`
const HEADER = [
  '| Date | Tag | Commit | Snapshot | Lab version | Production version | Notes |',
  '| --- | --- | --- | --- | --- | --- | --- |',
]
const flags = new Set(['yes', 'i-know', 'branch', 'help'])
const args = { _: [] }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '-h') args.help = true
  else if (a.startsWith('--')) args[a.slice(2)] = flags.has(a.slice(2)) ? true : argv[++i]
  else args._.push(a)
}
const fail = (msg) => { console.error('rollback: ' + msg); process.exit(1) }
if (args.help || argv.length === 0) { console.log(USAGE); process.exit(0) }

const mode = args._[0] === 'record' ? 'record' : 'rollback'
const tag = args._[0] === 'record' || args._[0] === 'rollback' ? args._[1] : args._[0]
if (!tag) fail('missing <tag>\n' + USAGE)
const env = args.env ?? fail('missing --env lab|local|production')
if (!['lab', 'local', 'production'].includes(env)) fail('--env must be lab, local or production')
if (env === 'production' && mode === 'rollback' && !(args.yes && args['i-know'])) fail('--env production needs --yes --i-know')

const appDir = path.resolve(args.app ?? '.')
let app = path.basename(appDir)
const pkgPath = path.join(appDir, 'package.json')
if (existsSync(pkgPath)) app = JSON.parse(readFileSync(pkgPath, 'utf8')).name ?? app
app = app.replace(/^brax-/, '')
const ledger = path.resolve(args.ledger ?? path.join('docs', app, 'releases.md'))

if (mode === 'record') {
  if (!['lab', 'production'].includes(env)) fail('record needs --env lab or production')
  if (!args.version || !args.snapshot) fail('record needs --version <id> and --snapshot <file>')
  const rev = (ref) => spawnSync('git', ['rev-parse', '--short', ref], { cwd: appDir, encoding: 'utf8' })
  const commit = [tag + '^{commit}', 'HEAD'].map(rev).find((r) => r.status === 0)?.stdout.trim() || 'unknown'
  const date = new Date().toISOString().slice(0, 10)
  const cells = [date, tag, commit, args.snapshot.replace(/\\/g, '/'), env === 'lab' ? args.version : '', env === 'production' ? args.version : '', args.notes ?? '']
  mkdirSync(path.dirname(ledger), { recursive: true })
  if (!existsSync(ledger)) writeFileSync(ledger, '# Release ledger: ' + app + '\n\n' + HEADER.join('\n') + '\n')
  const text = readFileSync(ledger, 'utf8')
  const lines = text.split(/\r?\n/)
  const at = lines.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    .findLastIndex((c, i) => lines[i].trim().startsWith('|') && c[1] === tag)
  if (at >= 0) { // same tag again (other environment): fill that column in the existing row
    const old = lines[at].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    const col = env === 'lab' ? 4 : 5
    const merged = old.map((c, i) => (i === col ? args.version : i === 6 && args.notes ? args.notes : c))
    lines[at] = '| ' + merged.join(' | ') + ' |'
    writeFileSync(ledger, lines.join('\n'))
  } else appendFileSync(ledger, (text.endsWith('\n') ? '' : '\n') + '| ' + cells.join(' | ') + ' |\n')
  console.log('recorded', tag, env, 'in', ledger)
  process.exit(0)
}

if (!existsSync(ledger)) fail('ledger not found: ' + ledger)
const rows = readFileSync(ledger, 'utf8').split(/\r?\n/)
  .filter((l) => l.trim().startsWith('|'))
  .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
  .filter((c) => c.length >= 6 && !/^-+$/.test(c[0]) && c[0].toLowerCase() !== 'date')
const row = rows.filter((c) => c[1] === tag).pop()
if (!row) fail('no ledger row for ' + tag + ' in ' + ledger)
const [date, , commit, snapshot, labVersion, prodVersion] = row
const version = env === 'production' ? prodVersion : labVersion
if (!snapshot) fail('row for ' + tag + ' has no snapshot file')
if (env !== 'local' && !version) fail('row for ' + tag + ' has no ' + env + ' version id')

const q = (s) => (/^[\w@%+=:,./\\-]+$/.test(s) ? s : '"' + s.replace(/"/g, '\\"') + '"')
const psqlUrl = env === 'local' ? (process.env.DATABASE_URL ?? '') : process.env[env === 'lab' ? 'LAB_DATABASE_URL' : 'PROD_DATABASE_URL']
const urlName = env === 'lab' ? '$LAB_DATABASE_URL' : env === 'production' ? '$PROD_DATABASE_URL' : '$DATABASE_URL'
const envFile = path.join('deploy', 'hub', `.env.${env}`)
const pinImage = `node -e "const f=${JSON.stringify(envFile)},fs=require('fs');let t=fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';t=/^APP_IMAGE=/m.test(t)?t.replace(/^APP_IMAGE=.*$/m,'APP_IMAGE=${version}'):t+(t&&!t.endsWith('\\n')?'\\n':'')+'APP_IMAGE=${version}\\n';fs.writeFileSync(f,t);console.log('pinned '+f)"`
const steps = [
  { label: 'code', cmd: args.branch ? `git checkout -b rollback/${tag} ${q(tag)}` : `git checkout --detach ${q(tag)}` },
  ...(env === 'local'
    ? [{ label: 'database (reset)', cmd: 'node tooling/db.mjs reset' },
       { label: 'database (restore)', cmd: `node tooling/db.mjs restore ${q(snapshot)}` }]
    : [{ label: 'database (restore)', cmd: `pg_restore --clean --if-exists --single-transaction -d ${q(psqlUrl ?? urlName)} ${q(snapshot)}`,
         show: `pg_restore --clean --if-exists --single-transaction -d ${urlName} ${q(snapshot)}` },
       { label: 'image (pin digest)', cmd: pinImage, show: `write APP_IMAGE=${version} into ${envFile}, then on the hub host: docker compose --env-file ${envFile} up -d <slug>` }]),
]

console.log(`Release ${tag} (${date}, commit ${commit}) on ${env}, app ${app}, ledger ${ledger}`)
steps.forEach((s, i) => console.log(`${i + 1}. ${s.label}: ${s.show ?? s.cmd}`))
if (!args.yes) { console.log('Dry run: nothing executed. Add --yes to run these in ' + appDir); process.exit(0) }
if (env !== 'local' && !psqlUrl) fail(`set ${urlName.slice(1)} to the hosted connection string first`)
for (const s of steps) {
  console.log('\n> ' + (s.show ?? s.cmd))
  const r = spawnSync(s.cmd, { cwd: appDir, stdio: 'inherit', shell: true })
  if (r.status !== 0) fail(`step "${s.label}" failed (exit ${r.status}); later steps were not run`)
}
console.log('\nRolled back to ' + tag + '. Storage objects and secrets are not restored; check them by hand.')
