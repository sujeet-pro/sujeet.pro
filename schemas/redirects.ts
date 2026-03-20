import { z, } from 'zod'

// ── Vanity link (short URL → external target) ──

export const VanityLinkSchema = z.object({
  id: z.string(),
  target: z.string(),
},)

export type VanityLink = z.infer<typeof VanityLinkSchema>

// ── Redirect entry (old path → new path) ──

export const RedirectEntrySchema = z.object({
  from: z.string(),
  to: z.string(),
},)

export type RedirectEntry = z.infer<typeof RedirectEntrySchema>

// ── Full redirects config ──

export const RedirectsConfigSchema = z.object({
  vanity: z.array(VanityLinkSchema,),
  redirects: z.array(RedirectEntrySchema,),
},)

export type RedirectsConfig = z.infer<typeof RedirectsConfigSchema>
