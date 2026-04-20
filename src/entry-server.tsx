import { normalizeBasePath, withBasePath } from "@pagesmith/site";
import type { SiteDocumentData } from "@pagesmith/site/components";
import type { SsgRenderConfig } from "@pagesmith/site/vite";
import blogIndex from "virtual:content/blogIndex";
import blogs from "virtual:content/blogs";
import articleIndex from "virtual:content/articleIndex";
import articles from "virtual:content/articles";
import homePage from "virtual:content/homePage";
import { loadSiteConfig } from "../lib/site-config";
import {
  getSiteChrome,
  getArticleContext,
  getBlogContext,
  loadHomeData,
  loadRedirectConfig,
} from "../theme/lib/content";
import Home from "../theme/layouts/Home";
import ArticleListing from "../theme/layouts/ArticleListing";
import ArticlePage from "../theme/layouts/ArticlePage";
import BlogListing from "../theme/layouts/BlogListing";
import BlogPage from "../theme/layouts/BlogPage";
import NotFoundPage from "../theme/layouts/NotFoundPage";

type MarkdownEntry<TFrontmatter> = {
  id: string;
  contentSlug: string;
  html: string;
  headings: Array<{ depth: number; text: string; slug: string }>;
  frontmatter: TFrontmatter;
};

function rewriteReadmeLinks(html: string): string {
  return html.replace(
    /\bhref=(["'])([^"'?#]*?)README\.md([?#][^"']*)?\1/g,
    (_match, quote, prefix, suffix = "") => {
      let base = prefix.length > 0 ? prefix : "./";
      // In flat HTML output (trailingSlash: false), content directories become
      // sibling .html files. ../slug/README.md from crp-commit/README.md targets
      // the sibling crp-paint.html, not ../crp-paint/. Remove one ../ level since
      // the directory-to-file collapse reduces nesting by one.
      if (!siteConfig.trailingSlash && base.startsWith("../")) {
        base = base.slice(3) || "./";
      }
      if (base !== "./" && base.endsWith("/")) {
        base = base.slice(0, -1);
      }
      return `href=${quote}${base}${suffix}${quote}`;
    },
  );
}

function normalizeSectionSlug(contentSlug: string, section: "articles" | "blogs"): string {
  const prefix = `${section}/`;
  return contentSlug.startsWith(prefix) ? contentSlug.slice(prefix.length) : contentSlug;
}

function normalizeMarkdownEntry<TFrontmatter>(
  entry: MarkdownEntry<TFrontmatter>,
  section?: "articles" | "blogs",
): MarkdownEntry<TFrontmatter> {
  return {
    ...entry,
    contentSlug: section ? normalizeSectionSlug(entry.contentSlug, section) : entry.contentSlug,
    html: rewriteReadmeLinks(entry.html),
  };
}

const siteConfig = loadSiteConfig();
const redirectConfig = loadRedirectConfig();
const homeData = loadHomeData();

const articleEntries = (articles as Array<MarkdownEntry<Record<string, unknown>>>).map((entry) =>
  normalizeMarkdownEntry(entry, "articles"),
);
const blogEntries = (blogs as Array<MarkdownEntry<Record<string, unknown>>>).map((entry) =>
  normalizeMarkdownEntry(entry, "blogs"),
);
const homeEntry = normalizeMarkdownEntry(
  (homePage as Array<MarkdownEntry<Record<string, unknown>>>)[0]!,
);
const articleIndexEntry = normalizeMarkdownEntry(
  (articleIndex as Array<MarkdownEntry<Record<string, unknown>>>)[0]!,
);
const blogIndexEntry = normalizeMarkdownEntry(
  (blogIndex as Array<MarkdownEntry<Record<string, unknown>>>)[0]!,
);

const articleBySlug = new Map(articleEntries.map((entry) => [entry.contentSlug, entry]));
const blogBySlug = new Map(blogEntries.map((entry) => [entry.contentSlug, entry]));

