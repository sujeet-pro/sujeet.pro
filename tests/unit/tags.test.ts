import { resolveBasePath } from "../../lib/site-config";
import { loadProfileContentModel } from "@pagesmith/presets/profile";
import { withBasePath } from "@pagesmith/site";
import { describe, expect, it } from "vitest";

const BASE_PATH = resolveBasePath();
const BLOG_PREFIX = `${BASE_PATH}/blogs/`;

describe("blog listing helpers", () => {
  it("returns blog entries with base-prefixed paths", async () => {
    const model = await loadProfileContentModel({
      siteConfig: {},
      contentDir: "content",
      dataDir: "content",
    });
    const entries = model.index.getSection("blogs");

    expect(entries.length).toBe(2);
    expect(
      entries.every((entry) => withBasePath(BASE_PATH, entry.routePath).startsWith(BLOG_PREFIX)),
    ).toBe(true);
  }, 30_000);

  it("sorts blogs by date and title for stable listing order", async () => {
    const model = await loadProfileContentModel({
      siteConfig: {},
      contentDir: "content",
      dataDir: "content",
    });
    const entries = model.index.getSection("blogs");
    expect(entries.map((entry) => entry.slug)).toEqual(["system-setup", "chrome-developer-setup"]);
  }, 30_000);
});
