/**
 * CLI wrapper for the modular diagram rendering pipeline.
 *
 * Usage:
 *   bun scripts/diagrams.ts                     # render changed only
 *   bun scripts/diagrams.ts --watch             # render + watch for changes
 *   bun scripts/diagrams.ts --force             # force regenerate ALL
 *   bun scripts/diagrams.ts --file <path>       # force regenerate one file
 *   bun scripts/diagrams.ts --type mermaid      # only mermaid diagrams
 *   bun scripts/diagrams.ts --type excalidraw   # only excalidraw diagrams
 */

import { type DiagramOptions, renderDiagrams, watchDiagrams, } from '../src/diagrams'

function parseArgs(): DiagramOptions & { watch: boolean } {
  const args = process.argv.slice(2,)
  const opts: DiagramOptions & { watch: boolean } = { watch: false, force: false, }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--watch') opts.watch = true
    else if (args[i] === '--force') opts.force = true
    else if (args[i] === '--file' && args[i + 1]) opts.file = args[++i]
    else if (args[i] === '--type' && args[i + 1]) {
      const t = args[++i]
      if (t === 'mermaid' || t === 'excalidraw') opts.type = t
      else {
        console.error(`Unknown type: ${t}. Use 'mermaid' or 'excalidraw'.`,)
        process.exit(1,)
      }
    }
  }

  return opts
}

async function main() {
  const opts = parseArgs()

  await renderDiagrams(opts,)

  if (opts.watch) watchDiagrams()
}

main().catch((err,) => {
  console.error(err,)
  process.exit(1,)
},)
