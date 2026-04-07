import { describe, it, expect } from "vitest";

describe("tag index building", () => {
  it("groups entries by tag", () => {
    const entries = [
      { slug: "a", data: { title: "A", tags: ["react", "typescript"] }, collection: "articles" },
      { slug: "b", data: { title: "B", tags: ["react"] }, collection: "articles" },
      { slug: "c", data: { title: "C", tags: ["typescript"] }, collection: "blogs" },
    ];

    const tagIndex = new Map<string, { entries: Record<string, any[]> }>();

    for (const entry of entries) {
      const tags = (entry.data.tags as string[]) || [];
      for (const tag of tags) {
        if (!tagIndex.has(tag)) {
          tagIndex.set(tag, { entries: {} });
        }
        const tagData = tagIndex.get(tag)!;
        if (!tagData.entries[entry.collection]) {
          tagData.entries[entry.collection] = [];
        }
        tagData.entries[entry.collection].push({
          title: entry.data.title,
          url: `/${entry.collection}/${entry.slug}`,
        });
      }
    }

    expect(tagIndex.size).toBe(2);
    expect(tagIndex.get("react")!.entries.articles).toHaveLength(2);
    expect(tagIndex.get("typescript")!.entries.articles).toHaveLength(1);
    expect(tagIndex.get("typescript")!.entries.blogs).toHaveLength(1);
  });

  it("handles entries with no tags", () => {
    const entries = [{ slug: "a", data: { title: "A", tags: [] }, collection: "articles" }];

    const tagIndex = new Map<string, { entries: Record<string, any[]> }>();
    for (const entry of entries) {
      for (const tag of (entry.data.tags as string[]) || []) {
        if (!tagIndex.has(tag)) tagIndex.set(tag, { entries: {} });
      }
    }

    expect(tagIndex.size).toBe(0);
  });
});
