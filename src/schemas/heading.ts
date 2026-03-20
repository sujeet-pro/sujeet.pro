import { z, } from 'zod'

// ── Heading (extracted from markdown) ──

export const HeadingSchema = z.object({
  depth: z.number(),
  text: z.string(),
  slug: z.string(),
},)

export type Heading = z.infer<typeof HeadingSchema>
