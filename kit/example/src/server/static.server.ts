// The built client (dist/client: the fingerprinted bundles under assets/ and the favicon), served under the module's
// entry prefix by the Node process itself: nothing sits in front of the container but the hub's edge, which passes
// the request through. Runs after the member check in src/start.ts, so a bundle is no more public than a page. In
// development Vite serves the client and this is never called. Files are read whole: the largest is a bundle of a
// few hundred kilobytes, and a buffered body never trips over the handler chain the way a stream can.
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { getEnv } from './env.server'

const IMMUTABLE = 'public, max-age=31536000, immutable'
const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

/** The client file a request names under `base`, or null when it names none (a page, a function, a miss). */
export async function serveClientFile(request: Request, base: string): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const url = new URL(request.url)
  if (!url.pathname.startsWith(base)) return null
  let rest: string
  try {
    rest = decodeURIComponent(url.pathname.slice(base.length))
  } catch {
    return null
  }
  if (rest === '' || rest.endsWith('/') || rest.includes('\0')) return null
  const type = TYPES[extname(rest).toLowerCase()]
  if (!type) return null
  const root = normalize(getEnv().clientDir + sep)
  const file = normalize(join(root, rest))
  if (!file.startsWith(root)) return null
  let info
  try {
    info = await stat(file)
  } catch {
    return null
  }
  if (!info.isFile()) return null
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
  const headers = new Headers({ 'content-type': type, etag, 'cache-control': rest.startsWith('assets/') ? IMMUTABLE : 'no-cache' })
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  headers.set('content-length', String(info.size))
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
  return new Response(new Uint8Array(await readFile(file)), { status: 200, headers })
}