function toHtml(node: unknown, includeDoctype: boolean): string {
  const html = String(node);
  return includeDoctype ? `<!DOCTYPE html>${html}` : html;
}

function resolveRoute(url: string, config: SsgRenderConfig): string {
  const [rawPath] = url.split(/[?#]/, 1);
  let path = rawPath || "/";
  const normalizedBase = normalizeBasePath(config.base ?? siteConfig.basePath);

  if (normalizedBase && path.startsWith(normalizedBase)) {
    path = path.slice(normalizedBase.length) || "/";
  }

  if (path !== "/" && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  return path || "/";
}

function buildSite(config: SsgRenderConfig): SiteDocumentData {
  const basePath = normalizeBasePath(config.base ?? siteConfig.basePath);
  const chrome = getSiteChrome(basePath);

  return {
    origin: siteConfig.origin,
    basePath,
    name: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    language: siteConfig.language,
    homeLink: basePath || "/",
    navItems: chrome.navItems,
    footerLinks: chrome.footerLinks,
    maintainer: siteConfig.maintainer,
    copyright: siteConfig.copyright ?? undefined,
    sidebar: siteConfig.sidebar,
    search: {
      ...siteConfig.search,
      enabled: siteConfig.search.enabled && config.searchEnabled,
    },
    seo: siteConfig.seo,
    theme: siteConfig.theme,
    analytics: siteConfig.analytics,
    socialImage: siteConfig.socialImage,
    favicon: siteConfig.favicon,
    faviconFallback: siteConfig.faviconFallback,
    appleTouchIcon: siteConfig.appleTouchIcon,
    trailingSlash: siteConfig.trailingSlash ?? false,
    cssPath: config.cssPath,
    jsPath: config.jsPath,
  };
}

function buildEditUrl(relativePath: string): string | undefined {
  const editLink = siteConfig.editLink;
  if (!editLink) return undefined;
  return `${editLink.repo}/blob/${editLink.branch}/${relativePath}`;
}

function renderRedirectPage(
  site: SiteDocumentData,
  target: string,
  includeDoctype: boolean,
): string {
  const href = withBasePath(site.basePath ?? "", target);
  const html = `<html lang="${site.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0; url=${href}"><title>Redirecting…</title><link rel="canonical" href="${href}"></head><body><p>Redirecting to <a href="${href}">${href}</a>.</p></body></html>`;
  return includeDoctype ? `<!DOCTYPE html>${html}` : html;
}

export function getRoutes(_config: SsgRenderConfig): string[] {
  return [
    "/",
    "/articles",
    "/blogs",
    "/404",
    ...articleEntries.map((entry) => `/articles/${entry.contentSlug}`),
    ...blogEntries.map((entry) => `/blogs/${entry.contentSlug}`),
    ...redirectConfig.redirects.map((entry) => entry.from),
    ...redirectConfig.vanity.map((entry) => `/${entry.id}`),
  ];
}

export function render(url: string, config: SsgRenderConfig): string {
  const site = buildSite(config);
  const route = resolveRoute(url, config);
  const pageSlug =
    route === "/" ? (site.homeLink ?? "/") : withBasePath(site.basePath ?? "", route);
  const includeDoctype = config.isDev;

  if (route === "/") {
    return toHtml(
      <Home
        content={homeEntry?.html ?? ""}
        frontmatter={{ ...homeEntry?.frontmatter, ...homeData }}
        slug={pageSlug}
        site={site}
      />,
      includeDoctype,
    );
  }

  if (route === "/articles") {
    return toHtml(
      <ArticleListing
        content={articleIndexEntry?.html ?? ""}
        frontmatter={articleIndexEntry?.frontmatter ?? {}}
        headings={articleIndexEntry?.headings ?? []}
        slug={pageSlug}
        site={site}
        editUrl={buildEditUrl("content/articles/README.md")}
        editLabel={siteConfig.editLink?.label}
        lastUpdated={
          siteConfig.lastUpdated
            ? (articleIndexEntry?.frontmatter?.lastUpdatedOn as string | undefined)
            : undefined
        }
      />,
      includeDoctype,
    );
  }

  if (route === "/blogs") {
    return toHtml(
      <BlogListing
        content={blogIndexEntry?.html ?? ""}
        frontmatter={blogIndexEntry?.frontmatter ?? {}}
        headings={blogIndexEntry?.headings ?? []}
        slug={pageSlug}
        site={site}
        editUrl={buildEditUrl("content/blogs/README.md")}
        editLabel={siteConfig.editLink?.label}
        lastUpdated={
          siteConfig.lastUpdated
            ? (blogIndexEntry?.frontmatter?.lastUpdatedOn as string | undefined)
            : undefined
        }
      />,
      includeDoctype,
    );
  }

  if (route === "/404.html" || route === "/404") {
    return toHtml(
      <NotFoundPage slug={withBasePath(site.basePath ?? "", "/404")} site={site} />,
      includeDoctype,
    );
  }

  const vanityRedirect = redirectConfig.vanity.find((entry) => `/${entry.id}` === route);
  if (vanityRedirect) {
    return renderRedirectPage(site, vanityRedirect.target, includeDoctype);
  }

  const contentRedirect = redirectConfig.redirects.find((entry) => entry.from === route);
  if (contentRedirect) {
    return renderRedirectPage(site, contentRedirect.to, includeDoctype);
  }

  const articleMatch = route.match(/^\/articles\/(.+)$/);
  if (articleMatch) {
    const article = articleBySlug.get(articleMatch[1]!);
    if (!article) {
      return toHtml(
        <NotFoundPage slug={withBasePath(site.basePath ?? "", "/404")} site={site} />,
        includeDoctype,
      );
    }

    const context = getArticleContext(site.basePath ?? "", article.contentSlug);
    return toHtml(
      <ArticlePage
        content={article.html}
        frontmatter={article.frontmatter}
        headings={article.headings}
        slug={pageSlug}
        site={site}
        sidebarSections={context.sidebarSections}
        breadcrumbs={context.breadcrumbs}
        prev={context.prev}
        next={context.next}
        editUrl={buildEditUrl(`content/articles/${article.contentSlug}/README.md`)}
        editLabel={siteConfig.editLink?.label}
        lastUpdated={
          siteConfig.lastUpdated
            ? (article.frontmatter?.lastUpdatedOn as string | undefined)
            : undefined
        }
      />,
      includeDoctype,
    );
  }

  const blogMatch = route.match(/^\/blogs\/(.+)$/);
  if (blogMatch) {
    const blog = blogBySlug.get(blogMatch[1]!);
    if (!blog) {
      return toHtml(
        <NotFoundPage slug={withBasePath(site.basePath ?? "", "/404")} site={site} />,
        includeDoctype,
      );
    }

    const context = getBlogContext(site.basePath ?? "", blog.contentSlug);
    return toHtml(
      <BlogPage
        content={blog.html}
        frontmatter={blog.frontmatter}
        headings={blog.headings}
        slug={pageSlug}
        site={site}
        sidebarSections={context.sidebarSections}
        breadcrumbs={context.breadcrumbs}
        prev={context.prev}
        next={context.next}
        editUrl={buildEditUrl(`content/blogs/${blog.contentSlug}/README.md`)}
        editLabel={siteConfig.editLink?.label}
        lastUpdated={
          siteConfig.lastUpdated
            ? (blog.frontmatter?.lastUpdatedOn as string | undefined)
            : undefined
        }
      />,
      includeDoctype,
    );
  }

  return toHtml(
    <NotFoundPage slug={withBasePath(site.basePath ?? "", "/404")} site={site} />,
    includeDoctype,
  );
}
