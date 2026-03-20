import { z, } from 'zod'

// ── Series definition (from meta.json5) ──

export const SeriesDefSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  shortName: z.string(),
  description: z.string().optional(),
  articles: z.array(z.string(),),
},)

export type SeriesDef = z.infer<typeof SeriesDefSchema>

// ── Page type meta (from content/<type>/meta.json5) ──

export const PageTypeMetaSchema = z.object({
  displayName: z.string(),
  description: z.string(),
  layout: z.string(),
  itemLayout: z.string(),
  orderBy: z.enum(['manual', 'publishedDate',],),
  series: z.array(SeriesDefSchema,).optional(),
  items: z.array(z.string(),).optional(),
  frontmatterExtensions: z.record(z.string(), z.any(),).optional(),
},)

export type PageTypeMeta = z.infer<typeof PageTypeMetaSchema>
