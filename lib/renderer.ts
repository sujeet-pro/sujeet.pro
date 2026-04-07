import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { buildCss, type ContentEntry } from "@pagesmith/core";
import * as esbuild from "esbuild";

import { loadSiteConfig, loadMetaConfig, loadRedirects } from "./config";
import { createSiteContentLayer, loadAllContent } from "./collections";
import { buildSeriesData, findSeriesNav, buildPageTypeData } from "./series";
import { buildTagIndex } from "./tags";
import { copyPublicAssets, copyContentAssets, writeCss } from "./assets";
import {
  generateTagPages,
  generateRedirectPages,
  generateSitemap,
  generateRss,
  generateNotFoundPage,
  generateManifest,
} from "./generators";
import type { SiteConfig, MetaConfig } from "#schemas/index";

export type RenderSiteOptions = {
  outDir: string;
  contentDir: string;
  layoutsDir: string;
  publicDir: string;
};

export async function renderPage(
  layoutName: string,
  props: Record<string, any>,
  layoutsDir: string,
): Promise<string> {
  const layoutModule = await import(resolve(layoutsDir, `${layoutName}.tsx`));
  const html = layoutModule.default(props);
  return html.toString();
}

function formatDate(val: unknown): string | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function writeHtmlFile(outDir: string, slug: string, html: string): void {
  let filePath: string;
  if (slug === "_home") {
    filePath = join(outDir, "index.html");
  } else {
    filePath = join(outDir, slug, "index.html");
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, html);
}

