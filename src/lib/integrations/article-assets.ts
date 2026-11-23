import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

const ARTICLES_DIR = 'src/articles';

/** Explicit allow-list. Paths are relative to the article folder; `to` is relative to `/<slug>/`. */
const ALLOW: Array<{ test: (rel: string, slug: string) => boolean; to: (rel: string, slug: string) => string }> = [
  { test: (r) => /^data\/[^/]+\.json$/.test(r), to: (r) => r },
  { test: (r) => /^diagrams\/[^/]+\.webp$/.test(r), to: (r) => r },
  { test: (r) => r === 'social/linkedin-card.png', to: (r) => r },
  { test: (r) => /^social\/thumbnail-(light|dark)\.webp$/.test(r), to: (r) => r },
  { test: (r) => r === 'social/thumbnail.png', to: (r) => r },
  { test: (r) => r === 'audio/episode.mp3', to: (r) => r },
  { test: (r) => r === 'audio/chapters.json', to: (r) => r },
  { test: (r, s) => r === `exports/${s}.pdf`, to: (_r, s) => `${s}.pdf` },
];

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
};

/** Build map of served URL path (`/<slug>/<to>`) -> absolute source file. */
function collectAssets(root: string): Map<string, string> {
  const map = new Map<string, string>();
  const base = path.join(root, ARTICLES_DIR);
  if (!fs.existsSync(base)) return map;
  for (const slug of fs.readdirSync(base)) {
    const dir = path.join(base, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const sub of ['data', 'diagrams', 'social', 'audio', 'exports']) {
      const subDir = path.join(dir, sub);
      if (!fs.existsSync(subDir) || !fs.statSync(subDir).isDirectory()) continue;
      for (const f of fs.readdirSync(subDir)) {
        const abs = path.join(subDir, f);
        if (!fs.statSync(abs).isFile()) continue;
        const rel = `${sub}/${f}`;
        const rule = ALLOW.find((a) => a.test(rel, slug));
        if (rule) map.set(`/${slug}/${rule.to(rel, slug)}`, abs);
      }
    }
  }
  return map;
}

/** URL for an article asset — re-exported from the client-safe `src/lib/media.ts`. */
export { mediaUrl } from '../media.ts';

export default function articleAssets(): AstroIntegration {
  let root = process.cwd();
  return {
    name: 'sp-article-assets',
    hooks: {
      'astro:config:setup': ({ config, command, injectRoute }) => {
        root = fileURLToPath(config.root);
        // Local-only tier (§3, P2): the PDF print route exists only in `astro dev` started by
        // scripts/render-pdf.mjs (SP_PDF_RENDER=1). `astro build` never registers it, so it cannot reach dist/.
        if (command === 'dev' && process.env.SP_PDF_RENDER === '1') {
          const entrypoint = 'src/internal-routes/print-export.astro';
          if (!fs.existsSync(path.join(root, entrypoint))) {
            throw new Error(`[sp-article-assets] SP_PDF_RENDER=1 but ${entrypoint} is missing`);
          }
          injectRoute({ pattern: '/print-export/[slug]', entrypoint, prerender: true });
        }
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          let pathname: string;
          try {
            pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
          } catch {
            return next();
          }
          const file = collectAssets(root).get(pathname);
          if (!file) return next();
          const size = fs.statSync(file).size;
          res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Cache-Control', 'no-cache');
          const range = req.headers.range;
          let start = 0;
          let end = size - 1;
          let status = 200;
          if (range) {
            const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
            if (m && (m[1] || m[2])) {
              if (m[1] === '') {
                const n = Number(m[2]);
                start = Math.max(size - n, 0);
              } else {
                start = Number(m[1]);
                if (m[2]) end = Math.min(Number(m[2]), size - 1);
              }
              if (start > end || start >= size) {
                res.statusCode = 416;
                res.setHeader('Content-Range', `bytes */${size}`);
                res.end();
                return;
              }
              status = 206;
            } else {
              res.statusCode = 416;
              res.setHeader('Content-Range', `bytes */${size}`);
              res.end();
              return;
            }
          }
          res.statusCode = status;
          if (status === 206) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', String(end - start + 1));
          if (req.method === 'HEAD' || size === 0) {
            res.end();
            return;
          }
          fs.createReadStream(file, { start, end }).pipe(res);
        });
      },
      'astro:build:done': ({ dir }) => {
        const out = fileURLToPath(dir);
        for (const [url, src] of collectAssets(root)) {
          const dest = path.join(out, url);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(src, dest);
        }
      },
    },
  };
}
