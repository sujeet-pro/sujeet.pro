import { z, } from 'zod'
import { SeriesDefSchema, } from './meta'

// ── Page meta (collected markdown file) ──

export const PageMetaSchema = z.object({
  slug: z.string(),
  filePath: z.string(),
  frontmatter: z.record(z.string(), z.any(),),
},)

export type PageMeta = z.infer<typeof PageMetaSchema>

// ── Article summary (used in series, listings, tags) ──

export const ArticleSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  tags: z.array(z.string(),),
},)

export type ArticleSummary = z.infer<typeof ArticleSummarySchema>

// ── Resolved series data (populated at build time) ──

export const SeriesDataSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  shortName: z.string(),
  description: z.string().optional(),
  articles: z.array(ArticleSummarySchema,),
},)

export type SeriesData = z.infer<typeof SeriesDataSchema>

// ── Page type data (resolved listing data) ──

export const PageTypeDataSchema = z.object({
  type: z.string(),
  displayName: z.string(),
  series: z.array(SeriesDataSchema,),
  unsorted: z.array(ArticleSummarySchema,),
},)

export type PageTypeData = z.infer<typeof PageTypeDataSchema>

// ── Tag page entry ──

export const TagPageEntrySchema = z.object({
  slug: z.string(),
  title: z.string(),
  url: z.string(),
  lastUpdatedOn: z.string(),
},)

export type TagPageEntry = z.infer<typeof TagPageEntrySchema>

// ── Tag page data ──

export const TagPageDataSchema = z.object({
  tag: z.string(),
  articles: z.array(TagPageEntrySchema,),
  blogs: z.array(TagPageEntrySchema,),
  projects: z.array(TagPageEntrySchema,),
},)

export type TagPageData = z.infer<typeof TagPageDataSchema>

// ── Series navigation (prev/next within a series) ──

const SeriesNavArticleSchema = z.object({
  slug: z.string(),
  title: z.string(),
  url: z.string(),
},)

export const SeriesNavSchema = z.object({
  series: SeriesDefSchema,
  articles: z.array(SeriesNavArticleSchema,),
  prev: SeriesNavArticleSchema.optional(),
  next: SeriesNavArticleSchema.optional(),
},)

export type SeriesNav = z.infer<typeof SeriesNavSchema>
