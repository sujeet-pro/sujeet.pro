/**
 * Worker entry point for parallel page rendering.
 *
 * Runs inside a Bun Worker. Receives serialized page tasks and global
 * index data via postMessage, renders the page, and posts back the result.
 *
 * Each worker gets its own layout cache (module-level in layout-loader.ts)
 * and its own dynamic imports, so there are no shared-state concerns.
 */

// Bun worker context — self is the worker global scope
const worker = self as unknown as Pick<Worker, 'onmessage' | 'postMessage'>

worker.onmessage = async (event: MessageEvent,) => {
  const { type, task, globalIndex, outDir, layoutsDir, } = event.data

  if (type === 'render') {
    try {
      const { renderPageFromWorker, } = await import('./renderer')
      await renderPageFromWorker(task, globalIndex, outDir, layoutsDir,)
      worker.postMessage({ type: 'done', slug: task.slug, },)
    } catch (error) {
      worker.postMessage({
        type: 'error',
        slug: task.slug,
        error: error instanceof Error ? error.message : String(error,),
      },)
    }
  }
}
