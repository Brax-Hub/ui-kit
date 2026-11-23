// Dev-only Vite plugin: stamps every intrinsic JSX element (div, button, ...) with
// data-component-id="src/routes/index.tsx:42:8" so a design tool or an agent can point at the exact
// source line. Never runs in production builds (see vite.config.ts).
//
// Coordinates are mapped back to the ORIGINAL file through Vite's combined sourcemap, so the server and
// client builds (which run different earlier transforms) produce identical ids and hydration stays clean.
import { parse } from '@babel/parser'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import MagicString from 'magic-string'
import type { Plugin } from 'vite'

interface AstNode {
  type: string
  start?: number | null
  end?: number | null
  loc?: { start: { line: number; column: number } } | null
  [key: string]: unknown
}

function walk(node: AstNode, visit: (n: AstNode) => void) {
  visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) walk(child as AstNode, visit)
      }
    } else if (value && typeof value === 'object' && 'type' in (value as object)) {
      walk(value as AstNode, visit)
    }
  }
}

function toRelative(file: string) {
  return file.replace(/\\/g, '/').replace(/^.*?\/src\//, 'src/')
}

export function sourceTagger(): Plugin {
  return {
    name: 'brax-source-tagger',
    enforce: 'pre',
    apply: 'serve',
    transform(code, id) {
      const file = id.split('?')[0] ?? id
      if (!/\.(tsx|jsx)$/.test(file) || file.includes('/node_modules/')) return null
      let ast: AstNode
      try {
        ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] }) as unknown as AstNode
      } catch {
        return null
      }

      // Earlier transforms (router code splitting, React refresh) shift lines; trace back to the source file.
      let tracer: TraceMap | null = null
      try {
        const combined = this.getCombinedSourcemap()
        if (combined && combined.mappings && combined.mappings.length > 0) tracer = new TraceMap(combined as never)
      } catch {
        tracer = null
      }

      const ms = new MagicString(code)
      let changed = false
      walk(ast, (node) => {
        if (node.type !== 'JSXOpeningElement') return
        const name = node.name as AstNode | undefined
        if (!name || name.type !== 'JSXIdentifier') return
        const tag = String(name.name)
        if (!/^[a-z]/.test(tag)) return // intrinsic elements only; components forward unknown props unpredictably
        const attrs = (node.attributes as AstNode[]) ?? []
        if (attrs.some((a) => a.type === 'JSXAttribute' && (a.name as AstNode)?.name === 'data-component-id')) return
        if (name.end == null || !node.loc) return

        let line = node.loc.start.line
        let column = node.loc.start.column
        let source = toRelative(file)
        if (tracer) {
          const original = originalPositionFor(tracer, { line, column })
          if (original.line == null || original.source == null) return // unmapped: synthetic code, skip
          line = original.line
          column = original.column ?? 0
          source = toRelative(original.source)
        }
        ms.appendLeft(name.end, ` data-component-id="${source}:${line}:${column}"`)
        changed = true
      })
      if (!changed) return null
      return { code: ms.toString(), map: ms.generateMap({ hires: true }) }
    },
  }
}
