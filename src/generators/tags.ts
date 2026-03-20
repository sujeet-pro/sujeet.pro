/**
 * Tag page generator.
 *
 * Generates individual tag pages and the tag index page.
 */

import { mkdirSync, writeFileSync, } from 'fs'
import { dirname, join, } from 'path'
import { getLayout, } from '../build/layout-loader'
import type { GlobalIndex, } from '../schemas/build-types'
import type { SitemapEntry, } from './sitemap'

/** Generate all tag pages and the tag index page. Returns the number of tag pages generated. */
export async function generateTagPages(
  globalIndex: GlobalIndex,
  outDir: string,
  layoutsDir: string,
  sitemapEntries: SitemapEntry[],
): Promise<number> {
  const { config, pageList: pages, tagIndex: allTags, } = globalIndex

  const tagLayout = await getLayout('TagListing', layoutsDir,)
  const tagIndexLayout = await getLayout('TagIndex', layoutsDir,)

  for (const [tag, tagData,] of allTags) {
    const total = tagData.articles.length + tagData.blogs.length + tagData.projects.length
    const output = tagLayout({
      content: '',
      frontmatter: { title: `Tag: ${tag}`, description: `${total} items tagged "${tag}"`, },
      headings: [],
      slug: `/tags/${tag}`,
      site: config,
      pages,
      allTags,
    },)
    const outPath = join(outDir, 'tags', tag, 'index.html',)
    mkdirSync(dirname(outPath,), { recursive: true, },)
    writeFileSync(outPath, `<!DOCTYPE html>\n${String(output,)}`,)

    sitemapEntries.push({ slug: `/tags/${tag}`, },)
  }

  // Tag index page
  {
    const output = tagIndexLayout({
      content: '',
      frontmatter: {
        title: 'Tags',
        description: `All ${allTags.size} tags across articles, blogs, and projects`,
      },
      headings: [],
      slug: '/tags',
      site: config,
      pages,
      allTags,
    },)
    const outPath = join(outDir, 'tags', 'index.html',)
    mkdirSync(dirname(outPath,), { recursive: true, },)
    writeFileSync(outPath, `<!DOCTYPE html>\n${String(output,)}`,)
    sitemapEntries.push({ slug: '/tags', },)
  }

  return allTags.size
}
