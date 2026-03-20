/**
 * Worker pool for parallel page rendering.
 *
 * Spawns a fixed number of Bun Workers and dispatches page render tasks
 * across them. Uses structured clone for message passing, so all data
 * (GlobalIndex, ProcessedPage) must be plain objects — no Maps, no
 * class instances with methods, no functions.
 *
 * Falls back to serial rendering for small batches where the overhead
 * of spawning workers would outweigh the parallelism benefit.
 */

import { cpus, } from 'os'
import type { GlobalIndex, ProcessedPage, } from '../schemas/build-types'
import { renderPage, } from './renderer'

/** Minimum number of pages before the pool bothers spawning workers. */
const MIN_PAGES_FOR_WORKERS = 16

/** Shape of data sent to a worker via postMessage (all plain objects). */
type SerializedGlobalIndex = Omit<GlobalIndex, 'pageTypeData' | 'tagIndex' | 'pageTypeMetas'> & {
  pageTypeData: Record<string, GlobalIndex['pageTypeData'] extends Map<string, infer V> ? V : never>
  tagIndex: Record<string, GlobalIndex['tagIndex'] extends Map<string, infer V> ? V : never>
  pageTypeMetas: Record<
    string,
    GlobalIndex['pageTypeMetas'] extends Map<string, infer V> ? V : never
  >
}

type WorkerResult = {
  type: 'done' | 'error'
  slug: string
  error?: string
}

export class WorkerPool {
  private workers: Worker[] = []
  private size: number

  constructor(size?: number,) {
    this.size = size ?? Math.max(1, cpus().length - 1,)
  }

  /**
   * Render an array of processed pages, distributing work across workers.
   *
   * For small batches (< MIN_PAGES_FOR_WORKERS), renders serially instead
   * of paying the worker spawn overhead.
   */
  async renderPages(
    tasks: ProcessedPage[],
    globalIndex: GlobalIndex,
    outDir: string,
    layoutsDir: string,
  ): Promise<void> {
    if (tasks.length === 0) return

    // For small batches, serial rendering is faster than worker overhead
    if (tasks.length < MIN_PAGES_FOR_WORKERS) {
      for (const task of tasks) {
        await renderPage(task, globalIndex, outDir, layoutsDir,)
      }
      return
    }

    const serialized = serializeGlobalIndex(globalIndex,)

    // Spawn workers
    const workerUrl = new URL('./worker.ts', import.meta.url,)
    this.workers = Array.from({ length: this.size, }, () => new Worker(workerUrl,),)

    return new Promise<void>((resolve, reject,) => {
      let completed = 0
      const errors: Error[] = []
      let taskIndex = 0

      const dispatchNext = (worker: Worker,) => {
        if (taskIndex >= tasks.length) return
        const task = tasks[taskIndex++]
        worker.postMessage({
          type: 'render',
          task,
          globalIndex: serialized,
          outDir,
          layoutsDir,
        },)
      }

      for (const worker of this.workers) {
        worker.onmessage = (event: MessageEvent<WorkerResult>,) => {
          const { type, slug, error, } = event.data
          if (type === 'error') {
            errors.push(new Error(`Failed to render ${slug}: ${error}`,),)
          }
          completed++

          if (completed === tasks.length) {
            this.dispose()
            if (errors.length > 0) {
              reject(new AggregateError(errors, `${errors.length} page(s) failed to render`,),)
            } else {
              resolve()
            }
          } else {
            dispatchNext(worker,)
          }
        }

        worker.onerror = (event,) => {
          errors.push(new Error(`Worker error: ${event.message}`,),)
          completed++
          if (completed === tasks.length) {
            this.dispose()
            reject(new AggregateError(errors, `${errors.length} page(s) failed to render`,),)
          }
        }

        // Seed each worker with one task
        dispatchNext(worker,)
      }
    },)
  }

  /** Terminate all workers and release resources. */
  dispose(): void {
    for (const worker of this.workers) {
      worker.terminate()
    }
    this.workers = []
  }
}

/**
 * Convert GlobalIndex Maps to plain objects for structured clone.
 * Maps do not survive postMessage — they must be serialized as
 * Record<string, V> and reconstructed on the worker side.
 */
function serializeGlobalIndex(index: GlobalIndex,): SerializedGlobalIndex {
  return {
    config: index.config,
    pageList: index.pageList,
    pageTypeData: Object.fromEntries(index.pageTypeData,),
    tagIndex: Object.fromEntries(index.tagIndex,),
    pageTypeMetas: Object.fromEntries(index.pageTypeMetas,),
  }
}
