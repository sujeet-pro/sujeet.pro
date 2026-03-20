/**
 * WebSocket-based dev server with page-aware incremental builds.
 *
 * Uses Bun.serve() with native WebSocket support. Watches content,
 * layouts, styles, and diagram files for changes and triggers
 * targeted or full rebuilds as appropriate.
 */

import type { ServerWebSocket, } from 'bun'
import { watch, } from 'chokidar'
import { existsSync, readFileSync, statSync, } from 'fs'
import { extname, join, relative, } from 'path'
import { build, } from '../build'
import { renderDiagrams, } from '../diagrams'
import type { ClientMessage, ServerMessage, } from './types'
import { WS_CLIENT_SCRIPT, } from './ws-client'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}

interface ConnectedClient {
  ws: ServerWebSocket<ConnectedClient>
  currentPage: string
}

const clients = new Set<ConnectedClient>()

/** Send a message to all connected clients. */
function broadcast(msg: ServerMessage,): void {
  const payload = JSON.stringify(msg,)
  for (const client of clients) {
    client.ws.send(payload,)
  }
}

/** Send a message only to clients viewing a specific page path. */
function notifyPage(pagePath: string, msg: ServerMessage,): void {
  const payload = JSON.stringify(msg,)
  for (const client of clients) {
    if (matchesPage(client.currentPage, pagePath,)) {
      client.ws.send(payload,)
    }
  }
}

/**
 * Check if a client's current page matches the changed content path.
 * A client at `/articles/foo/` matches content path `articles/foo`.
 */
function matchesPage(clientPath: string, contentPath: string,): boolean {
  // Normalize: strip leading/trailing slashes for comparison
  const normalized = clientPath.replace(/^\/|\/$/g, '',)
  return normalized === contentPath
}

/**
 * Determine what kind of rebuild is needed based on the changed file path.
 *
 * Returns a content slug (e.g. "articles/my-article") for incremental,
 * or null for a full rebuild.
 */
function classifyChange(filePath: string, contentDir: string,): string | null {
  const rel = relative(contentDir, filePath,)

  // Changes outside content/ → full rebuild
  if (rel.startsWith('..',)) return null

  // Global config files → full rebuild
  if (rel === 'site.json5' || rel === 'redirects.json5') return null

  // meta.json5 in any page type dir → full rebuild
  if (rel.endsWith('meta.json5',)) return null

  // Content file: content/<type>/<slug>/... → incremental for that page
  const parts = rel.split('/',)
  if (parts.length >= 3) {
    // e.g. articles/my-article/README.md → "articles/my-article"
    return `${parts[0]}/${parts[1]}`
  }

  // Top-level content files (README.md, etc.) → full rebuild
  return null
}

/** Serve a file from the dist directory. */
function serveFile(filePath: string,): Response {
  const ext = extname(filePath,)
  const contentType = MIME[ext] || 'application/octet-stream'
  const body = readFileSync(filePath,)

  if (ext === '.html') {
    const html = body.toString().replace('</body>', `${WS_CLIENT_SCRIPT}</body>`,)
    return new Response(html, {
      headers: { 'Content-Type': contentType, },
    },)
  }

  return new Response(body, {
    headers: { 'Content-Type': contentType, },
  },)
}

