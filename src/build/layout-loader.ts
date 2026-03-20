/**
 * Layout loader.
 *
 * Dynamically imports TSX layout files and caches them.
 * Resolves the appropriate layout name for a page based on
 * its slug, frontmatter, and page type meta configuration.
 */

import { join, } from 'path'
import type { PageTypeMeta, SiteConfig, } from '../../schemas'
import type { BaseLayoutProps, } from '../../schemas/layout-props'
type LayoutProps = BaseLayoutProps & Record<string, any>

const layoutCache = new Map<string, (props: LayoutProps,) => any>()

/** Load a layout by name (cached). */
export async function getLayout(
  name: string,
  layoutsDir: string,
): Promise<(props: LayoutProps,) => any> {
  if (layoutCache.has(name,)) return layoutCache.get(name,)!
  const mod = await import(join(layoutsDir, `${name}.tsx`,))
  layoutCache.set(name, mod.default,)
  return mod.default
}

/** Clear the layout cache (useful for dev/watch mode). */
export function clearLayoutCache(): void {
  layoutCache.clear()
}

/** Resolve the layout name for a page based on its slug and page type meta. */
export function resolveLayout(
  slug: string,
  frontmatter: Record<string, any>,
  config: SiteConfig,
  pageTypeMetas: Map<string, PageTypeMeta>,
): string {
  if (frontmatter.layout) return frontmatter.layout

  // Determine layout from page type meta
  const parts = slug.split('/',).filter(Boolean,)
  if (parts.length >= 1) {
    const type = parts[0]
    const meta = pageTypeMetas.get(type,)
    if (meta) {
      // Listing page (e.g., /articles, /blogs, /projects)
      if (parts.length === 1) return meta.layout
      // Item page (e.g., /articles/crp-dom-construction)
      return meta.itemLayout
    }
  }

  return config.defaultLayout
}
