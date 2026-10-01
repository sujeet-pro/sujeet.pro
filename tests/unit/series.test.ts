import { loadProfileContentModel } from "@pagesmith/presets/profile";
import { describe, expect, it } from "vitest";

describe("article listing helpers", () => {
  it("groups articles by configured series order", async () => {
    const model = await loadProfileContentModel({
      siteConfig: {},
      contentDir: "content",
      dataDir: "content",
    });
    const series = model.series.get("critical-rendering-path");

    expect(series).toBeDefined();
    expect(series?.records[0]?.slug).toBe("crp-rendering-pipeline-overview");
    expect(series?.records.at(-1)?.slug).toBe("crp-draw");
  }, 30_000);

  it("resolves featured articles and series from home config slugs", async () => {
    const model = await loadProfileContentModel({
      siteConfig: {},
      contentDir: "content",
      dataDir: "content",
    });
    const featuredArticles = ["design-uber-ride-hailing", "v8-engine-architecture"].map((slug) =>
      model.index.getEntry(`articles:${slug}`),
    );
    const featuredSeries = ["system-design-scenarios", "critical-rendering-path"].map((slug) =>
      model.series.get(slug),
    );

    expect(featuredArticles.map((entry) => entry?.slug)).toEqual([
      "design-uber-ride-hailing",
      "v8-engine-architecture",
    ]);
    expect(featuredSeries.map((entry) => entry?.slug)).toEqual([
      "system-design-scenarios",
      "critical-rendering-path",
    ]);
  }, 30_000);

  it("reports article and blog counts for the home page", async () => {
    const model = await loadProfileContentModel({
      siteConfig: {},
      contentDir: "content",
      dataDir: "content",
    });

    expect(model.index.getSection("articles").length).toBeGreaterThan(100);
    expect(model.index.getSection("blogs").length).toBe(2);
    expect(model.series.size).toBeGreaterThan(0);
  }, 30_000);
});
