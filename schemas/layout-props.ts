import { z, type Heading } from "@pagesmith/core";
import type { SiteConfig } from "./config";
import type { PageTypeData, SeriesNav, TagIndex } from "./page-data";

export type BaseLayoutProps = {
  site: SiteConfig;
};

export type PageLayoutProps = {
  content: string;
  frontmatter: Record<string, any>;
  headings: Heading[];
  slug: string;
  site: SiteConfig;
};

export type ArticleLayoutProps = {
  content: string;
  frontmatter: Record<string, any>;
  headings: Heading[];
  slug: string;
  site: SiteConfig;
  pageType: PageTypeData;
  seriesNav?: SeriesNav;
};

export type BlogLayoutProps = {
  content: string;
  frontmatter: Record<string, any>;
  headings: Heading[];
  slug: string;
  site: SiteConfig;
  seriesNav?: SeriesNav;
};

export type ProjectLayoutProps = BlogLayoutProps;

export type HomeLayoutProps = {
  site: SiteConfig;
  featuredArticles: { title: string; description?: string; url: string }[];
  featuredSeries: {
    slug: string;
    displayName: string;
    description?: string;
    articles: { title: string; url: string }[];
  }[];
  stats: { totalArticles: number; totalSeries: number };
};

export type ListingLayoutProps = {
  content: string;
  frontmatter: Record<string, any>;
  headings: Heading[];
  slug: string;
  site: SiteConfig;
  pageType: PageTypeData;
};

export type TagIndexLayoutProps = {
  frontmatter: Record<string, any>;
  slug: string;
  site: SiteConfig;
  allTags: TagIndex;
};

export type TagListingLayoutProps = TagIndexLayoutProps;

export const BaseLayoutPropsSchema = z.object({
  site: z.any(),
});

export const PageLayoutPropsSchema = z.object({
  content: z.string(),
  frontmatter: z.record(z.string(), z.any()),
  headings: z.array(z.any()),
  slug: z.string(),
  site: z.any(),
});

export const ArticleLayoutPropsSchema = PageLayoutPropsSchema.extend({
  pageType: z.any(),
  seriesNav: z.any().optional(),
});

export const BlogLayoutPropsSchema = PageLayoutPropsSchema.extend({
  seriesNav: z.any().optional(),
});

export const ProjectLayoutPropsSchema = BlogLayoutPropsSchema;

export const HomeLayoutPropsSchema = z.object({
  site: z.any(),
  featuredArticles: z.array(z.any()),
  featuredSeries: z.array(z.any()),
  stats: z.any(),
});

export const ListingLayoutPropsSchema = PageLayoutPropsSchema.extend({
  pageType: z.any(),
});

export const TagIndexLayoutPropsSchema = z.object({
  frontmatter: z.record(z.string(), z.any()),
  slug: z.string(),
  site: z.any(),
  allTags: z.any(),
});

export const TagListingLayoutPropsSchema = TagIndexLayoutPropsSchema;
