import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { normalizeBasePath, withBasePath } from "@pagesmith/site";
import { loadSiteConfig } from "../lib/site-config.ts";
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

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toRoutePath(htmlPath: string, basePath: string): string | null {
  const relPath = relative(distDir, htmlPath).replace(/\\/g, "/");
  if (relPath === "404.html") return null;

  const route =
    relPath === "index.html"
      ? "/"
      : `/${relPath.replace(/\/index\.html$/, "").replace(/\.html$/, "")}`.replace(/\/+/g, "/");

  return withBasePath(basePath, route);
}

function writeSitemap(): void {
  const basePath = normalizeBasePath(siteConfig.basePath);
  const pages = walkFiles(distDir, ".html")
    .filter((filePath) => !isRedirectHtml(readFileSync(filePath, "utf-8")))
    .map((filePath) => toRoutePath(filePath, basePath))
    .filter((path): path is string => !!path);

  const urls = Array.from(new Set(pages))
    .sort()
    .map((path) => `  <url><loc>${escapeXml(`${siteConfig.origin}${path}`)}</loc></url>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  writeFileSync(join(distDir, "sitemap.xml"), xml);
}

function writeRss(): void {
  const basePath = normalizeBasePath(siteConfig.basePath);
  const articleListing = getArticleListing(basePath);
  const articles = articleListing.series
    .flatMap((group) => group.articles)
    .concat(articleListing.other);
  const blogs = getBlogListing(basePath).entries;
  const items = [...articles, ...blogs]
    .filter((entry) => !!entry.publishedDate)
    .sort(
      (left, right) =>
        new Date(right.publishedDate!).getTime() - new Date(left.publishedDate!).getTime(),
    )
    .slice(0, 50);

  const channelLink = `${siteConfig.origin}${withBasePath(basePath, "/")}`;
  const feedItems = items
    .map((entry) => {
      const url = `${siteConfig.origin}${entry.path}`;
      const pubDate = new Date(entry.publishedDate!).toUTCString();
      const categories = entry.tags
        .map((tag) => `    <category>${escapeXml(tag.name)}</category>`)
        .join("\n");
      return [
        "  <item>",
        `    <title>${escapeXml(entry.title)}</title>`,
        `    <link>${escapeXml(url)}</link>`,
        `    <guid>${escapeXml(url)}</guid>`,
        `    <pubDate>${escapeXml(pubDate)}</pubDate>`,
        `    <description>${escapeXml(entry.description ?? entry.title)}</description>`,
        categories,
        "  </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n  <title>${escapeXml(siteConfig.title)}</title>\n  <link>${escapeXml(channelLink)}</link>\n  <description>${escapeXml(siteConfig.description)}</description>\n  <language>${escapeXml(siteConfig.language)}</language>\n  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n${feedItems}\n</channel>\n</rss>\n`;
  writeFileSync(join(distDir, "rss.xml"), rss);
}

if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
  throw new Error(`Build output directory not found: ${distDir}`);
}

ensureNotFoundPage();
writeSitemap();
writeRss();

console.log("Postbuild: sitemap and RSS generated.");
