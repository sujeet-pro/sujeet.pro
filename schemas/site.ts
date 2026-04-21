import { z } from "@pagesmith/site";

const BasePathSchema = z
  .string()
  .refine(
    (value) => value === "" || value === "/" || value.startsWith("/"),
    "basePath must be empty or start with '/'",
  );

function defaultObject<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
): z.ZodPipe<z.ZodTransform<{}, unknown>, TSchema> {
  return z.preprocess((value) => value ?? {}, schema);
}

export const SiteConfigSchema = z
  .object({
    name: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    origin: z.string().url(),
    language: z.string().min(2).default("en-US"),
    basePath: BasePathSchema.default(""),
    homeLink: z.string().min(1).optional(),
    trailingSlash: z.boolean().default(false),
    contentDir: z.string().min(1).default("./content"),
    outDir: z.string().min(1).default("./dist"),
    publicDir: z.string().min(1).default("./public"),
    theme: defaultObject(
      z
        .object({
          lightColor: z.string().min(1).default("#f8fafc"),
          darkColor: z.string().min(1).default("#020617"),
          defaultColorScheme: z.enum(["auto", "light", "dark"]).default("auto"),
          defaultTheme: z.enum(["paper", "high-contrast"]).default("paper"),
        })
        .strict(),
    ),
    analytics: defaultObject(
      z
        .object({
          googleAnalytics: z.string().min(1).optional(),
        })
        .strict(),
    ),
    seo: defaultObject(
      z
        .object({
          locale: z.string().min(2).default("en_US"),
          twitterHandle: z.string().min(1).optional(),
          defaultOgType: z.string().min(1).default("website"),
        })
        .strict(),
    ),
    socialImage: z.string().min(1).optional(),
    favicon: z.union([z.string().min(1), z.literal(false)]).optional(),
    faviconFallback: z.union([z.string().min(1), z.literal(false)]).optional(),
    appleTouchIcon: z.union([z.string().min(1), z.literal(false)]).optional(),
    maintainer: z
      .object({
        name: z.string().min(1),
        link: z.string().url().optional(),
      })
      .strict()
      .optional(),
    copyright: z
      .object({
        projectName: z.string().min(1),
        startYear: z.number().int().min(2000),
        endYear: z.number().int().min(2000).nullable().optional(),
      })
      .strict()
      .optional(),
    sidebar: defaultObject(
      z
        .object({
          collapsible: z.boolean().default(true),
        })
        .strict(),
    ),
    search: defaultObject(
      z
        .object({
          enabled: z.boolean().default(true),
          showImages: z.boolean().default(false),
          showSubResults: z.boolean().default(true),
        })
        .strict(),
    ),
    editLink: z
      .object({
        repo: z.string().url(),
        branch: z.string().min(1),
        label: z.string().min(1).default("Edit this page"),
      })
      .strict()
      .optional(),
    lastUpdated: z.boolean().default(true),
    server: defaultObject(
      z
        .object({
          devPort: z.number().int().positive().default(3000),
          previewPort: z.number().int().positive().default(4000),
        })
        .strict(),
    ),
  })
  .strict();

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
