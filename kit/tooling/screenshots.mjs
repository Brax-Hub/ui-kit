#!/usr/bin/env node
// Review screenshots in both colour schemes with the installed Edge, as the seeded owner (and the viewer's read-only
// view). There is no sign-in: the dev server's stub edge names the member from ?as=<role>.
// Usage: node tooling/screenshots.mjs [output-dir] [base-url]   (or BASE_URL=...)
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { baseUrl, launchBrowser, openAs } from './browser.mjs'

const out = process.argv[2] ?? 'dist/screens'
const base = baseUrl(process.argv[3])
const SCREENS = [
  ['items', 'owner', '/'],
  ['items-viewer', 'viewer', '/'],
  ['settings', 'owner', '/settings'],
]

mkdirSync(out, { recursive: true })
const browser = await launchBrowser()
const errors = []
try {
  for (const theme of ['light', 'dark']) {
    for (const [name, role, path] of SCREENS) {
      const page = await openAs(browser, role, {
        base,
        colorScheme: theme,
        prepare(p) {
          p.on('console', (m) => m.type() === 'error' && errors.push(`${theme} ${name}: ${m.text().slice(0, 200)}`))
          p.on('pageerror', (e) => errors.push(`${theme} ${name}: ${e.message.slice(0, 200)}`))
        },
      })
      if (path !== '/') await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(out, `${name}-${theme}.png`), fullPage: true })
      await page.context().close()
    }
  }
} finally {
  await browser.close()
}
console.log(`screenshots: ${SCREENS.length * 2} files in ${out}`)
if (errors.length) {
  console.log('browser errors:\n  ' + errors.join('\n  '))
  process.exit(1)
}
