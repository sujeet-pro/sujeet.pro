import { createContentLayer, type ContentEntry, type ContentLayer } from "@pagesmith/core";
import config from "../pagesmith.config";

export function createSiteContentLayer(): ContentLayer {
  return createContentLayer(config);
}

export type SiteContent = {
  articles: ContentEntry[];
  blogs: ContentEntry[];
  projects: ContentEntry[];
  pages: ContentEntry[];
};

export async function loadAllContent(layer: ContentLayer): Promise<SiteContent> {
  const [articles, blogs, projects, pages] = await Promise.all([
    layer.getCollection("articles"),
    layer.getCollection("blogs"),
    layer.getCollection("projects"),
    layer.getCollection("pages"),
  ]);
  return { articles, blogs, projects, pages };
}
