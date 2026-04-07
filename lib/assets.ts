import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join, extname } from "path";

const ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".svg",
  ".mp4",
  ".webm",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".pdf",
]);

export function copyPublicAssets(publicDir: string, outDir: string): void {
  if (!existsSync(publicDir)) return;
  cpSync(publicDir, outDir, { recursive: true });
}

export function copyContentAssets(contentDir: string, outDir: string): void {
  const assetsOut = join(outDir, "assets");
  mkdirSync(assetsOut, { recursive: true });

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ASSET_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      const dest = join(assetsOut, entry.name);
      if (!existsSync(dest)) {
        cpSync(full, dest);
      }
    }
  }

  walk(contentDir);
}

export function writeCss(css: string, outDir: string): void {
  const assetsDir = join(outDir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  writeFileSync(join(assetsDir, "style.css"), css);
}
