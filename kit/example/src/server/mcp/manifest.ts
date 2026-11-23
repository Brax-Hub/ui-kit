// module.yaml as the server reads it: the slug (the token audience and the entry prefix) and the tools the MCP server
// lists. tools/list is generated from here and nowhere else, so what the gateway compares with the manifest at
// registration (ADR-022 rule 5) is the manifest itself.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

export interface ManifestTool {
  name: string
  description?: string
  side_effect: boolean
  ceiling: 'never' | 'confirm' | 'auto'
  scopes: string[]
  version?: number
  subject?: string
  relation?: string
  schema_sha256?: string
  /** A JSON Schema object; the MCP inputSchema. */
  parameters?: Record<string, unknown>
}

export interface Manifest {
  manifest_version: number
  slug: string
  name: string
  version: string
  description: string
  kind: string
  scopes: string[]
  mcp?: { url: string }
  tools?: ManifestTool[]
  cards?: { id: string; tool?: string; kind: string; template: string }[]
  surfaces?: { service?: { ingress?: { entry?: string; port?: number } } }
  [key: string]: unknown
}

let cached: Manifest | undefined

export function loadManifest(root = process.cwd()): Manifest {
  if (cached) return cached
  const text = readFileSync(join(root, 'module.yaml'), 'utf8')
  const parsed = parse(text) as Manifest
  if (!parsed || typeof parsed.slug !== 'string') throw new Error('module.yaml has no slug')
  cached = parsed
  return parsed
}

/** The public path prefix the module serves under: ingress.entry, else /modules/<slug>/. */
export function entryOf(manifest: Manifest): string {
  const entry = manifest.surfaces?.service?.ingress?.entry ?? `/modules/${manifest.slug}/`
  return entry.endsWith('/') ? entry : entry + '/'
}

/** The version the gateway binds a call to: the manifest's, or 1 when the manifest leaves it out. */
export function toolVersion(tool: ManifestTool): number {
  return tool.version ?? 1
}

/** The inputSchema for tools/list: the manifest's `parameters`, or an object that takes nothing. */
export function inputSchemaOf(tool: ManifestTool): Record<string, unknown> {
  return tool.parameters ?? { type: 'object', properties: {}, additionalProperties: false }
}
