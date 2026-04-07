import { existsSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { loadSiteConfig } from "#lib/config";
import { generateSitemap } from "#lib/generators";

function formatDate(val: unknown): string | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function collectEntries(contentDir: string): { slug: string; lastmod?: string }[] {
  const entries: { slug: string; lastmod?: string }[] = [];

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== "README.md") continue;

      const raw = readFileSync(full, "utf-8");
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const draftMatch = fmMatch[1].match(/draft:\s*true/);
        if (draftMatch) continue;
      }

      let slug = relative(contentDir, full).replace(/\.md$/, "").replace(/\\/g, "/");
      if (slug === "README") slug = "/";
      else if (slug.endsWith("/README")) slug = slug.slice(0, slug.length - 7);

      if (slug !== "/") slug = "/" + slug.replace(/^\//, "");

      const lastmodMatch = fmMatch?.[1]?.match(/lastUpdatedOn:\s*(.+)/);
      const lastmod = formatDate(lastmodMatch?.[1]?.trim());

      entries.push({ slug, lastmod });
    }
  }

  walk(contentDir);
  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}

const contentDir = join(process.cwd(), "content");
const config = loadSiteConfig(contentDir);
const entries = collectEntries(contentDir);

const outDir = join(process.cwd(), "dist");
mkdirSync(outDir, { recursive: true });

generateSitemap(entries, config.origin, config.basePath, outDir);
console.log(`Sitemap: ${entries.length} URLs -> dist/sitemap.xml`);
