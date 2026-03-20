import type { PageMeta, PageTypeData, PageTypeMeta, SiteConfig, TagPageData, } from '../../schemas'
import type { Heading, } from './heading'

export type PageTask = {
  slug: string
  filePath: string
  contentType: string
  layoutName: string
}

export type GlobalIndex = {
  config: SiteConfig
  pageList: PageMeta[]
  pageTypeData: Map<string, PageTypeData>
  tagIndex: Map<string, TagPageData>
  pageTypeMetas: Map<string, PageTypeMeta>
}

export type ProcessedPage = {
  slug: string
  html: string
  headings: Heading[]
  frontmatter: Record<string, any>
  layoutName: string
}

export type BuildOptions = {
  outDir?: string
  contentDir?: string
  layoutsDir?: string
  stylesDir?: string
  publicDir?: string
  /** Use a worker pool for parallel page rendering. Defaults to false. */
  parallel?: boolean
}
