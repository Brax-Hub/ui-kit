// Dev-only element inspector for Brax apps. Pairs with vite-source-tagger.ts, which stamps every intrinsic JSX
// element with data-component-id="src/routes/x.tsx:42:8" in the dev server.
//
// Installs window.__brax with:
//   describe(el)      -> { id, tag, text, ancestors, components }  (components resolved through bippy on React 19)
//   openInEditor(id)  -> asks Vite's /__open-in-editor to open the file at line:column (LAUNCH_EDITOR / EDITOR)
//   pick()            -> next click resolves with describe() of the clicked element
// and a keyboard shortcut: Alt+Shift+click copies "src/x.tsx:42:8 · button · "Save"" to the clipboard and shows a
// toast, so the line can be pasted into a chat prompt. Alt+Shift+O on the same element opens it in the editor.
//
// Import it only in development, from a client-side effect in src/routes/__root.tsx (see root-dev-snippet.tsx):
//   if (import.meta.env.DEV) import('@/lib/dev-inspect')
// It must stay out of production bundles and must not import anything from src/server.
import { getDisplayName, getFiber } from 'bippy'
import { getSource } from 'bippy/source'

export interface InspectInfo {
  id: string | null
  tag: string
  text: string
  ancestors: string[]
  components: { name: string; file?: string; line?: number }[]
}

const ATTR = 'data-component-id'

function label(el: Element): string {
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
  return `${el.getAttribute(ATTR) ?? '(untagged)'} · ${el.tagName.toLowerCase()}${text ? ` · "${text}"` : ''}`
}

async function componentStack(el: Element) {
  const out: InspectInfo['components'] = []
  let fiber = getFiber(el as HTMLElement)
  while (fiber && out.length < 8) {
    if (typeof fiber.type === 'function') {
      const name = getDisplayName(fiber.type) ?? '(anonymous)'
      let file: string | undefined
      let line: number | undefined
      try {
        const src = await getSource(fiber)
        if (src) {
          file = src.fileName
          line = src.lineNumber
        }
      } catch {
        // source maps may be unavailable; the name alone is still useful
      }
      out.push({ name, file, line })
    }
    fiber = fiber.return
  }
  return out
}

export async function describe(el: Element): Promise<InspectInfo> {
  const ancestors: string[] = []
  let p = el.parentElement
  while (p && ancestors.length < 6) {
    const id = p.getAttribute(ATTR)
    if (id) ancestors.push(id)
    p = p.parentElement
  }
  return {
    id: el.getAttribute(ATTR),
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
    ancestors,
    components: await componentStack(el),
  }
}

export async function openInEditor(id: string) {
  // Vite wires launch-editor-middleware at this path in the dev server; the id is already "file:line:column".
  await fetch('/__open-in-editor?file=' + encodeURIComponent(id))
}

function toast(message: string) {
  const el = document.createElement('div')
  el.textContent = message
  // The look is the UI kit's toast (its file of values, which the app's stylesheet carries): no colour or face of its own.
  el.setAttribute(
    'style',
    'position:fixed;left:50%;bottom:calc(var(--space)*6);transform:translateX(-50%);z-index:2147483647;max-width:90vw;padding:calc(var(--space)*2) calc(var(--space)*3);background:var(--toast-bg);color:var(--toast-text);font-family:var(--face-mono);font-size:var(--type-small);box-shadow:var(--pop-shadow)',
  )
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 2200)
}

export function pick(): Promise<InspectInfo> {
  return new Promise((resolve) => {
    const onClick = async (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      document.removeEventListener('click', onClick, true)
      resolve(await describe(e.target as Element))
    }
    document.addEventListener('click', onClick, true)
    toast('Click an element')
  })
}

function nearestTagged(target: EventTarget | null): Element | null {
  const el = target instanceof Element ? target : null
  return el?.closest(`[${ATTR}]`) ?? el
}

function install() {
  if (typeof window === 'undefined' || (window as any).__brax) return
  ;(window as any).__brax = { describe, openInEditor, pick }
  let last: Element | null = null
  document.addEventListener(
    'click',
    (e) => {
      if (!(e.altKey && e.shiftKey)) return
      const el = nearestTagged(e.target)
      if (!el) return
      e.preventDefault()
      e.stopPropagation()
      last = el
      const line = label(el)
      navigator.clipboard?.writeText(line).catch(() => {})
      toast('Copied: ' + line)
    },
    true,
  )
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'o' && last) {
      const id = last.getAttribute(ATTR)
      if (id) void openInEditor(id)
    }
  })
}

install()
