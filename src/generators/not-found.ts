/**
 * 404 page generator.
 *
 * Generates a 404.html page at the dist root for GitHub Pages.
 * Uses the NotFound layout rendered with the site config.
 */

import { writeFileSync, } from 'fs'
import { join, } from 'path'
import type { SiteConfig, } from '../../schemas'
import { getLayout, } from '../build/layout-loader'

/** Generate the 404 page and write it to dist/404.html. */
export async function generateNotFoundPage(
  config: SiteConfig,
  outDir: string,
  layoutsDir: string,
): Promise<void> {
  const layout = await getLayout('NotFound', layoutsDir,)
  const output = layout({
    content: '',
    frontmatter: {},
    headings: [],
    slug: '/404',
    site: config,
  },)
  writeFileSync(join(outDir, '404.html',), `<!DOCTYPE html>\n${String(output,)}`,)
}
