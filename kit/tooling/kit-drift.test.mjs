// The app's copies of the kit's managed files equal the kit (node kit/init.mjs --check). Only meaningful inside the
// skills repository, where kit/ sits two levels up; an app made from the kit has no kit beside it and skips this.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const app = join(here, '..')
const init = join(app, '..', 'init.mjs')

test('the managed files match the kit', (t) => {
  if (!existsSync(init)) return t.skip('no kit beside this app')
  const slug = /^slug:\s*['"]?([a-z0-9_-]+)/m.exec(readFileSync(join(app, 'module.yaml'), 'utf8'))?.[1]
  const r = spawnSync(process.execPath, [init, '--check', slug, app], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
})
