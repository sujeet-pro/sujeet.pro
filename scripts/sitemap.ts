export { generateSitemap, } from '../src/generators/sitemap'
export type { SitemapEntry, } from '../src/generators/sitemap'

// Standalone collection logic preserved for backward compatibility
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, } from 'fs'
import matter from 'gray-matter'
import { join, relative, } from 'path'
import { loadSiteConfig, } from '../src/config'
import { generateSitemap, } from '../src/generators/sitemap'

function formatDate(val: unknown,): string | undefined {
  if (!val) return undefined
  if (val instanceof Date) return val.toISOString().slice(0, 10,)
  const s = String(val,)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s,)) return s
  const d = new Date(s,)
  return isNaN(d.getTime(),) ? undefined : d.toISOString().slice(0, 10,)
}

/** Collect all non-draft pages from content directory. */
export function collectEntries(contentDir: string,) {
  const entries: Array<{ slug: string; lastmod?: string }> = []

  function walk(dir: string,) {
    if (!existsSync(dir,)) return
    for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
      const full = join(dir, entry.name,)
      if (entry.isDirectory()) {
        walk(full,)
        continue
      }
      if (entry.name !== 'README.md' && entry.name !== 'index.md') continue

      const raw = readFileSync(full, 'utf-8',)
      const { data, } = matter(raw,)

      if (data.draft) continue

      let slug = relative(contentDir, full,)
        .replace(/\.md$/, '',)
        .replace(/\\/g, '/',)
      if (slug === 'README' || slug === 'index') slug = '/'
      else if (slug.endsWith('/README',)) slug = slug.slice(0, slug.length - 7,)
      else if (slug.endsWith('/index',)) slug = slug.slice(0, slug.length - 6,)

      if (slug !== '/') slug = '/' + slug.replace(/^\//, '',)

      const lastmod = formatDate(data.lastUpdatedDate ?? data.lastUpdatedOn,)

      entries.push({ slug, lastmod, },)
    }
  }

  walk(contentDir,)
  return entries.sort((a, b,) => a.slug.localeCompare(b.slug,))
}

/* ── Standalone runner ── */

if (import.meta.main) {
  const ROOT = process.cwd()
  const contentDir = join(ROOT, 'content',)

  const config = loadSiteConfig()
  const siteUrl = config.origin || 'https://example.com'
  const entries = collectEntries(contentDir,)
  const xml = generateSitemap(entries, siteUrl,)

  const outDir = join(ROOT, 'dist',)
  mkdirSync(outDir, { recursive: true, },)
  const outPath = join(outDir, 'sitemap.xml',)
  writeFileSync(outPath, xml,)
  console.log(`Sitemap: ${entries.length} URLs -> ${outPath}`,)
}
