import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentLayerConfig } from "../../content.config";
import { loadSiteConfig } from "../../lib/site-config";

describe("project config files", () => {
  const root = process.cwd();
  const contentDir = join(root, "content");

  it("writes the site config and home metadata files", () => {
    expect(existsSync(join(root, "site.config.json5"))).toBe(true);
    expect(existsSync(join(contentDir, "meta.json5"))).toBe(true);
    expect(existsSync(join(contentDir, "home.json5"))).toBe(true);
  });

  it("keeps article and blog section metadata", () => {
    expect(existsSync(join(contentDir, "articles", "meta.json5"))).toBe(true);
    expect(existsSync(join(contentDir, "blogs", "meta.json5"))).toBe(true);
  });

  it("removes the projects section from content", () => {
    expect(existsSync(join(contentDir, "projects", "meta.json5"))).toBe(false);
  });

  it("loads the custom core-native site config", () => {
    const siteConfig = loadSiteConfig();

    expect(siteConfig.basePath).toBe("/v5.sujeet.pro");
    expect(siteConfig.search.enabled).toBe(true);
    expect(siteConfig.server.devPort).toBe(3000);
    expect(siteConfig.server.previewPort).toBe(4000);
  });

  it("registers content and data collections for the site model", () => {
    expect(Object.keys(contentLayerConfig.collections)).toEqual([
      "homePage",
      "articleIndex",
      "blogIndex",
      "articles",
      "blogs",
      "rootMeta",
      "articleMeta",
      "blogMeta",
      "homeData",
      "redirects",
    ]);
  });
});