export async function startDev(options?: { port?: number },): Promise<void> {
  const port = options?.port ?? 3000
  const ROOT = process.cwd()
  const OUT_DIR = join(ROOT, 'dev',)
  const CONTENT_DIR = join(ROOT, 'content',)
  const buildOpts = { outDir: 'dev', }

  // ── Initial build ──
  console.log('Rendering diagrams...',)
  await renderDiagrams()

  console.log('Building...',)
  await build(buildOpts,)

  // ── Start server ──
  const server = Bun.serve<ConnectedClient>({
    port,

    fetch(req, server,) {
      const url = new URL(req.url,)

      // WebSocket upgrade
      if (url.pathname === '/__ws') {
        const upgraded = server.upgrade(req, {
          data: { ws: null as any, currentPage: '/', },
        },)
        if (upgraded) return undefined as any
        return new Response('WebSocket upgrade failed', { status: 400, },)
      }

      // Serve static files from dist/
      let filePath = join(OUT_DIR, url.pathname,)

      // Redirect directories to trailing slash so relative paths resolve
      if (
        !url.pathname.endsWith('/',)
        && existsSync(filePath,)
        && statSync(filePath,).isDirectory()
      ) {
        return Response.redirect(`${url.pathname}/`, 301,)
      }

      // Resolve directory to index.html
      if (existsSync(filePath,) && statSync(filePath,).isDirectory()) {
        filePath = join(filePath, 'index.html',)
      }

      if (!existsSync(filePath,)) {
        const notFoundPath = join(OUT_DIR, '404.html',)
        if (existsSync(notFoundPath,)) {
          const html404 = readFileSync(notFoundPath, 'utf-8',)
            .replace('</body>', `${WS_CLIENT_SCRIPT}</body>`,)
          return new Response(html404, {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8', },
          },)
        }
        return new Response('<h1>404 — Not Found</h1>', {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8', },
        },)
      }

      return serveFile(filePath,)
    },

    websocket: {
      open(ws,) {
        const client: ConnectedClient = { ws, currentPage: '/', }
        ws.data = client
        clients.add(client,)
      },

      message(ws, message,) {
        try {
          const msg: ClientMessage = JSON.parse(String(message,),)
          if (msg.type === 'page') {
            ;(ws.data as ConnectedClient).currentPage = msg.path
          }
        } catch {
          // Ignore malformed messages
        }
      },

      close(ws,) {
        clients.delete(ws.data as ConnectedClient,)
      },
    },
  },)

  console.log(`\nDev server: http://localhost:${port}\n`,)

  // ── File watchers ──
  let building = false
  let pendingRebuild = false

  // Content / layout / styles watcher
  const watcher = watch(
    [
      join(ROOT, 'content',),
      join(ROOT, 'layouts',),
      join(ROOT, 'styles',),
    ],
    {
      ignoreInitial: true,
      ignored: [
        /node_modules|dist|dev/,
        /\.(mermaid|excalidraw)$/,
        /manifest\.json$/,
      ],
    },
  )

  watcher.on('all', async (event, changedPath,) => {
    if (building) {
      pendingRebuild = true
      return
    }
    building = true

    console.log(`\n${event}: ${changedPath}`,)

    try {
      // Determine if this is an incremental or full rebuild
      const contentSlug = classifyChange(changedPath, CONTENT_DIR,)
      const isLayoutOrStyleChange = changedPath.startsWith(join(ROOT, 'layouts',),)
        || changedPath.startsWith(join(ROOT, 'styles',),)

      if (contentSlug && !isLayoutOrStyleChange) {
        // Even for single-page changes, we do a full rebuild for now.
        // The page-aware tracking lets us notify only affected clients.
        console.log(`Rebuilding (content change: ${contentSlug})...`,)
        await build(buildOpts,)
        notifyPage(contentSlug, { type: 'reload', },)
        // Also notify the listing page for this content type
        const contentType = contentSlug.split('/',)[0]
        notifyPage(contentType, { type: 'reload', },)
        // Also notify the home page since it may feature this content
        notifyPage('', { type: 'reload', },)
      } else {
        // Full rebuild: layout, style, config, or top-level content change
        console.log('Rebuilding (full)...',)
        await build(buildOpts,)
        broadcast({ type: 'reload', },)
      }
    } catch (err) {
      console.error('Build error:', err,)
    }

    building = false

    // If another change came in while building, trigger one more rebuild
    if (pendingRebuild) {
      pendingRebuild = false
      console.log('Pending rebuild detected, rebuilding...',)
      building = true
      try {
        await build(buildOpts,)
        broadcast({ type: 'reload', },)
      } catch (err) {
        console.error('Build error:', err,)
      }
      building = false
    }
  },)

  // ── Diagram watcher ──
  const diagramWatcher = watch(
    [
      join(ROOT, 'content', '**/*.mermaid',),
      join(ROOT, 'content', '**/*.excalidraw',),
    ],
    {
      ignoreInitial: true,
      ignored: /node_modules|dist|dev/,
    },
  )

  diagramWatcher.on('all', async (event, changedPath,) => {
    if (building) {
      pendingRebuild = true
      return
    }
    building = true

    console.log(`\n${event} (diagram): ${changedPath}`,)

    try {
      // Render the changed diagram
      await renderDiagrams({ file: changedPath, },)

      // Rebuild the site (diagram SVGs are now updated)
      await build(buildOpts,)

      // Notify the parent page's clients
      const rel = relative(CONTENT_DIR, changedPath,)
      const parts = rel.split('/',)
      if (parts.length >= 3) {
        const contentSlug = `${parts[0]}/${parts[1]}`
        notifyPage(contentSlug, { type: 'reload', },)
      } else {
        broadcast({ type: 'reload', },)
      }
    } catch (err) {
      console.error('Diagram/build error:', err,)
    }

    building = false

    if (pendingRebuild) {
      pendingRebuild = false
      building = true
      try {
        await renderDiagrams()
        await build(buildOpts,)
        broadcast({ type: 'reload', },)
      } catch (err) {
        console.error('Build error:', err,)
      }
      building = false
    }
  },)
}
