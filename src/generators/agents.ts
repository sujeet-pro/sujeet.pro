/**
 * Agents file generator.
 *
 * Generates agents.md (summary for AI discovery) and agents-full.md
 * (detailed listing with all articles) for AI agent discovery.
 */

import { writeFileSync, } from 'fs'
import { join, } from 'path'
import type { PageMeta, SiteConfig, } from '../../schemas'

/** Generate agents.md and agents-full.md files. */
export function generateAgents(
  config: SiteConfig,
  pages: PageMeta[],
  outDir: string,
): void {
  const siteUrl = (config.origin || 'https://example.com').replace(/\/$/, '',)

  // Collect content pages grouped by type
  const contentByType = new Map<string, PageMeta[]>()
  for (const page of pages) {
    const parts = page.slug.split('/',).filter(Boolean,)
    if (parts.length >= 2 && !page.frontmatter.draft) {
      const type = parts[0]
      if (!contentByType.has(type,)) contentByType.set(type, [],)
      contentByType.get(type,)!.push(page,)
    }
  }

  // agents.md — brief summary
  const summary = `# ${config.name}

${config.description}

## Content Types

${
    config.pageTypes
      .map((type,) => {
        const count = contentByType.get(type,)?.length || 0
        return `- **${type}**: ${count} items — ${siteUrl}/${type}/`
      },)
      .join('\n',)
  }

## Links

- Website: ${siteUrl}/
- RSS: ${siteUrl}/rss.xml
- Sitemap: ${siteUrl}/sitemap.xml
`

  writeFileSync(join(outDir, 'agents.md',), summary,)

  // agents-full.md — detailed listing
  let full = `# ${config.name} — Full Content Index

${config.description}

`

  for (const type of config.pageTypes) {
    const typePages = contentByType.get(type,) || []
    if (typePages.length === 0) continue

    full += `## ${type.charAt(0,).toUpperCase() + type.slice(1,)}\n\n`

    for (const page of typePages) {
      const title = page.frontmatter.title || page.slug
      const desc = page.frontmatter.description || ''
      const tags = (page.frontmatter.tags || []).join(', ',)
      full += `### [${title}](${siteUrl}${page.slug}/)\n`
      if (desc) full += `${desc}\n`
      if (tags) full += `Tags: ${tags}\n`
      full += '\n'
    }
  }

  writeFileSync(join(outDir, 'agents-full.md',), full,)
}
