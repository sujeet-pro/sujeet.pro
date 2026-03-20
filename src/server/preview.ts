/**
 * Static preview server.
 *
 * Serves the pre-built dist/ directory with no rebuilding or watching.
 * Run `bun run build` first, then `bun run preview`.
 */

import { existsSync, readFileSync, statSync, } from 'fs'
import { createServer, type IncomingMessage, type ServerResponse, } from 'http'
import { extname, join, } from 'path'

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

export async function startPreview(options?: { port?: number },): Promise<void> {
  const port = options?.port ?? parseInt(process.env.PORT || '4000', 10,)
  const ROOT = process.cwd()
  const OUT_DIR = join(ROOT, 'dist',)

  if (!existsSync(OUT_DIR,)) {
    console.error('dist/ not found. Run `bun run build` first.',)
    process.exit(1,)
  }

  function serve(req: IncomingMessage, res: ServerResponse,) {
    const url = (req.url || '/').split('?',)[0]

    let filePath = join(OUT_DIR, url,)

    // Redirect directories to trailing slash so relative paths resolve
    if (
      !url.endsWith('/',)
      && existsSync(filePath,)
      && statSync(filePath,).isDirectory()
    ) {
      res.writeHead(301, { Location: url + '/', },)
      res.end()
      return
    }

    if (existsSync(filePath,) && statSync(filePath,).isDirectory()) {
      filePath = join(filePath, 'index.html',)
    }

    if (!existsSync(filePath,)) {
      const notFoundPath = join(OUT_DIR, '404.html',)
      if (existsSync(notFoundPath,)) {
        const body404 = readFileSync(notFoundPath,)
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', },)
        res.end(body404,)
        return
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', },)
      res.end('<h1>404 — Not Found</h1>',)
      return
    }

    const ext = extname(filePath,)
    const contentType = MIME[ext] || 'application/octet-stream'
    const body = readFileSync(filePath,)

    res.writeHead(200, { 'Content-Type': contentType, },)
    res.end(body,)
  }

  const server = createServer(serve,)
  server.listen(port, () => {
    console.log(`Preview: http://localhost:${port}\n`,)
  },)
}
