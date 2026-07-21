import { withBasePath } from "@pagesmith/site";
import {
  loadHomeData,
  loadRedirectConfig,
  loadSectionEntries,
  loadSectionMeta,
} from "../theme/lib/content.ts";

export type CrossReferenceResult = {
  errors: string[];
  articleCount: number;
  blogCount: number;
};

/**
 * Project-specific cross-reference checks shared by `scripts/validate.ts` and
 * `scripts/validate-pagesmith.ts`. These verify the coordinating JSON5
 * companion files stay in sync with live markdown content:
 *
 *   - `content/articles/meta.json5` series → article slugs
 *   - `content/blogs/meta.json5` series → blog slugs
 *   - `content/home.json5` featured-articles / featured-series references
 *   - `content/redirects.json5` internal targets resolve to real routes
 *
 * Returns the collected error strings plus the live entry counts so callers can
 * render their own success summaries.
 */
export function collectCrossReferenceErrors(basePath: string): CrossReferenceResult {
  const articles = loadSectionEntries("articles", basePath);
  const blogs = loadSectionEntries("blogs", basePath);
  const articleMeta = loadSectionMeta("articles");
  const blogMeta = loadSectionMeta("blogs");
  const homeData = loadHomeData();
  const redirects = loadRedirectConfig();

  const articleSlugs = new Set(articles.map((entry) => entry.slug));
  const blogSlugs = new Set(blogs.map((entry) => entry.slug));
  const articleSeriesSlugs = new Set((articleMeta?.series ?? []).map((series) => series.slug));
  const knownRoutes = new Set<string>([
    withBasePath(basePath, "/"),
    withBasePath(basePath, "/articles"),
    withBasePath(basePath, "/blogs"),
    ...articles.map((entry) => entry.path),
    ...blogs.map((entry) => entry.path),
  ]);

  const errors: string[] = [];

  for (const series of articleMeta?.series ?? []) {
    for (const slug of series.articles) {
      if (!articleSlugs.has(slug)) {
        errors.push(
          `content/articles/meta.json5 references missing article slug "${slug}" in "${series.slug}".`,
        );
      }
    }
  }
  for (const series of blogMeta?.series ?? []) {
    for (const slug of series.articles) {
      if (!blogSlugs.has(slug)) {
        errors.push(
          `content/blogs/meta.json5 references missing blog slug "${slug}" in "${series.slug}".`,
        );
      }
    }
  }
  for (const slug of homeData.featuredArticles) {
    if (!articleSlugs.has(slug)) {
      errors.push(`content/home.json5 references unknown featured article "${slug}".`);
    }
  }
  for (const slug of homeData.featuredSeries) {
    if (!articleSeriesSlugs.has(slug)) {
      errors.push(`content/home.json5 references unknown featured series "${slug}".`);
    }
  }
  for (const redirect of redirects.redirects) {
    if (!redirect.to.startsWith("/")) continue;
    const target = withBasePath(basePath, redirect.to);
    if (!knownRoutes.has(target)) {
      errors.push(`content/redirects.json5 points to unknown internal target "${redirect.to}".`);
    }
  }

  return { errors, articleCount: articles.length, blogCount: blogs.length };
}
