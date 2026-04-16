import { BaseFrontmatterSchema, z } from "@pagesmith/site";

export const EntryFrontmatterSchema = BaseFrontmatterSchema.strict();

export const ArticleFrontmatterSchema = EntryFrontmatterSchema;

export const BlogFrontmatterSchema = EntryFrontmatterSchema;

export const ListingFrontmatterSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const HomeFrontmatterSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    layout: z.literal("Home").optional(),
  })
  .strict();

export type ArticleFrontmatter = z.infer<typeof ArticleFrontmatterSchema>;
export type BlogFrontmatter = z.infer<typeof BlogFrontmatterSchema>;
export type ListingFrontmatter = z.infer<typeof ListingFrontmatterSchema>;
export type HomeFrontmatter = z.infer<typeof HomeFrontmatterSchema>;
