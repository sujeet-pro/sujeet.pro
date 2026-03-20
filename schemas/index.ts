// Frontmatter schemas & types
export {
  type BaseFrontmatter,
  BaseFrontmatterSchema,
  type ProjectFrontmatter,
  ProjectFrontmatterSchema,
} from './frontmatter'

// Config schemas & types
export {
  type ContentTypeDef,
  ContentTypeDefSchema,
  type CssConfig,
  CssConfigSchema,
  type GeneratorsConfig,
  GeneratorsConfigSchema,
  type HomeConfig,
  HomeConfigSchema,
  type MarkdownConfig,
  MarkdownConfigSchema,
  type NavItem,
  NavItemSchema,
  type SingletonPage,
  SingletonPageSchema,
  type SiteConfig,
  SiteConfigSchema,
  type SocialLink,
  SocialLinkSchema,
} from './config'

// Meta schemas & types
export { type PageTypeMeta, PageTypeMetaSchema, type SeriesDef, SeriesDefSchema, } from './meta'

// Page data schemas & types
export {
  type ArticleSummary,
  ArticleSummarySchema,
  type PageMeta,
  PageMetaSchema,
  type PageTypeData,
  PageTypeDataSchema,
  type SeriesData,
  SeriesDataSchema,
  type SeriesNav,
  SeriesNavSchema,
  type TagPageData,
  TagPageDataSchema,
  type TagPageEntry,
  TagPageEntrySchema,
} from './page-data'

// Layout props schemas & types
export {
  type ArticleLayoutProps,
  ArticleLayoutPropsSchema,
  type BaseLayoutProps,
  BaseLayoutPropsSchema,
  type BlogLayoutProps,
  BlogLayoutPropsSchema,
  type HomeLayoutProps,
  HomeLayoutPropsSchema,
  type ListingLayoutProps,
  ListingLayoutPropsSchema,
  type PageLayoutProps,
  PageLayoutPropsSchema,
  type ProjectLayoutProps,
  ProjectLayoutPropsSchema,
  type TagIndexLayoutProps,
  TagIndexLayoutPropsSchema,
  type TagListingLayoutProps,
  TagListingLayoutPropsSchema,
} from './layout-props'

// Redirects schemas & types
export {
  type RedirectEntry,
  RedirectEntrySchema,
  type RedirectsConfig,
  RedirectsConfigSchema,
  type VanityLink,
  VanityLinkSchema,
} from './redirects'
