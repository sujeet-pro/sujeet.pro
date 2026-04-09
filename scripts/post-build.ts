import { loadSiteConfig } from "#lib/config";
import { createSiteContentLayer, loadAllContent } from "#lib/collections";
import { buildTagIndex } from "#lib/tags";
import { generateSitemap, generateRss, generateManifest } from "#lib/generators";

const outDir = "./dist";
const contentDir = "./content";

const siteConfig = loadSiteConfig(contentDir);

const layer = createSiteContentLayer();
const content = await loadAllContent(layer);
const bp = siteConfig.basePath;

const tagIndex = buildTagIndex(content, bp);

function formatDate(val: unknown): string | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val !== "string" && typeof val !== "number") return undefined;
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

const sitemapEntries: { slug: string; lastmod?: string }[] = [{ slug: "/" }];
const rssEntries: { title: string; url: string; description?: string; date?: string }[] = [];

for (const collection of ["articles", "blogs", "projects"] as const) {
  sitemapEntries.push({ slug: collection });
  for (const entry of content[collection]) {
    if (entry.data.draft) continue;
    sitemapEntries.push({
      slug: `${collection}/${entry.slug}`,
      lastmod: formatDate(entry.data.lastUpdatedOn ?? entry.data.publishedDate),
    });
    rssEntries.push({
      title: entry.data.title ?? entry.slug,
      url: `${bp}/${collection}/${entry.slug}/`,
      description: entry.data.description,
      date: formatDate(entry.data.publishedDate),
    });
  }
}

sitemapEntries.push({ slug: "tags" });
for (const [tag] of tagIndex) {
  sitemapEntries.push({ slug: `tags/${tag}` });
}

generateSitemap(sitemapEntries, siteConfig.origin, bp, outDir);
generateRss(rssEntries, siteConfig, outDir);
generateManifest(siteConfig, outDir);

console.log(
  `Post-build: sitemap (${sitemapEntries.length} URLs), RSS (${rssEntries.length} items), manifest`,
);
