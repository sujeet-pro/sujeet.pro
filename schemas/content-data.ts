import { z } from "@pagesmith/site";

const LinkPathSchema = z.string().min(1);
const InternalPathSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith("/"), "Internal paths must start with '/'");

export const NavLinkSchema = z
  .object({
    path: LinkPathSchema,
    label: z.string().min(1),
  })
  .strict();

export const FooterLinkSchema = NavLinkSchema;

export const FooterLinkGroupSchema = z
  .object({
    header: z.string().min(1).optional(),
    links: z.array(FooterLinkSchema).default([]),
  })
  .strict();

export const RootMetaSchema = z
  .object({
    displayName: z.string().min(1),
    description: z.string().min(1),
    headerLinks: z.array(NavLinkSchema).default([]),
    footerLinks: z.array(FooterLinkGroupSchema).default([]),
  })
  .strict();

export const SeriesDefinitionSchema = z
  .object({
    slug: z.string().min(1),
    displayName: z.string().min(1),
    shortName: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    articles: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const SectionMetaSchema = z
  .object({
    displayName: z.string().min(1),
    description: z.string().min(1).optional(),
    layout: z.string().min(1).optional(),
    itemLayout: z.string().min(1).optional(),
    orderBy: z.enum(["manual", "publishedDate"]).default("manual"),
    items: z.array(z.string().min(1)).optional(),
    series: z.array(SeriesDefinitionSchema).default([]),
  })
  .strict();

export const HeroActionSchema = z
  .object({
    text: z.string().min(1),
    link: LinkPathSchema,
    theme: z.enum(["alt"]).optional(),
  })
  .strict();

export const HomeDataSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    hero: z
      .object({
        name: z.string().min(1),
        text: z.string().min(1),
        tagline: z.string().min(1),
        actions: z.array(HeroActionSchema).default([]),
      })
      .strict(),
    featuredArticles: z.array(z.string().min(1)).default([]),
    featuredSeries: z.array(z.string().min(1)).default([]),
    socialImage: z.string().min(1).optional(),
  })
  .strict();

export const VanityRedirectSchema = z
  .object({
    id: z.string().min(1),
    target: z.string().url(),
  })
  .strict();

export const ContentRedirectSchema = z
  .object({
    from: InternalPathSchema,
    to: LinkPathSchema,
  })
  .strict();

export const RedirectConfigSchema = z
  .object({
    vanity: z.array(VanityRedirectSchema).default([]),
    redirects: z.array(ContentRedirectSchema).default([]),
  })
  .strict();

export type FooterLink = z.infer<typeof FooterLinkSchema>;
export type FooterLinkGroup = z.infer<typeof FooterLinkGroupSchema>;
export type HomeData = z.infer<typeof HomeDataSchema>;
export type RedirectConfig = z.infer<typeof RedirectConfigSchema>;
export type RootMeta = z.infer<typeof RootMetaSchema>;
export type SectionMeta = z.infer<typeof SectionMetaSchema>;
export type SeriesDefinition = z.infer<typeof SeriesDefinitionSchema>;
