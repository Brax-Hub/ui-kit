// Shared pieces of the browser suites. There is no sign-in: the stub edge in the dev server (tooling/dev-member.ts)
// names the member from ?as=<role> and keeps it in a cookie, exactly as the hub's edge would name a signed-in member.
// Usage: const browser = await launchBrowser()
//        const page = await openAs(browser, 'owner', { base })      // base = origin + the module's entry
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

/** module.yaml's entry, without the trailing slash: /modules/<slug>. */
export function entry(root = process.cwd()) {
  const text = readFileSync(join(root, 'module.yaml'), 'utf8')
  const found = /^\s*entry:\s*['"]?(\/[^'"\s]*)/m.exec(text)?.[1]
  const slug = /^slug:\s*['"]?([a-z0-9_-]+)/m.exec(text)?.[1] ?? 'app'
  return (found ?? `/modules/${slug}/`).replace(/\/$/, '')
}

/** BASE_URL, else the given value, else the dev server; localhost only. Returns the origin plus the module's entry. */
export function baseUrl(candidate) {
  const e = entry()
  const origin = (process.env.BASE_URL || candidate || 'http://localhost:3310').replace(/\/+$/, '').replace(new RegExp(`${e}$`), '')
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) throw new Error(`BASE_URL must be a localhost origin, got ${origin}`)
  return `${origin}${e}`
}

/** Headless Edge by default (BROWSER_CHANNEL=msedge); chromium uses the browser playwright-core installed. */
export function launchBrowser(options = {}) {
  const channel = process.env.BROWSER_CHANNEL || 'msedge'
  return chromium.launch({ ...(channel === 'chromium' ? {} : { channel }), headless: true, ...options })
}

/**
 * A fresh context and page acting as a seeded role (owner, admin, member, viewer). Options:
 *   base, viewport, colorScheme   as for the browser context
 *   prepare(page)                 runs before the first navigation, to attach console and error listeners
 */
export async function openAs(browser, role, options = {}) {
  const base = options.base ?? baseUrl()
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 1280, height: 800 }, ...(options.colorScheme ? { colorScheme: options.colorScheme } : {}) })
  const page = await context.newPage()
  options.prepare?.(page)
  await page.goto(`${base}/?as=${encodeURIComponent(role)}`, { waitUntil: 'networkidle' })
  return page
}
