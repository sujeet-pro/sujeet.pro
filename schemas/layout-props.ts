import { z, } from 'zod'
import { HeadingSchema, } from '../src/schemas/heading'
import { SiteConfigSchema, } from './config'
import {
  ArticleSummarySchema,
  PageMetaSchema,
  PageTypeDataSchema,
  SeriesDataSchema,
  SeriesNavSchema,
  TagPageDataSchema,
} from './page-data'

// ── Base layout props (shared by all layouts) ──

export const BaseLayoutPropsSchema = z.object({
  content: z.string(),
  frontmatter: z.record(z.string(), z.any(),),
  headings: z.array(HeadingSchema,),
  slug: z.string(),
  site: SiteConfigSchema,
},)

export type BaseLayoutProps = z.infer<typeof BaseLayoutPropsSchema>

// ── Article layout props ──

export const ArticleLayoutPropsSchema = BaseLayoutPropsSchema.extend({
  pages: z.array(PageMetaSchema,),
  pageType: PageTypeDataSchema.optional(),
  allTags: z.record(z.string(), TagPageDataSchema,).optional(),
  seriesNav: SeriesNavSchema.optional(),
},)

export type ArticleLayoutProps = z.infer<typeof ArticleLayoutPropsSchema>

// ── Blog layout props ──

export const BlogLayoutPropsSchema = BaseLayoutPropsSchema.extend({
  pages: z.array(PageMetaSchema,),
  seriesNav: SeriesNavSchema.optional(),
},)

export type BlogLayoutProps = z.infer<typeof BlogLayoutPropsSchema>

// ── Project layout props ──

export const ProjectLayoutPropsSchema = BaseLayoutPropsSchema.extend({
  pages: z.array(PageMetaSchema,),
  seriesNav: SeriesNavSchema.optional(),
},)

export type ProjectLayoutProps = z.infer<typeof ProjectLayoutPropsSchema>

// ── Home layout props ──

export const HomeLayoutPropsSchema = BaseLayoutPropsSchema.extend({
  featuredArticles: z.array(ArticleSummarySchema,).optional(),
  featuredSeries: z.array(SeriesDataSchema,).optional(),
  stats: z.object({
    totalArticles: z.number(),
    totalSeries: z.number(),
  },).optional(),
},)

export type HomeLayoutProps = z.infer<typeof HomeLayoutPropsSchema>

// ── Page layout props ──

export const PageLayoutPropsSchema = BaseLayoutPropsSchema

export type PageLayoutProps = z.infer<typeof PageLayoutPropsSchema>

// ── Listing layout props ──

export const ListingLayoutPropsSchema = BaseLayoutPropsSchema.extend({
  pageType: PageTypeDataSchema.optional(),
},)

export type ListingLayoutProps = z.infer<typeof ListingLayoutPropsSchema>

// ── Tag index layout props ──

export const TagIndexLayoutPropsSchema = BaseLayoutPropsSchema.extend({
  allTags: z.record(z.string(), TagPageDataSchema,).optional(),
  pages: z.array(PageMetaSchema,).optional(),
},)

export type TagIndexLayoutProps = z.infer<typeof TagIndexLayoutPropsSchema>

// ── Tag listing layout props ──

export const TagListingLayoutPropsSchema = BaseLayoutPropsSchema.extend({
  allTags: z.record(z.string(), TagPageDataSchema,).optional(),
  pages: z.array(PageMetaSchema,).optional(),
},)

export type TagListingLayoutProps = z.infer<typeof TagListingLayoutPropsSchema>
