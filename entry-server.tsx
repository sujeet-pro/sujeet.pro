import type { SsgRenderConfig } from "@pagesmith/core/vite";
import type { ContentEntry } from "@pagesmith/core";
import { join } from "node:path";

import { loadSiteConfig, loadMetaConfig, loadRedirects } from "#lib/config";
import { createSiteContentLayer, loadAllContent, type SiteContent } from "#lib/collections";
import { buildSeriesData, findSeriesNav, buildPageTypeData } from "#lib/series";
import { buildTagIndex } from "#lib/tags";
import type {
  SiteConfig,
  MetaConfig,
  SeriesData,
  PageTypeData,
  TagIndex as TagIndexType,
} from "#schemas/index";

import ArticleLayout from "./layouts/Article";
import BlogLayout from "./layouts/Blog";
import HomeLayout from "./layouts/Home";
import ListingLayout from "./layouts/Listing";
import NotFoundLayout from "./layouts/NotFound";
import PageLayout from "./layouts/Page";
import ProjectLayout from "./layouts/Project";
import TagIndexLayout from "./layouts/TagIndex";
import TagListingLayout from "./layouts/TagListing";

// ---------------------------------------------------------------------------
// Layout registry
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- layout props vary per component
const layouts: Record<string, (props: any) => unknown> = {
  Article: ArticleLayout,
  Blog: BlogLayout,
  Home: HomeLayout,
  Listing: ListingLayout,
  NotFound: NotFoundLayout,
  Page: PageLayout,
  Project: ProjectLayout,
  TagIndex: TagIndexLayout,
  TagListing: TagListingLayout,
};

function renderLayout(name: string, props: Record<string, unknown>): string {
  const layout = layouts[name];
  if (!layout) throw new Error(`Unknown layout: ${name}`);
  const result = layout(props);
  return String(result);
}

// ---------------------------------------------------------------------------
// Site data loading (cached per build, fresh per dev request)
// ---------------------------------------------------------------------------

type SiteData = {
  siteConfig: SiteConfig;
  articlesMeta: MetaConfig;
  blogsMeta: MetaConfig;
  projectsMeta: MetaConfig;
  redirects: {
    vanity: { id: string; target: string }[];
    redirects: { from: string; to: string }[];
  };
  content: SiteContent;
  articleSeriesData: SeriesData[];
  blogSeriesData: SeriesData[];
  projectSeriesData: SeriesData[];
  articlePageType: PageTypeData;
  blogPageType: PageTypeData;
  projectPageType: PageTypeData;
  tagIndex: TagIndexType;
};

const metaByCollectionKeys = ["articles", "blogs", "projects"] as const;

let cache: SiteData | null = null;

async function loadSite(config: SsgRenderConfig): Promise<SiteData> {
  if (!config.isDev && cache) return cache;

  const contentDir = join(config.root, "content");
  const siteConfig = loadSiteConfig(contentDir);

  const articlesMeta = loadMetaConfig(join(contentDir, "articles"));
  const blogsMeta = loadMetaConfig(join(contentDir, "blogs"));
  const projectsMeta = loadMetaConfig(join(contentDir, "projects"));
  const redirects = loadRedirects(contentDir);

  const layer = createSiteContentLayer();
  const content = await loadAllContent(layer);

  const bp = siteConfig.basePath;

  const articleSeriesData = buildSeriesData(articlesMeta, content.articles, bp);
  const blogSeriesData = buildSeriesData(blogsMeta, content.blogs, bp);
  const projectSeriesData = buildSeriesData(projectsMeta, content.projects, bp);

  const articlePageType = buildPageTypeData(
    articlesMeta,
    articleSeriesData,
    content.articles,
    "articles",
    bp,
  );
  const blogPageType = buildPageTypeData(blogsMeta, blogSeriesData, content.blogs, "blogs", bp);
  const projectPageType = buildPageTypeData(
    projectsMeta,
    projectSeriesData,
    content.projects,
    "projects",
    bp,
  );

  const tagIndex = buildTagIndex(content, bp);

  const result: SiteData = {
    siteConfig,
    articlesMeta,
    blogsMeta,
    projectsMeta,
    redirects,
    content,
    articleSeriesData,
    blogSeriesData,
    projectSeriesData,
    articlePageType,
    blogPageType,
    projectPageType,
    tagIndex,
  };

  cache = result;
  return result;
}

