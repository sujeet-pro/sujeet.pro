import type { ContentEntry } from "@pagesmith/core";
import type {
  ArticleListItem,
  MetaConfig,
  PageTypeData,
  SeriesData,
  SeriesNav,
} from "#schemas/index";

function entryToListItem(
  entry: ContentEntry,
  collection: string,
  basePath: string,
): ArticleListItem {
  return {
    title: entry.data.title ?? entry.slug,
    description: entry.data.description,
    url: `${basePath}/${collection}/${entry.slug}`,
  };
}

export function buildSeriesData(
  metaConfig: MetaConfig,
  articles: ContentEntry[],
  basePath: string,
): SeriesData[] {
  const articleMap = new Map(articles.map((a) => [a.slug, a]));

  return metaConfig.series.map((def) => ({
    slug: def.slug,
    displayName: def.displayName,
    shortName: def.shortName,
    description: def.description,
    articles: def.articles
      .map((slug) => {
        const entry = articleMap.get(slug);
        if (!entry || entry.data.draft) return undefined;
        return entryToListItem(entry, "articles", basePath);
      })
      .filter((a): a is ArticleListItem => a !== undefined),
  }));
}

export function findSeriesNav(
  seriesData: SeriesData[],
  slug: string,
  basePath: string,
): SeriesNav | undefined {
  for (const series of seriesData) {
    const idx = series.articles.findIndex((a) => a.url === `${basePath}/articles/${slug}`);
    if (idx === -1) continue;

    return {
      series: {
        slug: series.slug,
        displayName: series.displayName,
        shortName: series.shortName,
        description: series.description,
      },
      articles: series.articles,
      prev: idx > 0 ? series.articles[idx - 1] : undefined,
      next: idx < series.articles.length - 1 ? series.articles[idx + 1] : undefined,
    };
  }
  return undefined;
}

export function buildPageTypeData(
  metaConfig: MetaConfig,
  seriesData: SeriesData[],
  entries: ContentEntry[],
  collection: string,
  basePath: string,
): PageTypeData {
  const inSeries = new Set(
    seriesData.flatMap((s) => s.articles.map((a) => a.url.split("/").pop()!)),
  );

  const unsorted = entries
    .filter((e) => !inSeries.has(e.slug) && !e.data.draft)
    .map((e) => entryToListItem(e, collection, basePath));

  return {
    displayName: metaConfig.displayName,
    series: seriesData,
    unsorted,
  };
}
