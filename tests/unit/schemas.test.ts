import { describe, it, expect } from "vitest";
import { SiteConfigSchema } from "../../schemas/config";
import { MetaConfigSchema } from "../../schemas/meta";

describe("SiteConfigSchema", () => {
  it("validates a complete site config", () => {
    const config = {
      origin: "https://sujeet.pro",
      name: "Test Site",
      title: "Test Title",
      description: "Test description",
      navItems: [{ path: "/articles", label: "Articles" }],
      footerLinks: [],
      social: {
        twitter: { handle: "@test", url: "https://twitter.com/test" },
        github: { handle: "test", url: "https://github.com/test" },
        linkedin: { handle: "test", url: "https://linkedin.com/in/test" },
      },
      copyright: { holder: "Test", startYear: 2024 },
      home: {
        pageTitle: "Home",
        pageDescription: "Home page",
        profile: { name: "Test", title: "Engineer", bio: "Bio text" },
        profileActions: {},
      },
    };
    const result = SiteConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects config with missing required fields", () => {
    const result = SiteConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("applies defaults for optional fields", () => {
    const config = {
      origin: "https://sujeet.pro",
      name: "Test",
      title: "Test",
      description: "Desc",
      navItems: [],
      footerLinks: [],
      social: {
        twitter: { handle: "@t", url: "https://twitter.com/t" },
        github: { handle: "t", url: "https://github.com/t" },
        linkedin: { handle: "t", url: "https://linkedin.com/in/t" },
      },
      copyright: { holder: "Test", startYear: 2024 },
      home: {
        pageTitle: "Home",
        pageDescription: "Home",
        profile: { name: "Test", title: "Eng", bio: "Bio" },
        profileActions: {},
      },
    };
    const result = SiteConfigSchema.parse(config);
    expect(result.language).toBe("en-US");
    expect(result.baseUrl).toBe("/");
    expect(result.defaultLayout).toBe("Page");
  });
});

describe("MetaConfigSchema", () => {
  it("validates articles meta config", () => {
    const meta = {
      displayName: "Articles",
      layout: "Listing",
      itemLayout: "Article",
      series: [
        {
          slug: "test-series",
          displayName: "Test Series",
          articles: ["article-1", "article-2"],
        },
      ],
    };
    const result = MetaConfigSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  it("validates blogs meta config", () => {
    const meta = {
      displayName: "Blogs",
      layout: "Listing",
      itemLayout: "Blog",
      orderBy: "publishedDate",
      series: [],
    };
    const result = MetaConfigSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });
});