function getCollectionMeta(site: SiteData, collection: string) {
  if (collection === "articles")
    return {
      meta: site.articlesMeta,
      seriesData: site.articleSeriesData,
      pageType: site.articlePageType,
    };
  if (collection === "blogs")
    return { meta: site.blogsMeta, seriesData: site.blogSeriesData, pageType: site.blogPageType };
  return {
    meta: site.projectsMeta,
    seriesData: site.projectSeriesData,
    pageType: site.projectPageType,
  };
}

// ---------------------------------------------------------------------------
// Content link rewriting — converts ./slug/README.md hrefs to proper URLs
// ---------------------------------------------------------------------------

function rewriteContentLinks(html: string, contentRelDir: string, basePath: string): string {
  return html.replace(/href="([^"]+)"/g, (match, rawPath: string) => {
    if (!rawPath.includes("README.md")) return match;
    if (rawPath.startsWith("http:") || rawPath.startsWith("https:") || rawPath.startsWith("data:"))
      return match;

    const [pathPart, hash] = rawPath.split("#");
    const resolved = join(contentRelDir, pathPart).replace(/\\/g, "/");
    const slug = resolved.replace(/\/README\.md$/, "");
    const hashSuffix = hash ? `#${hash}` : "";
    return `href="${basePath}/${slug}${hashSuffix}"`;
  });
}

