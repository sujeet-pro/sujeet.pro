import { describe, expect, it } from "vitest";
import { loadDiagramkitConfig } from "../../lib/diagramkit-config";
import { loadSiteConfig } from "../../lib/site-config";
import { loadProfileContentModel } from "@pagesmith/presets/profile";

describe("site schemas", () => {
  it("loads the site config with search and theme defaults", () => {
    const config = loadSiteConfig();
    expect(config.search.enabled).toBe(true);
    expect(config.theme.defaultColorScheme).toBe("auto");
    expect(config.theme.defaultTheme).toBe("paper");
  });

  it("keeps articles and blogs as the primary nav sections", async () => {
    const model = await loadProfileContentModel({
      siteConfig: {},
      contentDir: "content",
      dataDir: "content",
    });
    const meta = model.data.meta;
    expect(meta.headerLinks).toEqual([
      { path: "/articles", label: "Articles" },
      { path: "/blogs", label: "Blogs" },
    ]);
    expect((meta.footerLinks as Array<{ header: string }>).map((group) => group.header)).toEqual([
      "Content",
      "Profiles",
    ]);
  }, 30_000);

  it("validates the local diagramkit config", () => {
    const config = loadDiagramkitConfig();
    expect(config.sameFolder).toBe(true);
    expect(config.useManifest).toBe(true);
    expect(config.defaultFormats).toEqual(["svg"]);
    expect(config.defaultTheme).toBe("both");
  });
});
