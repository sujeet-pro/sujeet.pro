/**
 * Modular diagram rendering pipeline.
 *
 * Finds diagram source files, checks manifest for staleness,
 * dispatches to the appropriate renderer, and updates manifests.
 */

import { watch, } from 'chokidar'
import { basename, dirname, join, } from 'path'
import { filterByType, findDiagramFiles, } from './discovery'
import { filterStaleFiles, updateManifests, } from './manifest'
import { createRenderers, } from './renderers'
import type { DiagramFile, } from './renderers/types'

const ROOT = process.cwd()
const CONTENT_DIR = join(ROOT, 'content',)

/* ── Public options ── */

export type DiagramOptions = {
  watch?: boolean
  force?: boolean
  file?: string
  type?: 'mermaid' | 'excalidraw'
}

/* ── Helpers ── */

function toDiagramFile(path: string,): DiagramFile {
  const ext = path.endsWith('.mermaid',) ? '.mermaid' : '.excalidraw'
  return {
    path,
    name: basename(path, ext,),
    dir: dirname(path,),
    ext,
  }
}

function getRendererForExt(ext: string,) {
  const renderers = createRenderers()
  return renderers.find((r,) => r.extensions.includes(ext,))
}

/* ── Main entry points ── */

export async function renderDiagrams(opts: DiagramOptions = {},): Promise<void> {
  // Single file mode
  if (opts.file) {
    const path = opts.file
    console.log(`Force rendering: ${path}`,)

    const file = toDiagramFile(path,)
    const renderer = getRendererForExt(file.ext,)

    if (!renderer) {
      console.error('Unknown file type. Must be .mermaid or .excalidraw',)
      return
    }

    await renderer.renderSingle(file,)
    updateManifests([file,],)
    return
  }

  // Batch mode
  const allFiles = findDiagramFiles(CONTENT_DIR,)
  let filtered = allFiles

  // Filter by type
  if (opts.type) {
    filtered = filterByType(filtered, opts.type,)
  }

  // Filter stale (unless force)
  const stale = filterStaleFiles(filtered, opts.force ?? false,)

  if (stale.length === 0) {
    console.log(`All ${filtered.length} diagrams up-to-date (skipped)`,)
  } else {
    if (!opts.force && stale.length < filtered.length) {
      console.log(
        `${filtered.length - stale.length} diagrams up-to-date, ${stale.length} need rendering`,
      )
    }

    const renderers = createRenderers()
    for (const renderer of renderers) {
      const batch = stale.filter((f,) => renderer.extensions.includes(f.ext,))
      await renderer.renderBatch(batch,)
    }

    // Update manifests
    updateManifests(stale,)
  }
}

export function watchDiagrams(): void {
  console.log('Watching for diagram changes...\n',)

  const watcher = watch(
    [join(CONTENT_DIR, '**/*.mermaid',), join(CONTENT_DIR, '**/*.excalidraw',),],
    { ignoreInitial: true, ignored: /node_modules|dist|dev/, },
  )

  const handle = async (path: string,) => {
    const file = toDiagramFile(path,)
    const renderer = getRendererForExt(file.ext,)
    if (renderer) {
      await renderer.renderSingle(file,)
    }
    updateManifests([file,],)
  }

  watcher.on('change', async (path,) => {
    console.log(`Changed: ${path}`,)
    await handle(path,)
  },)

  watcher.on('add', async (path,) => {
    console.log(`Added: ${path}`,)
    await handle(path,)
  },)
}
