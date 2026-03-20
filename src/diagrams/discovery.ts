import { existsSync, readdirSync, } from 'fs'
import { basename, dirname, join, } from 'path'
import type { DiagramFile, } from './renderers/types'

const EXTENSIONS: Record<string, string> = {
  '.mermaid': '.mermaid',
  '.excalidraw': '.excalidraw',
}

/** Recursively find all diagram source files under a directory. */
export function findDiagramFiles(dir: string,): DiagramFile[] {
  const results: DiagramFile[] = []

  function walk(d: string,) {
    if (!existsSync(d,)) return
    for (const entry of readdirSync(d, { withFileTypes: true, },)) {
      const full = join(d, entry.name,)
      if (entry.isDirectory()) {
        walk(full,)
      } else {
        for (const ext of Object.keys(EXTENSIONS,)) {
          if (entry.name.endsWith(ext,)) {
            results.push({
              path: full,
              name: basename(entry.name, ext,),
              dir: dirname(full,),
              ext,
            },)
            break
          }
        }
      }
    }
  }

  walk(dir,)
  return results
}

/** Filter diagram files by extension type. */
export function filterByType(
  files: DiagramFile[],
  type: 'mermaid' | 'excalidraw',
): DiagramFile[] {
  const ext = `.${type}`
  return files.filter((f,) => f.ext === ext)
}
