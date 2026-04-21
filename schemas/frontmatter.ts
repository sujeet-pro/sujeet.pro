import { BaseFrontmatterSchema, z } from "@pagesmith/site";

/**
 * Title field semantics for entries (articles + blogs):
 *
 * - `title`        — required canonical title; the H1 in the markdown body
 *                     remains the visible page title and the universal fallback
 *                     for the optional title fields below.
 * - `seoTitle`     — used in `<title>`, OpenGraph, and Twitter card metadata
 *                     when the SEO title should differ from the body title
 *                     (for example, longer or keyword-rich variants).
 * - `cardTitle`    — used by listing-page cards and homepage rails when a
 *                     punchier title reads better in dense layouts.
 * - `linkTitle`    — used in the sidebar, breadcrumb trail, and prev/next
 *                     navigation. Prefer a short form (for example
 *                     "CRP: Commit" instead of "Critical Rendering Path:
 *                     Commit") so navigation chrome stays scannable.
 *
 * All three optional fields fall back to `title` whenever they are missing.
 */
export const EntryFrontmatterSchema = BaseFrontmatterSchema.extend({
  seoTitle: z.string().min(1).optional(),
  cardTitle: z.string().min(1).optional(),
  linkTitle: z.string().min(1).optional(),
}).strict();

export const ArticleFrontmatterSchema = EntryFrontmatterSchema;

export const BlogFrontmatterSchema = EntryFrontmatterSchema;

export const ListingFrontmatterSchema = z
  .object({
    title: z.string().min(1),
    seoTitle: z.string().min(1).optional(),
    description: z.string().min(1),
    tags: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const HomeFrontmatterSchema = z
  .object({
    title: z.string().min(1),
    seoTitle: z.string().min(1).optional(),
    description: z.string().min(1),
    layout: z.literal("Home").optional(),
  })
  .strict();

export type ArticleFrontmatter = z.infer<typeof ArticleFrontmatterSchema>;
export type BlogFrontmatter = z.infer<typeof BlogFrontmatterSchema>;
export type ListingFrontmatter = z.infer<typeof ListingFrontmatterSchema>;
export type HomeFrontmatter = z.infer<typeof HomeFrontmatterSchema>;
