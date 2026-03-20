/**
 * Headings validator.
 *
 * Checks markdown heading structure: no level skips, at most one h1,
 * and first heading should be h1 or h2.
 */

import { readFileSync, } from 'fs'
import { relative, } from 'path'
import type { Issue, ValidationContext, Validator, } from './types'

/** Extract headings from markdown, skipping fenced code blocks. */
function extractHeadings(
  markdown: string,
): Array<{ level: number; text: string; line: number }> {
  const headings: Array<{ level: number; text: string; line: number }> = []
  const lines = markdown.split('\n',)
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trimStart()

    // Toggle code block state
    if (trimmed.startsWith('```',)) {
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) continue

    // Match ATX headings: # Heading
    const match = line.match(/^(#{1,6})\s+(.+)/,)
    if (match) {
      headings.push({
        level: match[1]!.length,
        text: match[2]!.trim(),
        line: i + 1, // 1-based line number
      },)
    }
  }

  return headings
}

export const headingsValidator: Validator = {
  name: 'headings',

  async validate(ctx: ValidationContext,): Promise<Issue[]> {
    const issues: Issue[] = []

    for (const page of ctx.pageMetas) {
      const relPath = relative(ctx.contentDir, page.filePath,)
      const raw = readFileSync(page.filePath, 'utf-8',)

      // Strip frontmatter before extracting headings
      const fmEnd = raw.indexOf('---', raw.indexOf('---',) + 3,)
      const content = fmEnd !== -1 ? raw.slice(fmEnd + 3,) : raw
      // Adjust line offset for frontmatter
      const fmLineCount = fmEnd !== -1 ? raw.slice(0, fmEnd + 3,).split('\n',).length : 0

      const headings = extractHeadings(content,)
      if (headings.length === 0) continue

      // Check: at most one h1
      const h1s = headings.filter((h,) => h.level === 1)
      if (h1s.length > 1) {
        for (const h of h1s.slice(1,)) {
          issues.push({
            file: relPath,
            line: h.line + fmLineCount,
            severity: 'warn',
            rule: 'headings/multiple-h1',
            message: `Multiple h1 headings found: "${h.text}"`,
          },)
        }
      }

      // Check: first heading should be h1 or h2
      const first = headings[0]!
      if (first.level > 2) {
        issues.push({
          file: relPath,
          line: first.line + fmLineCount,
          severity: 'warn',
          rule: 'headings/first-heading-level',
          message: `First heading is h${first.level}, expected h1 or h2`,
        },)
      }

      // Check: no heading level skips (e.g. h2 -> h4 without h3)
      for (let i = 1; i < headings.length; i++) {
        const prev = headings[i - 1]!
        const curr = headings[i]!
        // Only flag when going deeper (h2 -> h4 is a skip, h4 -> h2 is fine)
        if (curr.level > prev.level + 1) {
          issues.push({
            file: relPath,
            line: curr.line + fmLineCount,
            severity: 'warn',
            rule: 'headings/level-skip',
            message: `Heading level skip: h${prev.level} -> h${curr.level} ("${curr.text}")`,
          },)
        }
      }
    }

    return issues
  },
}
