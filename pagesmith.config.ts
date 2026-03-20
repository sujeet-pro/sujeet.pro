import { BaseFrontmatterSchema, SiteConfigSchema, } from './schemas'

export default {
  // Directories
  contentDir: './content',
  layoutsDir: './layouts',
  publicDir: './public',
  outDir: './dist',

  // CSS entry points (LightningCSS)
  css: {
    entries: ['./styles/main.css',],
    minify: true,
  },

  // Runtime JS entry points (Bun.build)
  runtime: {
    entries: ['./runtime/main.ts',],
    target: 'browser' as const,
    minify: true,
  },

  // Site config file
  siteConfig: './content/site.json5',

  // Schemas for validation
  schemas: {
    frontmatter: BaseFrontmatterSchema,
    siteConfig: SiteConfigSchema,
  },

  // Asset output
  assets: {
    dir: 'assets',
    hashLength: 8,
  },
}
