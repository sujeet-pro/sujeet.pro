import { withBasePath } from "@pagesmith/site";
import { loadProfileContentModel } from "@pagesmith/presets/profile";

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
export async function collectCrossReferenceErrors(
  basePath: string,
  projectRoot = process.cwd(),
): Promise<CrossReferenceResult> {
  const model = await loadProfileContentModel(
    {
      siteConfig: { basePath },
      contentDir: "content",
      dataDir: "content",
    },
    projectRoot,
  );
  const articles = model.index.getCollection("articles");
  const blogs = model.index.getCollection("blogs");
  const blogMeta = model.data.sections.get("blogs") ?? {};
  const homeData = model.data.home;
  const redirects = model.data.redirects;

  const articleSlugs = new Set(articles.map((entry) => entry.slug));
  const blogSlugs = new Set(blogs.map((entry) => entry.slug));
  const articleSeries = model.data.series;
  const blogSeries = Array.isArray(blogMeta.series)
    ? blogMeta.series.flatMap((value) => {
        const series = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
        const slug = typeof series.slug === "string" ? series.slug : undefined;
        const entries = Array.isArray(series.articles)
          ? series.articles.filter((entry): entry is string => typeof entry === "string")
          : [];
        return slug ? [{ slug, entries }] : [];
      })
    : [];
  const articleSeriesSlugs = new Set(articleSeries.map((series) => series.slug));
  const knownRoutes = new Set<string>([
    withBasePath(basePath, "/"),
    withBasePath(basePath, "/articles"),
    withBasePath(basePath, "/blogs"),
    ...articles.map((entry) => withBasePath(basePath, entry.routePath)),
    ...blogs.map((entry) => withBasePath(basePath, entry.routePath)),
  ]);

  const errors: string[] = [];

  for (const series of articleSeries) {
    for (const slug of series.entries) {
      if (!articleSlugs.has(slug)) {
        errors.push(
          `content/articles/meta.json5 references missing article slug "${slug}" in "${series.slug}".`,
        );
      }
    }
  }
  for (const series of blogSeries) {
    for (const slug of series.entries) {
      if (!blogSlugs.has(slug)) {
        errors.push(
          `content/blogs/meta.json5 references missing blog slug "${slug}" in "${series.slug}".`,
        );
      }
    }
  }
  const featuredArticles = Array.isArray(homeData.featuredArticles)
    ? homeData.featuredArticles.filter((entry): entry is string => typeof entry === "string")
    : [];
  for (const slug of featuredArticles) {
    if (!articleSlugs.has(slug)) {
      errors.push(`content/home.json5 references unknown featured article "${slug}".`);
    }
  }
  const featuredSeries = Array.isArray(homeData.featuredSeries)
    ? homeData.featuredSeries.filter((entry): entry is string => typeof entry === "string")
    : [];
  for (const slug of featuredSeries) {
    if (!articleSeriesSlugs.has(slug)) {
      errors.push(`content/home.json5 references unknown featured series "${slug}".`);
    }
  }
  for (const redirect of redirects) {
    if (!redirect.to.startsWith("/")) continue;
    const target = withBasePath(basePath, redirect.to);
    if (!knownRoutes.has(target)) {
      errors.push(`content/redirects.json5 points to unknown internal target "${redirect.to}".`);
    }
  }

  return { errors, articleCount: articles.length, blogCount: blogs.length };
}
