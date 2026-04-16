import { describe, expect, it } from "vitest";
import { loadDiagramkitConfig } from "../../lib/diagramkit-config";
import { loadSiteConfig } from "../../lib/site-config";
import { loadRootMeta } from "../../theme/lib/content";

describe("site schemas", () => {
  it("loads the site config with search and theme defaults", () => {
    const config = loadSiteConfig();
    expect(config.search.enabled).toBe(true);
    expect(config.theme.defaultColorScheme).toBe("auto");
    expect(config.theme.defaultTheme).toBe("paper");
  });

  it("keeps articles and blogs as the primary nav sections", () => {
    const meta = loadRootMeta();
    expect(meta.headerLinks).toEqual([
      { path: "/articles", label: "Articles" },
      { path: "/blogs", label: "Blogs" },
    ]);
    expect(meta.footerLinks.map((group) => group.header)).toEqual(["Content", "Profiles"]);
  });

  it("validates the local diagramkit config", () => {
    const config = loadDiagramkitConfig();
    expect(config.sameFolder).toBe(true);
    expect(config.useManifest).toBe(true);
    expect(config.defaultFormats).toEqual(["svg"]);
    expect(config.defaultTheme).toBe("both");
  });
});
