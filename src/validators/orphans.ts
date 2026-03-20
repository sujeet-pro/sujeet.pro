/**
 * Orphans validator.
 *
 * Finds files in diagrams/ and assets/ directories that are not referenced
 * by any markdown file. Refactored from scripts/check-orphans.ts.
 */

import { existsSync, readdirSync, readFileSync, } from 'fs'
import { basename, dirname, join, relative, } from 'path'
import type { Issue, ValidationContext, Validator, } from './types'

/** Collect all asset/diagram files in a content directory. */
function collectAssetFiles(articleDir: string,): string[] {
  const files: string[] = []
  const diagramsDir = join(articleDir, 'diagrams',)
  const assetsDir = join(articleDir, 'assets',)

  function walkSubdir(dir: string,) {
    if (!existsSync(dir,)) return
    for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
      const full = join(dir, entry.name,)
      if (entry.isDirectory()) {
        walkSubdir(full,)
      } else {
        // Skip source files and manifest
        if (
          entry.name.endsWith('.mermaid',)
          || entry.name.endsWith('.excalidraw',)
        ) {
          continue
        }
        if (entry.name === 'manifest.json') continue
        files.push(full,)
      }
    }
  }

  walkSubdir(diagramsDir,)
  walkSubdir(assetsDir,)

  // Stray image files in article root
  if (existsSync(articleDir,)) {
    for (const entry of readdirSync(articleDir, { withFileTypes: true, },)) {
      if (entry.isDirectory()) continue
      if (entry.name === 'README.md' || entry.name === 'index.md') continue
      const ext = entry.name.substring(entry.name.lastIndexOf('.',),)
      if (
        ['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif',].includes(
          ext,
        )
      ) {
        files.push(join(articleDir, entry.name,),)
      }
    }
  }

  return files
}

/** Extract all file references (src=, href=, markdown images) from markdown. */
function extractReferences(markdown: string,): Set<string> {
  const refs = new Set<string>()

  const attrRegex = /(?:src|href)="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = attrRegex.exec(markdown,)) !== null) {
    const ref = m[1]!
    if (!ref.startsWith('http',) && !ref.startsWith('//',) && !ref.startsWith('#',)) {
      refs.add(ref,)
    }
  }

  const mdImgRegex = /!\[[^\]]*\]\(([^)]+)\)/g
  while ((m = mdImgRegex.exec(markdown,)) !== null) {
    const ref = m[1]!
    if (!ref.startsWith('http',) && !ref.startsWith('//',)) refs.add(ref,)
  }

  return refs
}

export const orphansValidator: Validator = {
  name: 'orphans',

  async validate(ctx: ValidationContext,): Promise<Issue[]> {
    const issues: Issue[] = []

    for (const page of ctx.pageMetas) {
      const contentDir = dirname(page.filePath,)
      const markdown = readFileSync(page.filePath, 'utf-8',)
      const refs = extractReferences(markdown,)

      // Normalize refs (strip leading ./)
      const normRefs = new Set<string>()
      for (const ref of refs) {
        normRefs.add(ref.replace(/^\.\//, '',),)
      }

      // Check rendered asset files
      const assetFiles = collectAssetFiles(contentDir,)
      for (const file of assetFiles) {
        const relToArticle = relative(contentDir, file,)
        const relToContent = relative(ctx.contentDir, file,)

        // Check for stray files (images in article root, not in assets/)
        if (!relToArticle.includes('/',) && !relToArticle.includes('\\',)) {
          issues.push({
            file: relToContent,
            severity: 'info',
            rule: 'orphans/stray-file',
            message: `Asset file should be in assets/ subfolder`,
          },)
        }

        if (
          !normRefs.has(relToArticle,)
          && !normRefs.has('./' + relToArticle,)
        ) {
          issues.push({
            file: relToContent,
            severity: 'warn',
            rule: 'orphans/unreferenced-asset',
            message: `Not referenced by ${relative(ctx.contentDir, page.filePath,)}`,
          },)
        }
      }

      // Check diagram source files whose rendered SVGs aren't referenced
      const diagramsDir = join(contentDir, 'diagrams',)
      if (existsSync(diagramsDir,)) {
        for (const entry of readdirSync(diagramsDir,)) {
          if (!entry.endsWith('.mermaid',) && !entry.endsWith('.excalidraw',)) {
            continue
          }

          const ext = entry.endsWith('.mermaid',) ? '.mermaid' : '.excalidraw'
          const name = basename(entry, ext,)
          const lightRef = `diagrams/${name}.light.svg`
          const darkRef = `diagrams/${name}.dark.svg`

          if (!normRefs.has(lightRef,) && !normRefs.has(darkRef,)) {
            issues.push({
              file: relative(ctx.contentDir, join(diagramsDir, entry,),),
              severity: 'warn',
              rule: 'orphans/unreferenced-diagram-source',
              message: `Diagram source not referenced (no ${lightRef} or ${darkRef}) in ${
                relative(ctx.contentDir, page.filePath,)
              }`,
            },)
          }
        }
      }
    }

    return issues
  },
}
