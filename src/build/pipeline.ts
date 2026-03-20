/**
 * Build pipeline.
 *
 * Three-phase orchestrator:
 *   Phase 1: Load config, collect content, process markdown, build global index
 *   Phase 2: Render all pages (serial), bundle CSS, bundle runtime JS
 *   Phase 3: Generate tag pages, redirects, sitemap, RSS, agents, hash assets, copy public
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { dirname, extname, join, relative, } from 'path'
import type { PageMeta, } from '../../schemas'
import { copyPublicFiles, hashAssets, } from '../assets'
import { loadAllPageTypeMetas, loadRedirects, loadSiteConfig, } from '../config'
import { collectMdFiles, toSlug, } from '../content'
import { buildCss, } from '../css'
import { generateAgents, } from '../generators/agents'
import { generateBrowserconfig, } from '../generators/browserconfig'
import { generateManifest, } from '../generators/manifest-json'
import { generateNotFoundPage, } from '../generators/not-found'
import { generateRedirects, } from '../generators/redirects'
import { generateRss, } from '../generators/rss'
import { generateSitemap, type SitemapEntry, } from '../generators/sitemap'
import { generateTagPages, } from '../generators/tags'
import { processMarkdown, } from '../markdown'
import type { BuildOptions, ProcessedPage, } from '../schemas/build-types'
import { buildGlobalIndex, formatDate, } from './indexer'
import { resolveLayout, } from './layout-loader'
import { WorkerPool, } from './pool'
import { renderPage, } from './renderer'

const ROOT = process.cwd()
const CONTENT_DIR = join(ROOT, 'content',)
const LAYOUTS_DIR = join(ROOT, 'layouts',)
const STYLES_DIR = join(ROOT, 'styles',)
const CSS_ENTRY = join(STYLES_DIR, 'main.css',)
const PUBLIC_DIR = join(ROOT, 'public',)

/** Main build function — the 3-phase orchestrator. */
export async function build(options?: BuildOptions,): Promise<void> {
  const start = performance.now()
  const OUT_DIR = join(ROOT, options?.outDir ?? 'dist',)

  const config = loadSiteConfig()
  const pageTypeMetas = loadAllPageTypeMetas(config.pageTypes,)
  const redirectsConfig = loadRedirects()

  if (existsSync(OUT_DIR,)) rmSync(OUT_DIR, { recursive: true, },)
  mkdirSync(OUT_DIR, { recursive: true, },)

  // ── Phase 1: Process markdown and build global index ──

  const mdFiles = collectMdFiles(CONTENT_DIR,)
  const pages: PageMeta[] = []
  const sitemapEntries: SitemapEntry[] = []
  const processed: ProcessedPage[] = []

  for (const filePath of mdFiles) {
    const raw = readFileSync(filePath, 'utf-8',)
    const slug = toSlug(filePath, CONTENT_DIR,)
    const result = await processMarkdown(raw, config.markdown || {}, {
      contentDir: dirname(filePath,),
    },)

    // Compute read time (~200 wpm)
    const plainText = result.html.replace(/<[^>]+>/g, ' ',).replace(/\s+/g, ' ',).trim()
    const wordCount = plainText.split(' ',).filter(Boolean,).length
    result.frontmatter.readTime = Math.max(1, Math.ceil(wordCount / 200,),)

    if (result.frontmatter.draft) continue

    const layoutName = resolveLayout(slug, result.frontmatter, config, pageTypeMetas,)

    pages.push({
      slug,
      filePath: relative(CONTENT_DIR, filePath,),
      frontmatter: result.frontmatter,
    },)

    sitemapEntries.push({
      slug,
      lastmod: formatDate(
        result.frontmatter.lastUpdatedDate ?? result.frontmatter.lastUpdatedOn,
      ),
    },)

    processed.push({
      slug,
      html: result.html,
      headings: result.headings,
      frontmatter: result.frontmatter,
      layoutName,
    },)
  }

  const globalIndex = buildGlobalIndex(config, pages, pageTypeMetas,)

  // ── Phase 2: Render all pages, bundle CSS, bundle runtime JS ──

  if (options?.parallel) {
    const pool = new WorkerPool()
    try {
      await pool.renderPages(processed, globalIndex, OUT_DIR, LAYOUTS_DIR,)
    } finally {
      pool.dispose()
    }
  } else {
    for (const page of processed) {
      await renderPage(page, globalIndex, OUT_DIR, LAYOUTS_DIR,)
    }
  }

  // Ensure dist/assets/ exists for CSS + JS output
  const assetsDir = join(OUT_DIR, 'assets',)
  mkdirSync(assetsDir, { recursive: true, },)

  // Build CSS (LightningCSS bundling from entry point) → dist/assets/
  const cssEntry = config.css?.entries?.[0]
    ? join(ROOT, config.css.entries[0],)
    : CSS_ENTRY
  const cssMinify = config.css?.minify ?? true
  const css = buildCss(cssEntry, { minify: cssMinify, },)
  writeFileSync(join(assetsDir, 'style.css',), css,)

  // Bundle runtime JS → dist/assets/
  const runtimeEntry = join(ROOT, 'runtime', 'main.ts',)
  if (existsSync(runtimeEntry,)) {
    const result = await Bun.build({
      entrypoints: [runtimeEntry,],
      outdir: assetsDir,
      naming: 'main.js',
      target: 'browser',
      minify: true,
    },)
    if (!result.success) {
      console.warn('Runtime JS bundle failed:', result.logs.join('\n',),)
    }
  }

  // ── Phase 3: Generate tag pages, redirects, sitemap, RSS, agents, hash assets, copy public ──

  const tagPageCount = await generateTagPages(globalIndex, OUT_DIR, LAYOUTS_DIR, sitemapEntries,)

  generateRedirects(redirectsConfig, OUT_DIR,)

  // Generate 404 page for GitHub Pages
  await generateNotFoundPage(config, OUT_DIR, LAYOUTS_DIR,)

  // Copy fonts from public/ → dist/assets/ (before hashing, so they get hashed)
  const fontsDir = join(PUBLIC_DIR, 'fonts',)
  if (existsSync(fontsDir,)) {
    for (const entry of readdirSync(fontsDir, { withFileTypes: true, },)) {
      if (!entry.isDirectory()) {
        copyFileSync(join(fontsDir, entry.name,), join(assetsDir, entry.name,),)
      }
    }
  }

  // Hash pre-existing assets + copy/hash content assets referenced in HTML
  hashAssets(OUT_DIR, CONTENT_DIR,)

  // Copy public/ files to dist root (unhashed, after hash step)
  // Skip fonts/ since they were already copied to assets/
  if (existsSync(PUBLIC_DIR,)) {
    copyPublicFiles(PUBLIC_DIR, OUT_DIR,)
  }

  // Generate sitemap
  const siteUrl = config.origin || 'https://example.com'
  const sitemap = generateSitemap(sitemapEntries, siteUrl,)
  writeFileSync(join(OUT_DIR, 'sitemap.xml',), sitemap,)

  // Generate RSS feed
  generateRss(config, pages, OUT_DIR,)

  // Generate agents files
  generateAgents(config, pages, OUT_DIR,)

  // Generate PWA manifest and browserconfig
  generateManifest(config, OUT_DIR,)
  generateBrowserconfig(config, OUT_DIR,)

  const elapsed = (performance.now() - start).toFixed(0,)
  console.log(`Built ${processed.length} pages + ${tagPageCount} tag pages in ${elapsed}ms`,)
}
