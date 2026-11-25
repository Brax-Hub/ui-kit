#!/usr/bin/env node
// Release a module image by digest (brax-hub-module step 8): build, push, read the digest the registry assigned, and
// write it into module.yaml (surfaces.service.image) and deploy/.env (<SLUG>_IMAGE) so the overlay and the manifest
// name the same immutable image. Then validate the manifest and record the release (tooling/rollback.mjs record).
//
// Usage: node tooling/release.mjs <version> [--image ghcr.io/<org>/<name>] [--push] [--platform linux/amd64]
//   Without --push the image is built and tagged only, and nothing is written (a dry run that proves the build).
//   The image name defaults to the manifest's image without its tag and digest.
//   UI_KIT_TOKEN in the environment (a token that may read Brax-Hub/ui-kit, for instance `gh auth token`) is passed to
//   the build as the secret the Dockerfile's `npm ci` clones the UI kit with.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const version = args.find((a) => !a.startsWith('--'))
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}
const push = args.includes('--push')
if (!version || !/^\d+(\.\d+){0,3}([-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: node tooling/release.mjs <version> [--image ghcr.io/org/name] [--push] [--platform linux/amd64]')
  process.exit(2)
}

const root = process.cwd()
const manifestPath = join(root, 'module.yaml')
const manifest = readFileSync(manifestPath, 'utf8')
const slug = /^slug:\s*['"]?([a-z0-9_-]+)/m.exec(manifest)?.[1]
const current = /^(\s*image:\s*)(\S+)/m.exec(manifest)
if (!slug || !current) {
  console.error('module.yaml has no slug or no surfaces.service.image')
  process.exit(2)
}
const image = flag('image') ?? current[2].replace(/@sha256:[0-9a-f]{64}$/, '').replace(/:[A-Za-z0-9._-]+$/, '')
const tagged = `${image}:${version}`
const platform = flag('platform') ?? 'linux/amd64'

function run(cmd, cmdArgs, options = {}) {
  console.log('> ' + [cmd, ...cmdArgs].join(' '))
  const r = spawnSync(cmd, cmdArgs, { stdio: options.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    console.error(`${cmd} failed (exit ${r.status})`)
    process.exit(r.status ?? 1)
  }
  return r.stdout?.trim() ?? ''
}

run('docker', ['build', '--platform', platform, ...(process.env.UI_KIT_TOKEN ? ['--secret', 'id=ui_kit_token,env=UI_KIT_TOKEN'] : []), '-t', tagged, '-t', `${image}:latest`, '.'])
if (!push) {
  console.log(`built ${tagged}; add --push to push it and pin the digest`)
  process.exit(0)
}
run('docker', ['push', tagged])
// The digest the registry assigned: what module.yaml pins and what a hub pulls, whatever the tag points at later.
const inspected = run('docker', ['inspect', '--format', '{{index .RepoDigests 0}}', tagged], { capture: true })
const digest = /@(sha256:[0-9a-f]{64})$/.exec(inspected)?.[1]
if (!digest) {
  console.error(`could not read the digest from ${inspected || 'docker inspect'}`)
  process.exit(1)
}
const pinned = `${image}@${digest}`
writeFileSync(manifestPath, manifest.replace(/^(\s*image:\s*)\S+/m, `$1${pinned}`).replace(/^version:\s*.*$/m, `version: ${version}`))
const envPath = join(root, 'deploy', '.env')
const key = `${slug.toUpperCase().replace(/-/g, '_')}_IMAGE`
mkdirSync(join(root, 'deploy'), { recursive: true })
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
env = new RegExp(`^${key}=`, 'm').test(env) ? env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${pinned}`) : env + (env && !env.endsWith('\n') ? '\n' : '') + `${key}=${pinned}\n`
writeFileSync(envPath, env)
console.log(`released ${pinned}\n  module.yaml: version ${version}, image pinned\n  ${envPath}: ${key}\nNext: hubctl.py validate ., then node tooling/rollback.mjs record <tag> --env lab --version ${digest} --snapshot <file>`)
