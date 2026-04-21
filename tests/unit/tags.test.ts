import { resolveBasePath } from "../../lib/site-config";
import { getBlogListing } from "../../theme/lib/content";
import { describe, expect, it } from "vitest";

const BASE_PATH = resolveBasePath();
const BLOG_PREFIX = `${BASE_PATH}/blogs/`;

describe("blog listing helpers", () => {
  it("returns blog entries with base-prefixed paths", () => {
    const { entries } = getBlogListing(BASE_PATH);

    expect(entries.length).toBe(2);
    expect(entries.every((entry) => entry.path.startsWith(BLOG_PREFIX))).toBe(true);
  });

  it("sorts blogs by date and title for stable listing order", () => {
    const { entries } = getBlogListing(BASE_PATH);
    expect(entries.map((entry) => entry.slug)).toEqual(["system-setup", "chrome-developer-setup"]);
  });
});
