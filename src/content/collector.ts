/**
 * Content collector.
 *
 * Discovers README.md / index.md files in the content directory
 * and converts file paths to URL slugs.
 */

import { existsSync, readdirSync, } from 'fs'
import { join, relative, } from 'path'

/** Recursively find all README.md and index.md files under a directory. */
export function collectMdFiles(dir: string,): string[] {
  const results: string[] = []
  function walk(d: string,) {
    for (const entry of readdirSync(d, { withFileTypes: true, },)) {
      const full = join(d, entry.name,)
      if (entry.isDirectory()) walk(full,)
      else if (entry.name === 'README.md' || entry.name === 'index.md') results.push(full,)
    }
  }
  if (existsSync(dir,)) walk(dir,)
  return results
}

/** Convert a content file path to a URL slug. */
export function toSlug(filePath: string, contentDir: string,): string {
  let slug = relative(contentDir, filePath,)
    .replace(/\.md$/, '',)
    .replace(/\\/g, '/',)
  // content/README -> /
  if (slug === 'README' || slug === 'index') return '/'
  // content/articles/README -> /articles
  if (slug.endsWith('/README',)) slug = slug.slice(0, -7,)
  if (slug.endsWith('/index',)) slug = slug.slice(0, -6,)
  return '/' + slug
}
