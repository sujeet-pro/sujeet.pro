import { getBlogListing } from "../../theme/lib/content";
import { describe, expect, it } from "vitest";

describe("blog listing helpers", () => {
  it("returns blog entries with base-prefixed paths", () => {
    const { entries } = getBlogListing("/v5.sujeet.pro");

    expect(entries.length).toBe(2);
    expect(entries.every((entry) => entry.path.startsWith("/v5.sujeet.pro/blogs/"))).toBe(true);
  });

  it("sorts blogs by date and title for stable listing order", () => {
    const { entries } = getBlogListing("/v5.sujeet.pro");
    expect(entries.map((entry) => entry.slug)).toEqual(["system-setup", "chrome-developer-setup"]);
  });
});
