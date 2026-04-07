import { mkdirSync, writeFileSync } from "fs";
import { join, dirname, resolve } from "path";
import type { SiteConfig, TagIndex } from "#schemas/index";
import type { RedirectEntry, VanityEntry } from "./config";

export async function generateTagPages(
  tagIndex: TagIndex,
  siteConfig: SiteConfig,
  layoutsDir: string,
  outDir: string,
): Promise<void> {
  const TagIndex = await import(resolve(layoutsDir, "TagIndex.tsx"));
  const TagListing = await import(resolve(layoutsDir, "TagListing.tsx"));

  const indexHtml = TagIndex.default({
    frontmatter: { title: "Tags", description: "Browse all content tags" },
    slug: "tags",
    site: siteConfig,
    allTags: tagIndex,
  });

  const tagDir = join(outDir, "tags");
  mkdirSync(tagDir, { recursive: true });
  writeFileSync(join(tagDir, "index.html"), indexHtml.toString());

  for (const [tag] of tagIndex) {
    const html = TagListing.default({
      frontmatter: { title: `Tag: ${tag}`, description: `Content tagged with "${tag}"` },
      slug: `tags/${tag}`,
      site: siteConfig,
      allTags: tagIndex,
    });
    const tagPageDir = join(tagDir, tag);
    mkdirSync(tagPageDir, { recursive: true });
    writeFileSync(join(tagPageDir, "index.html"), html.toString());
  }
}

export function generateRedirectPages(
  redirects: RedirectEntry[],
  vanity: VanityEntry[],
  outDir: string,
  basePath: string,
): void {
  for (const { from, to } of redirects) {
    const target = to.startsWith("/") ? `${basePath}${to}` : to;
    const html = redirectHtml(target);
    const filePath = join(outDir, from, "index.html");
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, html);
  }

  for (const { id, target } of vanity) {
    const resolved = target.startsWith("/") ? `${basePath}${target}` : target;
    const html = redirectHtml(resolved);
    const filePath = join(outDir, id, "index.html");
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, html);
  }
}

function redirectHtml(target: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta http-equiv="refresh" content="0; url=${escapeAttr(target)}"/>
<link rel="canonical" href="${escapeAttr(target)}"/>
<title>Redirecting…</title>
</head>
<body><p>Redirecting to <a href="${escapeAttr(target)}">${escapeHtml(target)}</a>.</p></body>
</html>`;
}

export function generateSitemap(
  entries: { slug: string; lastmod?: string }[],
  siteUrl: string,
  basePath: string,
  outDir: string,
): void {
  const origin = siteUrl.replace(/\/$/, "");
  const base = basePath || "";
  const urls = entries.map((e) => {
    const loc =
      e.slug === "/" ? `${origin}${base}/` : `${origin}${base}/${e.slug.replace(/^\//, "")}/`;
    const lastmod = e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : "";
    return `  <url>\n    <loc>${escapeHtml(loc)}</loc>${lastmod}\n  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  writeFileSync(join(outDir, "sitemap.xml"), xml);
}

export function generateRss(
  entries: { title: string; url: string; description?: string; date?: string }[],
  siteConfig: SiteConfig,
  outDir: string,
): void {
  const origin = siteConfig.origin.replace(/\/$/, "");
  const base = siteConfig.basePath || "";
  const items = entries.map((e) => {
    const link = `${origin}${e.url}`;
    const pubDate = e.date ? `\n      <pubDate>${new Date(e.date).toUTCString()}</pubDate>` : "";
    return `    <item>
      <title>${escapeHtml(e.title)}</title>
      <link>${escapeHtml(link)}</link>
      <description>${escapeHtml(e.description ?? "")}</description>${pubDate}
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(siteConfig.title)}</title>
    <link>${escapeHtml(`${origin}${base}`)}</link>
    <description>${escapeHtml(siteConfig.description)}</description>
    <language>${siteConfig.language}</language>
    <atom:link href="${origin}${base}/rss.xml" rel="self" type="application/rss+xml"/>
${items.join("\n")}
  </channel>
</rss>`;

  writeFileSync(join(outDir, "rss.xml"), xml);
}

export async function generateNotFoundPage(
  siteConfig: SiteConfig,
  layoutsDir: string,
  outDir: string,
): Promise<void> {
  const NotFound = await import(resolve(layoutsDir, "NotFound.tsx"));
  const html = NotFound.default({ site: siteConfig });
  writeFileSync(join(outDir, "404.html"), html.toString());
}

export function generateManifest(siteConfig: SiteConfig, outDir: string): void {
  const bp = siteConfig.basePath || "";
  const manifest = {
    name: siteConfig.title,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: `${bp}/`,
    display: "standalone",
    background_color: siteConfig.theme?.darkColor || "#020617",
    theme_color: siteConfig.theme?.darkColor || "#020617",
    icons: [36, 48, 72, 96, 144, 192].map((size) => ({
      src: `${bp}/favicons/android-icon-${size}x${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
    })),
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
