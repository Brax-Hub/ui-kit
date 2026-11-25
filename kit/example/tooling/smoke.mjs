#!/usr/bin/env node
// Smoke suite against the dev server (npm run dev on 3310, or BASE_URL): every seeded role opens the app as the stub
// member, sees what RLS lets them see, the admin's Run now writes a job run, the health check answers, the MCP
// server lists the manifest's tools and refuses a call without a token, and the gateway stub drives list_items
// through it as the owner. Playwright on the installed Edge (BROWSER_CHANNEL=chromium for a downloaded Chromium).
// Usage: node tooling/smoke.mjs [base-url]
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { baseUrl, launchBrowser, openAs } from './browser.mjs'

const base = baseUrl(process.argv[2])
let passed = 0
let failed = 0
const check = (label, ok, detail = '') => {
  if (ok) passed++
  else {
    failed++
    console.log(`FAIL  ${label}${detail ? ` -> ${detail}` : ''}`)
  }
}

const browser = await launchBrowser()
try {
  const owner = await openAs(browser, 'owner', { base })
  check('owner is named by the stub edge', (await owner.getByTestId('member').textContent())?.includes('Olivia Owner'))
  check('owner sees their private item', await owner.getByText('Board pack notes').count().then((n) => n === 1))
  check('owner sees the add form', await owner.getByTestId('add-form').count().then((n) => n === 1))
  await owner.getByLabel('Title').fill('Smoke item')
  await owner.getByRole('button', { name: 'Add' }).click({ noWaitAfter: true })
  await owner.getByText('Smoke item').waitFor({ timeout: 10_000 })
  check('owner adds an item', true)
  await owner.getByRole('row', { name: /Smoke item/ }).getByRole('button', { name: 'Delete' }).click({ noWaitAfter: true })
  await owner.getByText('Smoke item').waitFor({ state: 'detached', timeout: 10_000 })
  check('owner deletes it again', true)
  await owner.context().close()

  const viewer = await openAs(browser, 'viewer', { base })
  check('viewer is read-only', await viewer.getByTestId('read-only').count().then((n) => n === 1))
  check('viewer never sees a private item', await viewer.getByText('Board pack notes').count().then((n) => n === 0))
  check('viewer sees team items', await viewer.getByText('Renew the office lease').count().then((n) => n === 1))
  check('viewer has no Settings link', await viewer.getByRole('link', { name: 'Settings' }).count().then((n) => n === 0))
  const forbidden = await viewer.goto(`${base}/settings`, { waitUntil: 'networkidle' })
  check('viewer gets 403 on settings', forbidden?.status() === 403, String(forbidden?.status()))
  await viewer.context().close()

  const member = await openAs(browser, 'member', { base })
  check('member sees their own private item', await member.getByText('My reading list').count().then((n) => n === 1))
  check('member does not see the owner\'s private item', await member.getByText('Board pack notes').count().then((n) => n === 0))
  await member.context().close()

  const admin = await openAs(browser, 'admin', { base })
  await admin.goto(`${base}/settings`, { waitUntil: 'networkidle' })
  check('admin sees the jobs', await admin.getByTestId('jobs').getByText('heartbeat').count().then((n) => n === 1))
  check('settings says there is no hub locally', (await admin.getByTestId('hub-state').textContent())?.includes('No hub here'))
  await admin.getByRole('row', { name: /heartbeat/ }).getByRole('button', { name: 'Run now' }).click({ noWaitAfter: true })
  await admin.getByTestId('job-message').filter({ hasText: /rows|failed/ }).waitFor({ timeout: 20_000 })
  const message = await admin.getByTestId('job-message').textContent()
  check('Run now records a heartbeat run', /heartbeat: \d+ rows/.test(message ?? ''), message ?? '')
  check('the run shows in recent runs', await admin.getByTestId('job-runs').getByText('manual').count().then((n) => n >= 1))
  await admin.context().close()

  // The look is the UI kit's and the accent is the hub's (ADR-039 rule 3): the page links the hub's three stylesheets
  // after its own, and the accent the hub names (here the stub edge's ?accent=) is the one every part shows.
  const themed = await openAs(browser, 'owner', { base })
  const sheets = await themed.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => new URL(l.href).pathname))
  check('the page links the hub\'s values, theme and fonts after its own stylesheet', sheets.length === 4 && JSON.stringify(sheets.slice(1)) === JSON.stringify(['/hub/assets/ui/values.css', '/hub/assets/theme.css', '/hub/assets/fonts/hub-fonts.css']), JSON.stringify(sheets))
  const primary = () => themed.getByRole('button', { name: 'Add' }).evaluate((b) => getComputedStyle(b).backgroundColor)
  const own = await primary()
  await themed.goto(`${base}/?accent=2563EB`, { waitUntil: 'networkidle' })
  const hubs = await primary()
  check('the hub\'s accent wins over the kit\'s own', hubs === 'rgb(37, 99, 235)' && own !== hubs, `${own} -> ${hubs}`)
  check('the page in front is marked in the rail', (await themed.locator('nav [aria-current=page]').textContent()) === 'Items')
  await themed.context().close()
} finally {
  await browser.close()
}

const health = await fetch(`${base}/healthz`)
check('healthz answers 200', health.status === 200)
const list = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }).then((r) => r.json())
check('MCP lists the manifest tools', JSON.stringify(list.result?.tools?.map((t) => t.name)) === JSON.stringify(['list_items', 'add_item']), JSON.stringify(list))
const bare = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_items', arguments: {} } }) }).then((r) => r.json())
check('MCP refuses a call without a token', bare.error?.data?.code === 'token_required', JSON.stringify(bare))
const stub = [join(process.cwd(), 'tooling', 'gateway-stub.mjs')].find(existsSync)
if (stub) {
  const r = spawnSync(process.execPath, [stub, 'call', 'list_items', '{}', '--as', 'owner', '--url', `${base}/mcp`], { encoding: 'utf8' })
  check('the gateway stub lists the owner\'s rows through MCP', r.status === 0 && r.stdout.includes('Board pack notes'), (r.stdout + r.stderr).slice(0, 300))
  const viewer = spawnSync(process.execPath, [stub, 'call', 'add_item', '{"title":"nope"}', '--as', 'viewer', '--url', `${base}/mcp`], { encoding: 'utf8' })
  check('the gateway stub sees RLS refuse the viewer\'s add_item', viewer.stdout.includes('member_not_allowed'), viewer.stdout.slice(0, 300))
} else check('gateway stub present', false, 'tooling/gateway-stub.mjs not found')

console.log(failed ? `smoke: ${failed} failed, ${passed} passed` : `smoke: ${passed} checks passed`)
process.exit(failed ? 1 : 0)
