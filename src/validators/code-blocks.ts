/**
 * Code block validator.
 *
 * Checks fenced code blocks in markdown content for:
 * - collapse ranges that exceed actual line count
 * - invalid range syntax
 */

import { readFileSync, } from 'fs'
import type { Issue, ValidationContext, Validator, } from './types'

/** Parse collapse ranges from meta string, same logic as shiki-transformers. */
function parseCollapseRanges(meta: string,): number[][] {
  const match = meta.match(/collapse=\{([^}]+)\}/,)
  if (!match) return []
  return match[1].split(',',).map((part,) => {
    const trimmed = part.trim()
    if (trimmed.includes('-',)) {
      const [a, b,] = trimmed.split('-',).map(Number,)
      return [a, b,]
    }
    const n = Number(trimmed,)
    return [n, n,]
  },)
}

export const codeBlocksValidator: Validator = {
  name: 'code-blocks',

  async validate(ctx: ValidationContext,): Promise<Issue[]> {
    const issues: Issue[] = []

    for (const page of ctx.pageMetas) {
      const raw = readFileSync(page.filePath, 'utf-8',)
      const lines = raw.split('\n',)

      // Find fenced code blocks: ```lang meta ... ```
      let i = 0
      while (i < lines.length) {
        const line = lines[i]
        const openMatch = line.match(/^(`{3,})(\w*)\s*(.*?)\s*$/,)
        if (!openMatch) {
          i++
          continue
        }

        const fence = openMatch[1] // the ``` chars
        const meta = openMatch[3] || ''
        const openLine = i + 1 // 1-based line number

        // Find closing fence
        let j = i + 1
        while (j < lines.length && !lines[j].startsWith(fence,)) {
          j++
        }

        if (j >= lines.length) {
          // Unclosed code block
          issues.push({
            file: page.filePath,
            line: openLine,
            severity: 'error',
            rule: 'code-blocks/unclosed-fence',
            message: 'Fenced code block is never closed',
          },)
          i = j
          continue
        }

        // Code body is lines between open and close fences
        const bodyLines = j - i - 1

        // Check collapse ranges
        const collapseRanges = parseCollapseRanges(meta,)
        for (const [start, end,] of collapseRanges) {
          if (start < 1) {
            issues.push({
              file: page.filePath,
              line: openLine,
              severity: 'error',
              rule: 'code-blocks/invalid-collapse-range',
              message: `Collapse range start ${start} is less than 1`,
            },)
          }
          if (end > bodyLines) {
            issues.push({
              file: page.filePath,
              line: openLine,
              severity: 'warn',
              rule: 'code-blocks/collapse-exceeds-lines',
              message:
                `Collapse range ${start}-${end} exceeds line count (${bodyLines} lines). Will be clamped to ${start}-${bodyLines}`,
            },)
          }
          if (start > end) {
            issues.push({
              file: page.filePath,
              line: openLine,
              severity: 'error',
              rule: 'code-blocks/invalid-collapse-range',
              message: `Collapse range start (${start}) is greater than end (${end})`,
            },)
          }
          if (start > bodyLines) {
            issues.push({
              file: page.filePath,
              line: openLine,
              severity: 'warn',
              rule: 'code-blocks/collapse-exceeds-lines',
              message:
                `Collapse range ${start}-${end} starts beyond line count (${bodyLines} lines). Will be skipped`,
            },)
          }
        }

        // Check for overlapping collapse ranges
        const sorted = [...collapseRanges,].sort((a, b,) => a[0] - b[0])
        for (let k = 1; k < sorted.length; k++) {
          const prev = sorted[k - 1]
          const curr = sorted[k]
          if (curr[0] <= prev[1]) {
            issues.push({
              file: page.filePath,
              line: openLine,
              severity: 'error',
              rule: 'code-blocks/overlapping-collapse',
              message: `Collapse ranges ${prev[0]}-${prev[1]} and ${curr[0]}-${curr[1]} overlap`,
            },)
          }
        }

        i = j + 1
      }
    }

    return issues
  },
}