export async function renderSite(options: RenderSiteOptions): Promise<void> {
  const { outDir, contentDir, layoutsDir, publicDir } = options;

  mkdirSync(outDir, { recursive: true });

  // 1. Load configs
  const siteConfig = loadSiteConfig(contentDir);
  const articlesMeta = loadMetaConfig(join(contentDir, "articles"));
  const blogsMeta = loadMetaConfig(join(contentDir, "blogs"));
  const projectsMeta = loadMetaConfig(join(contentDir, "projects"));
  const redirects = loadRedirects(contentDir);

  // 2. Load content
  const layer = createSiteContentLayer();
  const content = await loadAllContent(layer);

  // 3. Build derived data
  const bp = siteConfig.basePath;

  const articleSeriesData = buildSeriesData(articlesMeta, content.articles, bp);
  const articlePageType = buildPageTypeData(
    articlesMeta,
    articleSeriesData,
    content.articles,
    "articles",
    bp,
  );

  const blogSeriesData = buildSeriesData(blogsMeta, content.blogs, bp);
  const blogPageType = buildPageTypeData(blogsMeta, blogSeriesData, content.blogs, "blogs", bp);

  const projectSeriesData = buildSeriesData(projectsMeta, content.projects, bp);
  const projectPageType = buildPageTypeData(
    projectsMeta,
    projectSeriesData,
    content.projects,
    "projects",
    bp,
  );

  const tagIndex = buildTagIndex(content, bp);

  const metaByCollection: Record<
    string,
    { meta: MetaConfig; seriesData: typeof articleSeriesData; pageType: typeof articlePageType }
  > = {
    articles: { meta: articlesMeta, seriesData: articleSeriesData, pageType: articlePageType },
    blogs: { meta: blogsMeta, seriesData: blogSeriesData, pageType: blogPageType },
    projects: { meta: projectsMeta, seriesData: projectSeriesData, pageType: projectPageType },
  };

  // 4. Render content entries
  const sitemapEntries: { slug: string; lastmod?: string }[] = [{ slug: "/" }];
  const rssEntries: { title: string; url: string; description?: string; date?: string }[] = [];

  // Render individual articles/blogs/projects
  for (const collection of ["articles", "blogs", "projects"] as const) {
    const entries = content[collection];
    const { meta, seriesData, pageType } = metaByCollection[collection];

    for (const entry of entries) {
      if (entry.data.draft) continue;

      const rendered = await entry.render();
      const seriesNav = findSeriesNav(seriesData, entry.slug, bp);

      const props: Record<string, any> = {
        content: rendered.html,
        frontmatter: entry.data,
        headings: rendered.headings,
        slug: `${collection}/${entry.slug}`,
        site: siteConfig,
      };

      if (collection === "articles") {
        props.pageType = pageType;
        props.seriesNav = seriesNav;
      } else {
        props.seriesNav = seriesNav;
      }

      const html = await renderPage(meta.itemLayout, props, layoutsDir);
      writeHtmlFile(outDir, `${collection}/${entry.slug}`, html);

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

  // Render listing pages and home
  for (const page of content.pages) {
    const rendered = await page.render();
    let layoutName: string;
    let props: Record<string, any>;

    if (page.slug === "_home") {
      layoutName = "Home";
      props = buildHomeProps(siteConfig, content.articles, articleSeriesData);
    } else if (page.slug in metaByCollection) {
      const { meta, pageType } = metaByCollection[page.slug];
      layoutName = meta.layout;
      props = {
        content: rendered.html,
        frontmatter: page.data,
        headings: rendered.headings,
        slug: page.slug,
        site: siteConfig,
        pageType,
      };
    } else {
      layoutName = page.data.layout ?? siteConfig.defaultLayout;
      props = {
        content: rendered.html,
        frontmatter: page.data,
        headings: rendered.headings,
        slug: page.slug,
        site: siteConfig,
      };
    }

    const html = await renderPage(layoutName, props, layoutsDir);
    writeHtmlFile(outDir, page.slug, html);

    if (page.slug !== "_home") {
      sitemapEntries.push({ slug: page.slug });
    }
  }

  // 5. Generate tag pages
  await generateTagPages(tagIndex, siteConfig, layoutsDir, outDir);
  sitemapEntries.push({ slug: "tags" });
  for (const [tag] of tagIndex) {
    sitemapEntries.push({ slug: `tags/${tag}` });
  }

  // 6. Generate redirect pages
  generateRedirectPages(redirects.redirects, redirects.vanity, outDir, bp);

  // 7. Generate 404 page
  await generateNotFoundPage(siteConfig, layoutsDir, outDir);

  // 8. Build CSS
  let css = buildCss("./styles/main.css", { minify: true });
  if (bp) {
    css = css.replaceAll("url(/assets/", `url(${bp}/assets/`);
  }
  writeCss(css, outDir);

  // 9. Bundle runtime JS
  const bundleResult = await esbuild.build({
    entryPoints: ["./runtime/main.ts"],
    outdir: join(outDir, "assets"),
    entryNames: "main",
    bundle: true,
    minify: true,
    target: "es2020",
    format: "esm",
  });
  if (bundleResult.errors.length > 0) {
    console.error("JS bundle failed:", bundleResult.errors);
  }

  // 10. Copy assets
  copyPublicAssets(publicDir, outDir);
  copyContentAssets(contentDir, outDir);

  // 11. Generate sitemap, RSS, and manifest
  generateSitemap(sitemapEntries, siteConfig.origin, bp, outDir);
  generateRss(rssEntries, siteConfig, outDir);
  generateManifest(siteConfig, outDir);
}

function buildHomeProps(
  siteConfig: SiteConfig,
  articles: ContentEntry[],
  seriesData: {
    slug: string;
    displayName: string;
    description?: string;
    articles: { title: string; url: string }[];
  }[],
) {
  const articleMap = new Map(articles.map((a) => [a.slug, a]));

  const bp = siteConfig.basePath;
  const featuredArticles = (siteConfig.featuredArticles ?? [])
    .map((slug) => {
      const entry = articleMap.get(slug);
      if (!entry) return undefined;
      return {
        title: entry.data.title ?? slug,
        description: entry.data.description,
        url: `${bp}/articles/${slug}`,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== undefined);

  const featuredSeries = (siteConfig.featuredSeries ?? [])
    .map((slug) => seriesData.find((s) => s.slug === slug))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  return {
    site: siteConfig,
    featuredArticles,
    featuredSeries,
    stats: {
      totalArticles: articles.filter((a) => !a.data.draft).length,
      totalSeries: seriesData.length,
    },
  };
}
