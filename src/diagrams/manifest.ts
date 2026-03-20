import { createHash, } from 'crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync, } from 'fs'
import { basename, join, } from 'path'
import type { DiagramFile, } from './renderers/types'

/* ── Types ── */

export type ManifestEntry = {
  hash: string
  generatedAt: string
  outputs: string[]
}

export type Manifest = {
  version: 1
  diagrams: Record<string, ManifestEntry>
}

/* ── Manifest I/O ── */

export function readManifest(dir: string,): Manifest {
  const path = join(dir, 'manifest.json',)
  if (!existsSync(path,)) return { version: 1, diagrams: {}, }
  try {
    return JSON.parse(readFileSync(path, 'utf-8',),)
  } catch {
    return { version: 1, diagrams: {}, }
  }
}

export function writeManifest(dir: string, manifest: Manifest,): void {
  writeFileSync(join(dir, 'manifest.json',), JSON.stringify(manifest, null, 2,) + '\n',)
}

/* ── Hashing ── */

export function hashFile(filePath: string,): string {
  const content = readFileSync(filePath,)
  return 'sha256:' + createHash('sha256',).update(content,).digest('hex',).slice(0, 16,)
}

/* ── Staleness checking ── */

/** Filter files to only those that have changed since last render. */
export function filterStaleFiles(files: DiagramFile[], force: boolean,): DiagramFile[] {
  if (force) return files

  const stale: DiagramFile[] = []
  // Group by directory
  const byDir = new Map<string, DiagramFile[]>()
  for (const f of files) {
    if (!byDir.has(f.dir,)) byDir.set(f.dir, [],)
    byDir.get(f.dir,)!.push(f,)
  }

  for (const [dir, dirFiles,] of byDir) {
    const manifest = readManifest(dir,)
    for (const f of dirFiles) {
      const name = basename(f.path,)
      const hash = hashFile(f.path,)
      const entry = manifest.diagrams[name]
      if (!entry || entry.hash !== hash) {
        stale.push(f,)
      }
    }
  }

  return stale
}

/** Update manifests after successful renders. */
export function updateManifests(files: DiagramFile[],): void {
  const byDir = new Map<string, DiagramFile[]>()
  for (const f of files) {
    if (!byDir.has(f.dir,)) byDir.set(f.dir, [],)
    byDir.get(f.dir,)!.push(f,)
  }

  for (const [dir, dirFiles,] of byDir) {
    const manifest = readManifest(dir,)
    for (const f of dirFiles) {
      const name = basename(f.path,)
      manifest.diagrams[name] = {
        hash: hashFile(f.path,),
        generatedAt: new Date().toISOString(),
        outputs: [`${f.name}.light.svg`, `${f.name}.dark.svg`,],
      }
    }

    // Clean entries for deleted files
    for (const name of Object.keys(manifest.diagrams,)) {
      if (!existsSync(join(dir, name,),)) {
        const entry = manifest.diagrams[name]
        // Also remove orphaned SVGs
        for (const output of entry.outputs) {
          const outPath = join(dir, output,)
          if (existsSync(outPath,)) unlinkSync(outPath,)
        }
        delete manifest.diagrams[name]
      }
    }

    writeManifest(dir, manifest,)
  }
}
