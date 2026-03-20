import { z, } from 'zod'

// ── Base frontmatter (required for all content items) ──

export const BaseFrontmatterSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    publishedDate: z.coerce.date(),
    lastUpdatedOn: z.coerce.date(),
    tags: z.array(z.string(),).min(1,),
    draft: z.boolean().optional().default(false,),
  },)
  .passthrough()

export type BaseFrontmatter = z.infer<typeof BaseFrontmatterSchema>

// ── Project frontmatter (extends base with project-specific fields) ──

export const ProjectFrontmatterSchema = BaseFrontmatterSchema.extend({
  gitRepo: z.string().url().optional(),
  links: z
    .array(
      z.object({
        url: z.string().url(),
        text: z.string(),
      },),
    )
    .optional(),
},)

export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>
