/**
 * RSS feed generator.
 *
 * Generates an RSS 2.0 XML feed from published content.
 */

import { writeFileSync, } from 'fs'
import { join, } from 'path'
import type { PageMeta, SiteConfig, } from '../../schemas'

function escapeXml(str: string,): string {
  return str
    .replace(/&/g, '&amp;',)
    .replace(/</g, '&lt;',)
    .replace(/>/g, '&gt;',)
    .replace(/"/g, '&quot;',)
    .replace(/'/g, '&apos;',)
}

function formatRssDate(val: unknown,): string | undefined {
  if (!val) return undefined
  const d = val instanceof Date ? val : new Date(String(val,),)
  return isNaN(d.getTime(),) ? undefined : d.toUTCString()
}

/** Generate RSS 2.0 XML feed from published content. */
export function generateRss(
  config: SiteConfig,
  pages: PageMeta[],
  outDir: string,
): void {
  const siteUrl = (config.origin || 'https://example.com').replace(/\/$/, '',)

  // Collect published content pages (not listing pages)
  const items = pages
    .filter((p,) => {
      const parts = p.slug.split('/',).filter(Boolean,)
      // Only include item pages (e.g., /articles/slug, /blogs/slug), not listing pages
      return parts.length >= 2 && !p.frontmatter.draft
    },)
    .map((p,) => ({
      title: p.frontmatter.title || p.slug,
      description: p.frontmatter.description || '',
      link: `${siteUrl}${p.slug}/`,
      pubDate: formatRssDate(
        p.frontmatter.publishedDate || p.frontmatter.lastUpdatedOn,
      ),
      slug: p.slug,
    }))
    .filter((item,) => item.pubDate)
    .sort((a, b,) => {
      const da = new Date(a.pubDate!,)
      const db = new Date(b.pubDate!,)
      return db.getTime() - da.getTime()
    },)
    .slice(0, 50,) // Limit to 50 most recent items

  const itemsXml = items
    .map(
      (item,) =>
        `    <item>
      <title>${escapeXml(item.title,)}</title>
      <link>${escapeXml(item.link,)}</link>
      <description>${escapeXml(item.description,)}</description>
      <pubDate>${item.pubDate}</pubDate>
      <guid>${escapeXml(item.link,)}</guid>
    </item>`,
    )
    .join('\n',)

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(config.title,)}</title>
    <link>${siteUrl}/</link>
    <description>${escapeXml(config.description,)}</description>
    <language>${config.language || 'en-US'}</language>
    <atom:link href="${siteUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${itemsXml}
  </channel>
</rss>
`

  writeFileSync(join(outDir, 'rss.xml',), rss,)
}
