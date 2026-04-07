import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, extname, relative } from "path";
import { createHash } from "node:crypto";

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

export type AssetManifest = Map<string, string>;

export function copyPublicAssets(publicDir: string, outDir: string): void {
  if (!existsSync(publicDir)) return;
  cpSync(publicDir, outDir, { recursive: true });

  const fontsDir = join(publicDir, "fonts");
  if (existsSync(fontsDir) && statSync(fontsDir).isDirectory()) {
    const assetsDir = join(outDir, "assets");
    mkdirSync(assetsDir, { recursive: true });
    for (const file of readdirSync(fontsDir)) {
      cpSync(join(fontsDir, file), join(assetsDir, file));
    }
  }
}

export function buildContentAssets(
  contentDir: string,
  outDir: string,
  basePath: string,
): AssetManifest {
  const assetsOut = join(outDir, "assets");
  mkdirSync(assetsOut, { recursive: true });
  const manifest: AssetManifest = new Map();

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ASSET_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;

      const content = readFileSync(full);
      const hash = createHash("sha256").update(content).digest("hex").slice(0, 8);
      const ext = extname(entry.name);
      const nameWithoutExt = entry.name.slice(0, -ext.length);
      const hashedName = `${nameWithoutExt}-${hash}${ext}`;

      const dest = join(assetsOut, hashedName);
      if (!existsSync(dest)) {
        cpSync(full, dest);
      }

      const relPath = relative(contentDir, full).replace(/\\/g, "/");
      manifest.set(relPath, `${basePath}/assets/${hashedName}`);
    }
  }

  walk(contentDir);
  return manifest;
}

export function writeCss(css: string, outDir: string): void {
  const assetsDir = join(outDir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  writeFileSync(join(assetsDir, "style.css"), css);
}
