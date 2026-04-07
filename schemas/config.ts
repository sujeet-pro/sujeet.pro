import { z } from "@pagesmith/core";

const NavItemSchema = z.object({
  path: z.string(),
  label: z.string(),
});

const SocialAccountSchema = z.object({
  handle: z.string(),
  url: z.string().url(),
});

const ProfileSchema = z.object({
  name: z.string(),
  title: z.string(),
  bio: z.string(),
  imageAlt: z.string().optional(),
});

const ProfileActionsSchema = z.object({
  linkedin: z.string().optional(),
  viewCv: z.string().optional(),
  randomArticle: z.string().optional(),
  allArticles: z.string().optional(),
});

const HomeConfigSchema = z.object({
  pageTitle: z.string(),
  pageDescription: z.string(),
  profile: ProfileSchema,
  profileActions: ProfileActionsSchema,
});

export const SiteConfigSchema = z
  .object({
    origin: z.string().url(),
    name: z.string(),
    title: z.string(),
    description: z.string(),
    language: z.string().default("en-US"),
    basePath: z
      .string()
      .default("/")
      .transform((v) => {
        const trimmed = v.replace(/\/+$/, "");
        return trimmed === "" ? "" : trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
      }),
    defaultLayout: z.string().default("Page"),
    navItems: z.array(NavItemSchema),
    footerLinks: z.array(NavItemSchema),
    social: z.object({
      twitter: SocialAccountSchema,
      github: SocialAccountSchema,
      linkedin: SocialAccountSchema,
    }),
    copyright: z.object({
      holder: z.string(),
      startYear: z.number(),
    }),
    featuredArticles: z.array(z.string()).default([]),
    featuredSeries: z.array(z.string()).default([]),
    pageTypes: z.array(z.string()).default([]),
    analytics: z
      .object({
        googleAnalytics: z.string().optional(),
      })
      .optional(),
    seo: z
      .object({
        locale: z.string().default("en_US"),
        twitterHandle: z.string().optional(),
        defaultOgType: z.string().default("website"),
      })
      .optional(),
    theme: z
      .object({
        lightColor: z.string().default("#f8fafc"),
        darkColor: z.string().default("#020617"),
      })
      .optional(),
    home: HomeConfigSchema,
    markdown: z.any().optional(),
    css: z.any().optional(),
  })
  .passthrough();

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