// ---------------------------------------------------------------------------
// Redirect HTML
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function redirectHtml(target: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta http-equiv="refresh" content="0; url=${escapeAttr(target)}"/>
<link rel="canonical" href="${escapeAttr(target)}"/>
<title>Redirecting\u2026</title>
</head>
<body><p>Redirecting to <a href="${escapeAttr(target)}">${escapeHtml(target)}</a>.</p></body>
</html>`;
}

// ---------------------------------------------------------------------------
// Route generation
// ---------------------------------------------------------------------------

export async function getRoutes(config: SsgRenderConfig): Promise<string[]> {
  const site = await loadSite(config);
  const routes: string[] = ["/"];

  for (const collection of metaByCollectionKeys) {
    routes.push(`/${collection}`);
    for (const entry of site.content[collection]) {
      if (!entry.data.draft) {
        routes.push(`/${collection}/${entry.slug}`);
      }
    }
  }

  routes.push("/tags");
  for (const [tag] of site.tagIndex) {
    routes.push(`/tags/${tag}`);
  }

  for (const { from } of site.redirects.redirects) {
    routes.push(`/${from.replace(/^\//, "")}`);
  }
  for (const { id } of site.redirects.vanity) {
    routes.push(`/${id.replace(/^\//, "")}`);
  }

  routes.push("/404");
  return routes;
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

export async function render(url: string, config: SsgRenderConfig): Promise<string> {
  const site = await loadSite(config);

  let path = url;
  if (config.base && path.startsWith(config.base)) {
    path = path.slice(config.base.length) || "/";
  }
  path = path.replace(/\/+$/, "") || "/";

  const jsPath = config.isDev ? `${config.base}/client.ts` : config.jsPath;
  const siteWithAssets = { ...site.siteConfig, cssPath: config.cssPath, jsPath };

  // ---- Home ----
  if (path === "/") {
    return renderHome(siteWithAssets, site);
  }

  // ---- Content entry or listing ----
  const contentMatch = path.match(/^\/(articles|blogs|projects)(?:\/(.+))?$/);
  if (contentMatch) {
    const [, collection, slug] = contentMatch;
    if (slug) {
      return renderContentEntry(collection, slug, siteWithAssets, site);
    }
    return renderListingPage(collection, siteWithAssets, site);
  }

  // ---- Tags ----
  const tagMatch = path.match(/^\/tags(?:\/(.+))?$/);
  if (tagMatch) {
    const tag = tagMatch[1];
    if (tag) {
      return renderLayout("TagListing", {
        frontmatter: { title: `Tag: ${tag}`, description: `Content tagged with "${tag}"` },
        slug: `tags/${tag}`,
        site: siteWithAssets,
        allTags: site.tagIndex,
      });
    }
    return renderLayout("TagIndex", {
      frontmatter: { title: "Tags", description: "Browse all content tags" },
      slug: "tags",
      site: siteWithAssets,
      allTags: site.tagIndex,
    });
  }

  // ---- Redirects ----
  const redirectTarget = findRedirectTarget(path, site);
  if (redirectTarget) {
    return redirectHtml(redirectTarget);
  }

  // ---- 404 ----
  return renderLayout("NotFound", { site: siteWithAssets });
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderHome(site: SiteConfig, data: SiteData): string {
  const articleMap = new Map(data.content.articles.map((a) => [a.slug, a]));
  const bp = site.basePath;

  const featuredArticles = (site.featuredArticles ?? [])
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

  const featuredSeries = (site.featuredSeries ?? [])
    .map((slug) => data.articleSeriesData.find((s) => s.slug === slug))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  return renderLayout("Home", {
    site,
    featuredArticles,
    featuredSeries,
    stats: {
      totalArticles: data.content.articles.filter((a) => !a.data.draft).length,
      totalSeries: data.articleSeriesData.length,
    },
  });
}

async function renderContentEntry(
  collection: string,
  slug: string,
  site: SiteConfig,
  data: SiteData,
): Promise<string> {
  const entries = data.content[collection as keyof SiteContent] as ContentEntry[];
  const entry = entries.find((e) => e.slug === slug);

  if (!entry || entry.data.draft) {
    return renderLayout("NotFound", { site });
  }

  const { meta, seriesData } = getCollectionMeta(data, collection);
  const rendered = await entry.render();
  const bp = site.basePath;
  const contentHtml = rewriteContentLinks(rendered.html, `${collection}/${slug}`, bp);
  const seriesNav = findSeriesNav(seriesData, slug, bp);

  const props: Record<string, unknown> = {
    content: contentHtml,
    frontmatter: entry.data,
    headings: rendered.headings,
    slug: `${collection}/${slug}`,
    site,
    seriesNav,
  };

  if (collection === "articles") {
    props.pageType = data.articlePageType;
  }

  return renderLayout(meta.itemLayout, props);
}

async function renderListingPage(
  collection: string,
  site: SiteConfig,
  data: SiteData,
): Promise<string> {
  const page = data.content.pages.find((p) => p.slug === collection);
  if (!page) {
    return renderLayout("NotFound", { site });
  }

  const { meta, pageType } = getCollectionMeta(data, collection);
  const rendered = await page.render();

  return renderLayout(meta.layout, {
    content: rendered.html,
    frontmatter: page.data,
    headings: rendered.headings,
    slug: collection,
    site,
    pageType,
  });
}

function findRedirectTarget(path: string, data: SiteData): string | undefined {
  const bp = data.siteConfig.basePath;
  const stripped = path.replace(/^\//, "");

  for (const { from, to } of data.redirects.redirects) {
    if (from.replace(/^\//, "") === stripped) {
      return to.startsWith("/") ? `${bp}${to}` : to;
    }
  }
  for (const { id, target } of data.redirects.vanity) {
    if (id.replace(/^\//, "") === stripped) {
      return target.startsWith("/") ? `${bp}${target}` : target;
    }
  }
  return undefined;
}
