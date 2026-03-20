import { copyFileSync, existsSync, mkdirSync, readdirSync, } from 'fs'
import { dirname, join, relative, } from 'path'

/**
 * Copy public directory to output, preserving structure (no hashing).
 * Skips `fonts/` since those are copied to dist/assets/ and hashed.
 */
export function copyPublicFiles(
  publicDir: string,
  outDir: string,
): void {
  if (!existsSync(publicDir,)) return
  function walk(dir: string,) {
    for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
      const full = join(dir, entry.name,)
      // Skip fonts/ — they are copied to dist/assets/ and hashed
      if (entry.isDirectory() && entry.name === 'fonts' && dir === publicDir) continue
      if (entry.isDirectory()) {
        walk(full,)
        continue
      }
      const rel = relative(publicDir, full,)
      const dest = join(outDir, rel,)
      mkdirSync(dirname(dest,), { recursive: true, },)
      copyFileSync(full, dest,)
    }
  }
  walk(publicDir,)
}
