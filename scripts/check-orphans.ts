import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, extname, relative } from "node:path";

const CONTENT_DIR = "./content";
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
  ".pdf",
]);
const IGNORE_DIRS = new Set(["diagrams"]);

function collectAssets(dir: string): string[] {
  const assets: string[] = [];
  if (!existsSync(dir)) return assets;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        assets.push(...collectAssets(full));
      }
      continue;
    }
    if (ASSET_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      assets.push(full);
    }
  }
  return assets;
}

function collectMarkdownRefs(dir: string): Set<string> {
  const refs = new Set<string>();
  if (!existsSync(dir)) return refs;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const ref of collectMarkdownRefs(full)) refs.add(ref);
      continue;
    }
    if (extname(entry.name) !== ".md") continue;

    const content = readFileSync(full, "utf-8");
    const refPattern = /(?:src|href)=["']([^"']+)["']|!\[.*?\]\(([^)]+)\)|\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = refPattern.exec(content)) !== null) {
      let ref = match[1] ?? match[2] ?? match[3];
      if (!ref) continue;
      // Strip an optional markdown link title: `./foo.png "caption"` -> `./foo.png`
      ref = ref.trim().split(/\s+/)[0]!;
      // Strip query string / hash fragment.
      ref = ref.split(/[?#]/)[0]!;
      if (!ref || ref.startsWith("http") || ref.startsWith("#") || ref.startsWith("mailto:")) {
        continue;
      }
      const resolved = join(join(full, ".."), ref);
      refs.add(resolved);
    }
  }
  return refs;
}

const assets = collectAssets(CONTENT_DIR);
const refs = collectMarkdownRefs(CONTENT_DIR);

const orphans = assets.filter((a) => !refs.has(a));

if (orphans.length === 0) {
  console.log("No orphaned assets found.");
  process.exit(0);
}

console.log(`Found ${orphans.length} orphaned asset(s):`);
for (const orphan of orphans) {
  console.log(`  ${relative(".", orphan)}`);
}
process.exit(1);
