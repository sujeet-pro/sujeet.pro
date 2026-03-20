import type { PageMeta, SiteConfig, TagPageData, } from '../../schemas'

export interface GeneratorContext {
  outDir: string
  config: SiteConfig
  pages: PageMeta[]
  tagIndex: Map<string, TagPageData>
}
