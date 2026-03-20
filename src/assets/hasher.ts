/**
 * Demand-driven asset pipeline.
 *
 * Instead of blindly copying all content assets to dist, this:
 *   1. Hashes pre-existing dist/assets/ files (CSS, JS, fonts — already there from bundling)
 *   2. Scans generated HTML for /assets/* references
 *   3. For each referenced content asset not yet in dist, finds the source
 *      file in the content directory, copies it with a content hash
 *   4. Rewrites all HTML references to hashed paths
 *
 * Content assets are only copied if actually referenced in the output HTML.
 * Public assets (favicons, robots.txt) are handled separately by copyPublicFiles.
 */

import { createHash, } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, } from 'fs'
import { basename, dirname, extname, join, relative, } from 'path'

const HASHABLE_EXTS = new Set([
  '.css',
  '.js',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
],)

const CONTENT_ASSET_EXTS = new Set([
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
],)

/** Build a basename → source path lookup for content assets. */
function buildContentAssetMap(contentDir: string,): Map<string, string> {
  const map = new Map<string, string>()
  function walk(dir: string,) {
    if (!existsSync(dir,)) return
    for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
      const full = join(dir, entry.name,)
      if (entry.isDirectory()) {
        walk(full,)
        continue
      }
      const ext = extname(entry.name,)
      if (!CONTENT_ASSET_EXTS.has(ext,)) continue
      if (entry.name.endsWith('.inline.svg',)) continue
      map.set(entry.name, full,)
    }
  }
  walk(contentDir,)
  return map
}

function computeHash(content: Buffer,): string {
  return createHash('sha256',).update(content,).digest('hex',).slice(0, 8,)
}

/**
 * Hash assets and rewrite HTML references.
 *
 * @param outDir - The dist output directory
 * @param contentDir - The content source directory (for finding referenced assets)
 */
export function hashAssets(outDir: string, contentDir: string,): void {
  const assetsDir = join(outDir, 'assets',)
  mkdirSync(assetsDir, { recursive: true, },)

  const renames = new Map<string, string>()
  const contentAssets = buildContentAssetMap(contentDir,)

  // Phase 1: Collect and hash pre-existing files in dist/assets/ (CSS, JS, fonts)
  const existing: Array<{ full: string; ext: string; name: string }> = []
  if (existsSync(assetsDir,)) {
    for (const entry of readdirSync(assetsDir, { withFileTypes: true, },)) {
      if (entry.isDirectory()) continue
      const ext = extname(entry.name,)
      if (!HASHABLE_EXTS.has(ext,)) continue
      existing.push({ full: join(assetsDir, entry.name,), ext, name: basename(entry.name, ext,), },)
    }
  }
  for (const file of existing) {
    const content = readFileSync(file.full,)
    const hash = computeHash(content,)
    const hashedPath = join(assetsDir, `${file.name}.${hash}${file.ext}`,)
    renameSync(file.full, hashedPath,)
    renames.set(file.full, hashedPath,)
  }

  // Phase 2: Scan HTML — resolve content assets on demand, rewrite all references
  function processHtml(dir: string,) {
    for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
      const full = join(dir, entry.name,)
      if (entry.isDirectory()) {
        processHtml(full,)
        continue
      }
      if (!entry.name.endsWith('.html',)) continue

      let html = readFileSync(full, 'utf-8',)

      html = html.replace(
        /(src|href|srcset)="([^"]+)"/g,
        (match, attr: string, ref: string,) => {
          if (
            ref.startsWith('http:',)
            || ref.startsWith('https:',)
            || ref.startsWith('//',)
            || ref.startsWith('#',)
            || ref.startsWith('data:',)
            || ref.startsWith('mailto:',)
          ) {
            return match
          }

          // Normalize relative refs (shouldn't exist after rehype, but just in case)
          let assetRef = ref
          if (ref.startsWith('./',) && /\.(svg|png|jpg|jpeg|gif|webp|avif|ico)$/i.test(ref,)) {
            assetRef = '/assets/' + basename(ref,)
          }

          // Non-asset paths (e.g. page links, anchors)
          if (!assetRef.startsWith('/assets/',)) return match

          const fileName = assetRef.slice('/assets/'.length,)
          const distPath = join(assetsDir, fileName,)

          // Already hashed in phase 1 (CSS, JS, fonts) or a prior HTML file
          const already = renames.get(distPath,)
          if (already) {
            return `${attr}="/${relative(outDir, already,)}"`
          }

          // Content asset — find source, copy + hash on demand
          const sourcePath = contentAssets.get(fileName,)
          if (!sourcePath) {
            return `${attr}="${assetRef}"`
          }

          const content = readFileSync(sourcePath,)
          const hash = computeHash(content,)
          const ext = extname(fileName,)
          const name = basename(fileName, ext,)
          const hashedName = `${name}.${hash}${ext}`
          const hashedDest = join(assetsDir, hashedName,)

          writeFileSync(hashedDest, content,)
          renames.set(distPath, hashedDest,)

          return `${attr}="/assets/${hashedName}"`
        },
      )

      writeFileSync(full, html,)
    }
  }
  processHtml(outDir,)
}
