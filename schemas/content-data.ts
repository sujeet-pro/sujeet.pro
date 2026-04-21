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

export const TagDefinitionSchema = z
  .object({
    /** Canonical display name shown in listings, cards, and meta. */
    displayName: z.string().min(1),
    /** Optional short variant used by sidebar/breadcrumb chrome. */
    shortName: z.string().min(1).optional(),
    /** One-line description (reserved for a future tag landing page). */
    description: z.string().min(1).optional(),
    /**
     * Lowercase aliases that should normalise to this tag. Aliases match
     * after lowercasing and stripping common separators, so `JS`, `js`,
     * `JavaScript`, `ecmascript`, `es6`, and `es2015` can all collapse to
     * the canonical `javascript` slug below.
     */
    aliases: z.array(z.string().min(1)).default([]),
  })
  .strict();

/**
 * Repo-wide tag taxonomy. Keys are canonical slugs (kebab-case). Each entry
 * declares a display name and the aliases that should collapse to it. The
 * loader builds an alias→slug map at runtime, normalises every entry's tag
 * list, and renders the canonical display name in cards and content meta.
 */
export const TagsConfigSchema = z.record(z.string().min(1), TagDefinitionSchema);

export type FooterLink = z.infer<typeof FooterLinkSchema>;
export type FooterLinkGroup = z.infer<typeof FooterLinkGroupSchema>;
export type HomeData = z.infer<typeof HomeDataSchema>;
export type RedirectConfig = z.infer<typeof RedirectConfigSchema>;
export type RootMeta = z.infer<typeof RootMetaSchema>;
export type SectionMeta = z.infer<typeof SectionMetaSchema>;
export type SeriesDefinition = z.infer<typeof SeriesDefinitionSchema>;
export type TagDefinition = z.infer<typeof TagDefinitionSchema>;
export type TagsConfig = z.infer<typeof TagsConfigSchema>;
