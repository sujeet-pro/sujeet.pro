import type { ContentEntry } from "@pagesmith/core";
import type { ArticleListItem, TagIndex } from "#schemas/index";

export function buildTagIndex(
  collections: {
    articles: ContentEntry[];
    blogs: ContentEntry[];
    projects: ContentEntry[];
  },
  basePath: string,
): TagIndex {
  const index: TagIndex = new Map();

  function addEntries(entries: ContentEntry[], type: string) {
    for (const entry of entries) {
      const tags: string[] = entry.data.tags ?? [];
      if (entry.data.draft) continue;

      const item: ArticleListItem = {
        title: entry.data.title ?? entry.slug,
        description: entry.data.description,
        url: `${basePath}/${type}/${entry.slug}`,
      };

      for (const tag of tags) {
        let tagEntries = index.get(tag);
        if (!tagEntries) {
          tagEntries = { entries: {} };
          index.set(tag, tagEntries);
        }
        if (!tagEntries.entries[type]) {
          tagEntries.entries[type] = [];
        }
        tagEntries.entries[type].push(item);
      }
    }
  }

  addEntries(collections.articles, "articles");
  addEntries(collections.blogs, "blogs");
  addEntries(collections.projects, "projects");

  return index;
}
