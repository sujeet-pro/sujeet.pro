import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";

describe("config files", () => {
  const contentDir = join(process.cwd(), "content");

  it("site.json5 exists", () => {
    expect(existsSync(join(contentDir, "site.json5"))).toBe(true);
  });

  it("articles meta.json5 exists", () => {
    expect(existsSync(join(contentDir, "articles", "meta.json5"))).toBe(true);
  });

  it("blogs meta.json5 exists", () => {
    expect(existsSync(join(contentDir, "blogs", "meta.json5"))).toBe(true);
  });

  it("projects meta.json5 exists", () => {
    expect(existsSync(join(contentDir, "projects", "meta.json5"))).toBe(true);
  });

  it("redirects.json5 exists", () => {
    expect(existsSync(join(contentDir, "redirects.json5"))).toBe(true);
  });
});
