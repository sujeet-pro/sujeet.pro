/**
 * Links validator.
 *
 * Checks internal links in markdown files resolve to existing files.
 * Warns when absolute links to own domain are used instead of relative links.
 */

import { existsSync, readFileSync, } from 'fs'
import { dirname, relative, resolve, } from 'path'
import type { Issue, ValidationContext, Validator, } from './types'

interface LinkRef {
  url: string
  line: number
}

/** Extract all links from markdown, skipping fenced code blocks. */
function extractLinks(markdown: string,): LinkRef[] {
  const links: LinkRef[] = []
  const lines = markdown.split('\n',)
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trimStart()

    if (trimmed.startsWith('```',)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    // Markdown links: [text](url)
    const mdLinkRegex = /\[(?:[^\]]*)\]\(([^)]+)\)/g
    let match: RegExpExecArray | null
    while ((match = mdLinkRegex.exec(line,)) !== null) {
      const url = match[1]!.trim()
      // Strip title attribute if present: "url 'title'"
      const urlPart = url.split(/\s+/,)[0]!
      links.push({ url: urlPart, line: i + 1, },)
    }

    // HTML href attributes: href="url"
    const hrefRegex = /href="([^"]+)"/g
    while ((match = hrefRegex.exec(line,)) !== null) {
      links.push({ url: match[1]!, line: i + 1, },)
    }
  }

  return links
}

function isInternalLink(url: string,): boolean {
  if (url.startsWith('#',)) return false
  if (url.startsWith('http://',) || url.startsWith('https://',)) return false
  if (url.startsWith('//',)) return false
  if (url.startsWith('mailto:',)) return false
  return true
}

function isOwnDomainLink(url: string, origin: string,): boolean {
  return url.startsWith(origin,)
}

export const linksValidator: Validator = {
  name: 'links',

  async validate(ctx: ValidationContext,): Promise<Issue[]> {
    const issues: Issue[] = []
    const origin = ctx.config?.origin || 'https://sujeet.pro'

    for (const page of ctx.pageMetas) {
      const relPath = relative(ctx.contentDir, page.filePath,)
      const raw = readFileSync(page.filePath, 'utf-8',)

      // Strip frontmatter and calculate line offset
      const fmEnd = raw.indexOf('---', raw.indexOf('---',) + 3,)
      const content = fmEnd !== -1 ? raw.slice(fmEnd + 3,) : raw
      const fmLineCount = fmEnd !== -1 ? raw.slice(0, fmEnd + 3,).split('\n',).length : 0

      const links = extractLinks(content,)
      const fileDir = dirname(page.filePath,)

      for (const link of links) {
        const lineNum = link.line + fmLineCount

        // Check absolute links to own domain
        if (isOwnDomainLink(link.url, origin,)) {
          issues.push({
            file: relPath,
            line: lineNum,
            severity: 'warn',
            rule: 'links/absolute-own-domain',
            message: `Absolute link to own domain should be relative: ${link.url}`,
          },)
          continue
        }

        // Check internal links resolve to existing files
        if (isInternalLink(link.url,)) {
          // Strip fragment
          const urlWithoutFragment = link.url.split('#',)[0]!
          if (!urlWithoutFragment) continue // Pure fragment link

          const resolved = resolve(fileDir, urlWithoutFragment,)
          if (!existsSync(resolved,)) {
            issues.push({
              file: relPath,
              line: lineNum,
              severity: 'error',
              rule: 'links/broken-internal',
              message: `Broken internal link: ${link.url}`,
            },)
          }
        }
      }
    }

    return issues
  },
}
