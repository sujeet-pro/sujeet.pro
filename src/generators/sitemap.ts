/**
 * Sitemap generator.
 *
 * Generates a sitemap.xml from a list of page entries.
 */

export type SitemapEntry = {
  slug: string
  lastmod?: string
}

/** Generate sitemap XML string from a list of page entries. */
export function generateSitemap(
  entries: SitemapEntry[],
  siteUrl: string,
): string {
  const base = siteUrl.replace(/\/$/, '',)
  const urls = entries
    .map((e,) => {
      const loc = `${base}${e.slug === '/' ? '/' : e.slug + '/'}`
      const lastmod = e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''
      return `  <url>\n    <loc>${loc}</loc>${lastmod}\n  </url>`
    },)
    .join('\n',)

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}
