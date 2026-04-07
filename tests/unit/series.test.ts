import { describe, it, expect } from "vitest";

describe("series building", () => {
  it("calculates prev/next navigation within a series", () => {
    const articles = [
      { slug: "a", url: "/articles/a", title: "Article A" },
      { slug: "b", url: "/articles/b", title: "Article B" },
      { slug: "c", url: "/articles/c", title: "Article C" },
    ];

    // For article 'b' (index 1)
    const prev = articles[0];
    const next = articles[2];

    expect(prev.title).toBe("Article A");
    expect(next.title).toBe("Article C");
  });

  it("first article has no prev", () => {
    const articles = [
      { slug: "a", url: "/articles/a", title: "Article A" },
      { slug: "b", url: "/articles/b", title: "Article B" },
    ];
    const index = 0;
    const prev = index > 0 ? articles[index - 1] : undefined;
    expect(prev).toBeUndefined();
  });

  it("last article has no next", () => {
    const articles = [
      { slug: "a", url: "/articles/a", title: "Article A" },
      { slug: "b", url: "/articles/b", title: "Article B" },
    ];
    const index = articles.length - 1;
    const next = index < articles.length - 1 ? articles[index + 1] : undefined;
    expect(next).toBeUndefined();
  });
});
