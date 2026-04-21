import { resolveBasePath } from "../../lib/site-config";
import {
  getArticleListing,
  getFeaturedArticles,
  getFeaturedSeries,
  getSiteStats,
} from "../../theme/lib/content";
import { describe, expect, it } from "vitest";

const BASE_PATH = resolveBasePath();

describe("article listing helpers", () => {
  it("groups articles by configured series order", () => {
    const listing = getArticleListing(BASE_PATH);
    const series = listing.series.find((entry) => entry.slug === "critical-rendering-path");

    expect(series).toBeDefined();
    expect(series?.articles[0]?.slug).toBe("crp-rendering-pipeline-overview");
    expect(series?.articles.at(-1)?.slug).toBe("crp-draw");
  });

  it("resolves featured articles and series from home config slugs", () => {
    const featuredArticles = getFeaturedArticles(BASE_PATH, [
      "design-uber-ride-hailing",
      "v8-engine-architecture",
    ]);
    const featuredSeries = getFeaturedSeries(BASE_PATH, [
      "system-design-scenarios",
      "critical-rendering-path",
    ]);

    expect(featuredArticles.map((entry) => entry.slug)).toEqual([
      "design-uber-ride-hailing",
      "v8-engine-architecture",
    ]);
    expect(featuredSeries.map((entry) => entry.slug)).toEqual([
      "system-design-scenarios",
      "critical-rendering-path",
    ]);
  });

  it("reports article and blog counts for the home page", () => {
    const stats = getSiteStats();

    expect(stats.articleCount).toBeGreaterThan(100);
    expect(stats.blogCount).toBe(2);
    expect(stats.seriesCount).toBeGreaterThan(0);
  });
});
