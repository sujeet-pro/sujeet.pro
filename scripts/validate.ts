import { createContentLayer, withBasePath } from "@pagesmith/site";
import { contentLayerConfig } from "../content.config.ts";
import { loadDiagramkitConfig } from "../lib/diagramkit-config.ts";
import { resolveBasePath } from "../lib/site-config.ts";
import {
  loadHomeData,
  loadRedirectConfig,
  loadSectionEntries,
  loadSectionMeta,
} from "../theme/lib/content.ts";

loadDiagramkitConfig();

const layer = createContentLayer(contentLayerConfig);
const errors: string[] = [];
const markdownCollections = new Set(["homePage", "articleIndex", "blogIndex", "articles", "blogs"]);

for (const collectionName of Object.keys(contentLayerConfig.collections)) {
  try {
    const entries = await layer.getCollection(
      collectionName as keyof typeof contentLayerConfig.collections,
    );
    if (markdownCollections.has(collectionName)) {
      for (const entry of entries) {
        await entry.render();
      }
    }
  } catch (error) {
    errors.push(
      `Collection "${collectionName}" failed validation: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const basePath = resolveBasePath();
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

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  "Validation: site config, diagramkit config, content schemas, and cross-file references look good.",
);
