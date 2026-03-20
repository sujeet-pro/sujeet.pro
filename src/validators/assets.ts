/**
 * Assets validator.
 *
 * Checks that all src= references in markdown (images, diagrams) point
 * to files that exist on disk.
 */

import { existsSync, readFileSync, } from 'fs'
import { dirname, relative, resolve, } from 'path'
import type { Issue, ValidationContext, Validator, } from './types'

interface AssetRef {
  path: string
  line: number
}

/** Extract all src= references from markdown, skipping fenced code blocks. */
function extractAssetRefs(markdown: string,): AssetRef[] {
  const refs: AssetRef[] = []
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

    // HTML src attributes: src="path"
    const srcRegex = /src="([^"]+)"/g
    let match: RegExpExecArray | null
    while ((match = srcRegex.exec(line,)) !== null) {
      const ref = match[1]!
      // Skip external URLs
      if (
        !ref.startsWith('http://',)
        && !ref.startsWith('https://',)
        && !ref.startsWith('//',)
      ) {
        refs.push({ path: ref, line: i + 1, },)
      }
    }

    // Markdown images: ![alt](path)
    const imgRegex = /!\[[^\]]*\]\(([^)]+)\)/g
    while ((match = imgRegex.exec(line,)) !== null) {
      const ref = match[1]!.trim().split(/\s+/,)[0]!
      if (
        !ref.startsWith('http://',)
        && !ref.startsWith('https://',)
        && !ref.startsWith('//',)
      ) {
        refs.push({ path: ref, line: i + 1, },)
      }
    }
  }

  return refs
}

export const assetsValidator: Validator = {
  name: 'assets',

  async validate(ctx: ValidationContext,): Promise<Issue[]> {
    const issues: Issue[] = []

    for (const page of ctx.pageMetas) {
      const relPath = relative(ctx.contentDir, page.filePath,)
      const raw = readFileSync(page.filePath, 'utf-8',)

      // Strip frontmatter and calculate line offset
      const fmEnd = raw.indexOf('---', raw.indexOf('---',) + 3,)
      const content = fmEnd !== -1 ? raw.slice(fmEnd + 3,) : raw
      const fmLineCount = fmEnd !== -1 ? raw.slice(0, fmEnd + 3,).split('\n',).length : 0

      const refs = extractAssetRefs(content,)
      const fileDir = dirname(page.filePath,)

      for (const ref of refs) {
        const resolved = resolve(fileDir, ref.path,)
        if (!existsSync(resolved,)) {
          issues.push({
            file: relPath,
            line: ref.line + fmLineCount,
            severity: 'error',
            rule: 'assets/missing-file',
            message: `Referenced asset not found: ${ref.path}`,
          },)
        }
      }
    }

    return issues
  },
}
