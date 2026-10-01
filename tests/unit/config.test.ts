import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadProfileContentModel } from "@pagesmith/presets/profile";
import { describe, expect, it } from "vitest";
import { loadSiteConfig } from "../../lib/site-config";

describe("project config files", () => {
  const root = process.cwd();
  const contentDir = join(root, "content");

  it("writes the site config and home metadata files", () => {
    expect(existsSync(join(root, "pagesmith.config.json5"))).toBe(true);
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

    expect(siteConfig.basePath).toBe("");
    expect(siteConfig.search.enabled).toBe(true);
    expect(siteConfig.server.devPort).toBe(3000);
    expect(siteConfig.server.previewPort).toBe(4000);
  });

  it("registers content and data through the profile preset model", async () => {
    const model = await loadProfileContentModel({
      siteConfig: {},
      contentDir: "content",
      dataDir: "content",
    });

    expect(model.index.getSection("articles").length).toBeGreaterThan(100);
    expect(model.index.getSection("blogs").length).toBe(2);
    expect(model.data.meta.headerLinks).toBeDefined();
  }, 30_000);
});
