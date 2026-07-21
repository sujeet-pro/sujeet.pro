/**
 * Post-build artifacts for the built `dist/`.
 *
 * Sitemap and RSS serialization now come from `@pagesmith/site/ssg-utils`
 * (`generateSitemap` / `generateFeed`); this script only supplies the
 * repo-specific inputs those pure serializers need:
 *
 *   - `ensureNotFoundPage()` — flatten `404/index.html` to `404.html` for
 *     GitHub Pages. Not covered upstream.
 *   - sitemap routes — derived from the emitted `dist/` HTML (walk + redirect
 *     and 404 exclusion) so the sitemap reflects exactly what was built.
 *   - feed entries — pulled from the article/blog content listings.
 *
 * Deltas vs the previous hand-rolled writers (see upgrade report):
 *   - Home `<loc>` is now `origin` (no trailing slash) instead of `origin/`.
 *     `generateSitemap` canonicalizes the home route to the base URL. The
 *     build validator normalizes both forms to "/", so no consumer regresses.
 *   - `sitemap.xml` no longer ends with a trailing newline.
 *   - `rss.xml` output is byte-identical (aside from the timestamp).
 */
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { generateFeed, generateSitemap, type FeedEntry } from "@pagesmith/site/ssg-utils";
import { loadSiteConfig, resolveBasePath } from "../lib/site-config.ts";
import { getArticleListing, getBlogListing } from "../theme/lib/content.ts";

const siteConfig = loadSiteConfig();
const distDir = resolve(siteConfig.outDir);

function ensureNotFoundPage(): void {
  const direct404Path = join(distDir, "404.html");
  if (existsSync(direct404Path)) {
    return;
  }

  const nested404Path = join(distDir, "404", "index.html");
  if (existsSync(nested404Path)) {
    copyFileSync(nested404Path, direct404Path);
  }
}

function walkFiles(dir: string, ext?: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath, ext));
      continue;
    }

    if (!ext || fullPath.endsWith(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

function isRedirectHtml(content: string): boolean {
  return /http-equiv=["']?refresh["']?/i.test(content);
}

/**
 * Map a built HTML file to a base-path-relative route. `generateSitemap`
 * joins the route onto `origin` + `basePath` itself, so routes here stay
 * bare (no base-path prefix). Returns `null` for the 404 page.
 */
function toRoute(htmlPath: string): string | null {
  const relPath = relative(distDir, htmlPath).replace(/\\/g, "/");
  if (relPath === "404.html") return null;
  if (relPath === "index.html") return "/";
  return `/${relPath.replace(/\/index\.html$/, "").replace(/\.html$/, "")}`.replace(/\/+/g, "/");
}

function writeSitemap(): void {
  const routes = walkFiles(distDir, ".html")
    .filter((filePath) => !isRedirectHtml(readFileSync(filePath, "utf-8")))
    .map((filePath) => toRoute(filePath))
    .filter((route): route is string => route !== null);

  const uniqueSorted = Array.from(new Set(routes)).sort();

  const xml = generateSitemap(uniqueSorted, {
    origin: siteConfig.origin,
    basePath: resolveBasePath(),
  });
  writeFileSync(join(distDir, "sitemap.xml"), xml);
}

function writeRss(): void {
  const basePath = resolveBasePath();
  const articleListing = getArticleListing(basePath);
  const articles = articleListing.series
    .flatMap((group) => group.articles)
    .concat(articleListing.other);
  const blogs = getBlogListing(basePath).entries;

  // `generateFeed` filters to valid publish dates, sorts newest-first, and
  // caps at `limit` (default 50) internally — the same policy the previous
  // hand-rolled writer applied.
  const entries: FeedEntry[] = [...articles, ...blogs].map((entry) => ({
    title: entry.title,
    path: entry.path,
    publishedDate: entry.publishedDate,
    description: entry.description,
    tags: entry.tags.map((tag) => tag.name),
  }));

  const xml = generateFeed(entries, {
    origin: siteConfig.origin,
    basePath,
    title: siteConfig.title,
    description: siteConfig.description,
    language: siteConfig.language,
  });
  writeFileSync(join(distDir, "rss.xml"), xml);
}

if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
  throw new Error(`Build output directory not found: ${distDir}`);
}

ensureNotFoundPage();
writeSitemap();
writeRss();

console.log("Postbuild: sitemap and RSS generated.");
