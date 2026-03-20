/**
 * Page renderer.
 *
 * Renders a single processed page by resolving its series navigation,
 * calling the layout function, and writing the output HTML file.
 *
 * Also exports `renderPageFromWorker` for use inside Bun Workers,
 * which accepts serialized (plain-object) data and reconstructs
 * Maps before delegating to the same rendering logic.
 */

import { mkdirSync, writeFileSync, } from 'fs'
import { dirname, join, } from 'path'
import type { BaseLayoutProps, } from '../../schemas/layout-props'
import type { GlobalIndex, ProcessedPage, } from '../schemas/build-types'
import { getLayout, } from './layout-loader'
type LayoutProps = BaseLayoutProps & Record<string, any>

/** Render a single page and write it to the output directory. */
export async function renderPage(
  page: ProcessedPage,
  globalIndex: GlobalIndex,
  outDir: string,
  layoutsDir: string,
): Promise<void> {
  const { config, pageList: pages, pageTypeData, pageTypeMetas, tagIndex: allTags, } = globalIndex
  const layout = await getLayout(page.layoutName, layoutsDir,)

  // Find series nav for article pages
  let seriesNav: LayoutProps['seriesNav'] = undefined
  const parts = page.slug.split('/',).filter(Boolean,)
  if (parts.length >= 2) {
    const type = parts[0]
    const articleSlug = parts[parts.length - 1]
    const meta = pageTypeMetas.get(type,)
    if (meta?.series) {
      for (const seriesDef of meta.series) {
        const idx = seriesDef.articles.indexOf(articleSlug,)
        if (idx >= 0) {
          const prevSlug = idx > 0 ? seriesDef.articles[idx - 1] : undefined
          const nextSlug = idx < seriesDef.articles.length - 1
            ? seriesDef.articles[idx + 1]
            : undefined
          const findPage = (s: string,) => pages.find((p,) => p.slug === `/${type}/${s}`)

          // Resolve all articles in this series with titles
          const resolvedArticles = seriesDef.articles.map((s,) => {
            const p = findPage(s,)
            return { slug: s, title: p?.frontmatter.title || s, url: `/${type}/${s}`, }
          },)

          seriesNav = {
            series: seriesDef,
            articles: resolvedArticles,
            prev: prevSlug
              ? {
                slug: prevSlug,
                title: findPage(prevSlug,)?.frontmatter.title || prevSlug,
                url: `/${type}/${prevSlug}`,
              }
              : undefined,
            next: nextSlug
              ? {
                slug: nextSlug,
                title: findPage(nextSlug,)?.frontmatter.title || nextSlug,
                url: `/${type}/${nextSlug}`,
              }
              : undefined,
          }
          break
        }
      }
    }
  }

  // Find the PageTypeData for this page's type
  const pageType = parts.length >= 1 ? pageTypeData.get(parts[0],) : undefined

  // For the home page, resolve featured articles and series
  let featuredArticles: any[] | undefined
  let featuredSeries: any[] | undefined
  let stats: { totalArticles: number; totalSeries: number } | undefined

  if (page.slug === '/') {
    const articlesData = pageTypeData.get('articles',)
    if (articlesData) {
      const allArticles = [
        ...articlesData.series.flatMap((s,) => s.articles),
        ...articlesData.unsorted,
      ]

      const faSlugs = config.featuredArticles || []
      featuredArticles = faSlugs
        .map((slug,) => allArticles.find((a,) => a.slug === slug))
        .filter(Boolean,)

      const fsSlugs = config.featuredSeries || []
      featuredSeries = fsSlugs
        .map((slug,) => articlesData.series.find((s,) => s.slug === slug))
        .filter(Boolean,)

      stats = {
        totalArticles: allArticles.length,
        totalSeries: articlesData.series.length,
      }
    }
  }

  const output = layout({
    content: page.html,
    frontmatter: page.frontmatter,
    headings: page.headings,
    slug: page.slug,
    site: config,
    pages,
    pageType,
    allTags,
    seriesNav,
    featuredArticles,
    featuredSeries,
    stats,
  },)

  const outPath = page.slug === '/'
    ? join(outDir, 'index.html',)
    : join(outDir, page.slug.slice(1,), 'index.html',)

  mkdirSync(dirname(outPath,), { recursive: true, },)
  writeFileSync(outPath, `<!DOCTYPE html>\n${String(output,)}`,)
}

/**
 * Worker-compatible render function.
 *
 * Accepts a serialized GlobalIndex (Maps converted to plain objects
 * by the WorkerPool's serializeGlobalIndex) and reconstructs proper
 * Maps before delegating to renderPage.
 */
export async function renderPageFromWorker(
  page: ProcessedPage,
  serialized: {
    config: GlobalIndex['config']
    pageList: GlobalIndex['pageList']
    pageTypeData: Record<string, any>
    tagIndex: Record<string, any>
    pageTypeMetas: Record<string, any>
  },
  outDir: string,
  layoutsDir: string,
): Promise<void> {
  const globalIndex: GlobalIndex = {
    config: serialized.config,
    pageList: serialized.pageList,
    pageTypeData: new Map(Object.entries(serialized.pageTypeData,),),
    tagIndex: new Map(Object.entries(serialized.tagIndex,),),
    pageTypeMetas: new Map(Object.entries(serialized.pageTypeMetas,),),
  }
  return renderPage(page, globalIndex, outDir, layoutsDir,)
}
