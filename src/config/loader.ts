/**
 * Configuration loader.
 *
 * Reads and validates content/site.json5, content/<type>/meta.json5,
 * and content/redirects.json5.
 */

import { existsSync, readFileSync, } from 'fs'
import JSON5 from 'json5'
import { join, } from 'path'
import type { PageTypeMeta, RedirectsConfig, SiteConfig, } from '../../schemas'

const ROOT = process.cwd()
const CONTENT_DIR = join(ROOT, 'content',)

export function loadSiteConfig(): SiteConfig {
  const path = join(CONTENT_DIR, 'site.json5',)
  if (!existsSync(path,)) {
    throw new Error(`Site config not found: ${path}`,)
  }
  return JSON5.parse(readFileSync(path, 'utf-8',),)
}

export function loadPageTypeMeta(pageType: string,): PageTypeMeta {
  const path = join(CONTENT_DIR, pageType, 'meta.json5',)
  if (!existsSync(path,)) {
    throw new Error(`Page type meta not found: ${path}`,)
  }
  return JSON5.parse(readFileSync(path, 'utf-8',),)
}

export function loadRedirects(): RedirectsConfig {
  const path = join(CONTENT_DIR, 'redirects.json5',)
  if (!existsSync(path,)) {
    return { vanity: [], redirects: [], }
  }
  return JSON5.parse(readFileSync(path, 'utf-8',),)
}

export function loadAllPageTypeMetas(
  pageTypes: string[],
): Map<string, PageTypeMeta> {
  const metas = new Map<string, PageTypeMeta>()
  for (const type of pageTypes) {
    metas.set(type, loadPageTypeMeta(type,),)
  }
  return metas
}
