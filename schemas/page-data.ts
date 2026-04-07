export type ArticleListItem = {
  title: string;
  description?: string;
  url: string;
};

export type SeriesInfo = {
  slug: string;
  displayName: string;
  shortName?: string;
  description?: string;
};

export type SeriesData = SeriesInfo & {
  articles: ArticleListItem[];
};

export type SeriesNav = {
  series: SeriesInfo;
  articles: ArticleListItem[];
  prev?: ArticleListItem;
  next?: ArticleListItem;
};

export type PageTypeData = {
  displayName: string;
  series: SeriesData[];
  unsorted: ArticleListItem[];
};

export type TagEntries = {
  entries: Record<string, ArticleListItem[]>;
};

export type TagIndex = Map<string, TagEntries>;
