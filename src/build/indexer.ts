/**
 * Build indexer.
 *
 * Builds page type data (series + unsorted items) and tag indexes
 * from collected page metadata.
 */

import type {
  PageMeta,
  PageTypeData,
  PageTypeMeta,
  SeriesData,
  SiteConfig,
  TagPageData,
} from '../../schemas'
import type { GlobalIndex, } from '../schemas/build-types'

/** Format a date value to YYYY-MM-DD string. */
export function formatDate(val: unknown,): string | undefined {
  if (!val) return undefined
  if (val instanceof Date) return val.toISOString().slice(0, 10,)
  const s = String(val,)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s,)) return s
  const d = new Date(s,)
  return isNaN(d.getTime(),) ? undefined : d.toISOString().slice(0, 10,)
}

/** Build resolved page type data (series + unsorted items) for a given type. */
export function buildPageTypeData(
  type: string,
  pages: PageMeta[],
  pageTypeMetas: Map<string, PageTypeMeta>,
): PageTypeData {
  const meta = pageTypeMetas.get(type,)
  if (!meta) return { type, displayName: type, series: [], unsorted: [], }

  const typePages = pages.filter(
    (p,) => p.slug.startsWith(`/${type}/`,) && p.slug !== `/${type}`,
  )

  const series: SeriesData[] = []
  const inSeries = new Set<string>()

  if (meta.series) {
    for (const seriesDef of meta.series) {
      const seriesArticles: SeriesData['articles'] = []
      for (const articleSlug of seriesDef.articles) {
        const page = typePages.find((p,) => {
          const parts = p.slug.split('/',)
          return parts[parts.length - 1] === articleSlug
        },)
        if (page) {
          inSeries.add(page.slug,)
          seriesArticles.push({
            slug: articleSlug,
            title: page.frontmatter.title || articleSlug,
            description: page.frontmatter.description || '',
            url: page.slug,
            tags: page.frontmatter.tags || [],
          },)
        }
      }
      series.push({
        slug: seriesDef.slug,
        displayName: seriesDef.displayName,
        shortName: seriesDef.shortName,
        description: seriesDef.description,
        articles: seriesArticles,
      },)
    }
  }

  // Items not in any series
  const unsorted = typePages
    .filter((p,) => !inSeries.has(p.slug,))
    .map((p,) => ({
      slug: p.slug.split('/',).pop()!,
      title: p.frontmatter.title || '',
      description: p.frontmatter.description || '',
      url: p.slug,
      tags: p.frontmatter.tags || [],
    }))

  // For projects with manual items ordering
  if (meta.items && !meta.series) {
    const ordered = meta.items
      .map((slug: string,) => unsorted.find((u,) => u.slug === slug))
      .filter(Boolean,) as typeof unsorted
    const remaining = unsorted.filter(
      (u,) => !meta.items!.includes(u.slug,),
    )
    return {
      type,
      displayName: meta.displayName,
      series: [],
      unsorted: [...ordered, ...remaining,],
    }
  }

  return { type, displayName: meta.displayName, series, unsorted, }
}

/** Collect all tags across pages, grouped by content type. */
export function collectTags(pages: PageMeta[],): Map<string, TagPageData> {
  const tags = new Map<string, TagPageData>()

  for (const page of pages) {
    const pageTags = page.frontmatter.tags as string[] | undefined
    if (!pageTags || !Array.isArray(pageTags,)) continue

    const parts = page.slug.split('/',).filter(Boolean,)
    const pageType = parts[0] || ''
    const entry = {
      slug: parts.pop()!,
      title: page.frontmatter.title || '',
      url: page.slug,
      lastUpdatedOn: formatDate(
        page.frontmatter.lastUpdatedOn || page.frontmatter.lastUpdatedDate,
      ) || '',
    }

    for (const tag of pageTags) {
      const t = tag.toLowerCase().trim()
      if (!tags.has(t,)) {
        tags.set(t, { tag: t, articles: [], blogs: [], projects: [], },)
      }
      const tagData = tags.get(t,)!
      if (pageType === 'articles') tagData.articles.push(entry,)
      else if (pageType === 'blogs') tagData.blogs.push(entry,)
      else if (pageType === 'projects') tagData.projects.push(entry,)
    }
  }

  // Sort entries within each tag by lastUpdatedOn descending
  for (const tagData of tags.values()) {
    const sortDesc = (a: any, b: any,) =>
      (b.lastUpdatedOn || '').localeCompare(a.lastUpdatedOn || '',)
    tagData.articles.sort(sortDesc,)
    tagData.blogs.sort(sortDesc,)
    tagData.projects.sort(sortDesc,)
  }

  return tags
}

/** Build the full global index from config, pages, and page type metas. */
export function buildGlobalIndex(
  config: SiteConfig,
  pages: PageMeta[],
  pageTypeMetas: Map<string, PageTypeMeta>,
): GlobalIndex {
  const pageTypeData = new Map<string, PageTypeData>()
  for (const type of config.pageTypes) {
    pageTypeData.set(type, buildPageTypeData(type, pages, pageTypeMetas,),)
  }

  const tagIndex = collectTags(pages,)

  return {
    config,
    pageList: pages,
    pageTypeData,
    tagIndex,
    pageTypeMetas,
  }
}
