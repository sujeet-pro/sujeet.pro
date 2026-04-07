import { z } from "@pagesmith/core";

const SeriesDefSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  shortName: z.string().optional(),
  description: z.string().optional(),
  articles: z.array(z.string()),
});

export const MetaConfigSchema = z.object({
  displayName: z.string(),
  description: z.string().optional(),
  layout: z.string(),
  itemLayout: z.string(),
  orderBy: z.enum(["manual", "publishedDate"]).default("manual"),
  series: z.array(SeriesDefSchema).default([]),
  items: z.array(z.string()).optional(),
});

export type MetaConfig = z.infer<typeof MetaConfigSchema>;
export type SeriesDef = z.infer<typeof SeriesDefSchema>;
