import { z, } from 'zod'

// ── Navigation ──

export const NavItemSchema = z.object({
  path: z.string(),
  label: z.string(),
},)

export type NavItem = z.infer<typeof NavItemSchema>

// ── Social ──

export const SocialLinkSchema = z.object({
  handle: z.string(),
  url: z.string().url(),
},)

export type SocialLink = z.infer<typeof SocialLinkSchema>

// ── Markdown config ──

export const MarkdownConfigSchema = z.object({
  remarkPlugins: z.array(z.any(),).optional(),
  rehypePlugins: z.array(z.any(),).optional(),
  shiki: z
    .object({
      themes: z.object({
        light: z.string(),
        dark: z.string(),
      },),
      langAlias: z.record(z.string(), z.string(),).optional(),
      defaultShowLineNumbers: z.boolean().optional(),
    },)
    .optional(),
},)

export type MarkdownConfig = z.infer<typeof MarkdownConfigSchema>

// ── Content type definition (NEW) ──

export const ContentTypeDefSchema = z.object({
  urlPrefix: z.string(),
  datasource: z.object({
    markdown: z.boolean(),
    json: z.boolean(),
  },),
  orderBy: z.enum(['manual', 'publishedDate',],),
},)

export type ContentTypeDef = z.infer<typeof ContentTypeDefSchema>

// ── Singleton page (NEW) ──

export const SingletonPageSchema = z.object({
  url: z.string(),
  layout: z.string(),
  contentFile: z.string(),
  datasource: z.string().optional(),
},)

export type SingletonPage = z.infer<typeof SingletonPageSchema>

// ── CSS config (NEW) ──

export const CssConfigSchema = z.object({
  entries: z.array(z.string(),),
  minify: z.boolean(),
},)

export type CssConfig = z.infer<typeof CssConfigSchema>

// ── Generators config ──

export const GeneratorsConfigSchema = z.object({
  sitemap: z.boolean().optional(),
  rss: z
    .object({
      enabled: z.boolean(),
      maxItems: z.number().optional(),
    },)
    .optional(),
  agents: z
    .object({
      enabled: z.boolean(),
    },)
    .optional(),
},)

export type GeneratorsConfig = z.infer<typeof GeneratorsConfigSchema>

// ── Home page config ──

export const HomeConfigSchema = z.object({
  pageTitle: z.string(),
  pageDescription: z.string(),
  profile: z.object({
    name: z.string(),
    title: z.string(),
    bio: z.string(),
    imageAlt: z.string(),
  },),
  profileActions: z.record(z.string(), z.string(),),
},)

export type HomeConfig = z.infer<typeof HomeConfigSchema>

// ── Full site config ──

export const SiteConfigSchema = z.object({
  // Site metadata
  origin: z.string(),
  name: z.string(),
  title: z.string(),
  description: z.string(),
  language: z.string(),

  // Build config
  baseUrl: z.string(),
  defaultLayout: z.string(),
  styles: z.array(z.string(),),
  markdown: MarkdownConfigSchema,

  // Navigation
  navItems: z.array(NavItemSchema,),
  footerLinks: z.array(NavItemSchema,),

  // Social & copyright
  social: z.object({
    twitter: SocialLinkSchema,
    github: SocialLinkSchema,
    linkedin: SocialLinkSchema,
  },),
  copyright: z.object({
    holder: z.string(),
    startYear: z.number(),
  },),

  // Featured content
  featuredArticles: z.array(z.string(),),
  featuredSeries: z.array(z.string(),),

  // Page types
  pageTypes: z.array(z.string(),),

  // Home page config
  home: HomeConfigSchema,

  // Analytics
  analytics: z.object({
    googleAnalytics: z.string().optional(),
  },).optional(),

  // SEO
  seo: z.object({
    locale: z.string().optional(),
    twitterHandle: z.string().optional(),
    defaultOgType: z.string().optional(),
  },).optional(),

  // Theme colors
  theme: z.object({
    lightColor: z.string(),
    darkColor: z.string(),
  },).optional(),

  // NEW optional fields for forward compatibility
  contentTypes: z.record(z.string(), ContentTypeDefSchema,).optional(),
  css: CssConfigSchema.optional(),
  pages: z.array(SingletonPageSchema,).optional(),
  generators: GeneratorsConfigSchema.optional(),
},)

export type SiteConfig = z.infer<typeof SiteConfigSchema>
