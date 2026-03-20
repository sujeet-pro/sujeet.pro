import type { SeriesNav, } from '../../schemas/page-data'
import { Fragment, h, } from '../../src/jsx-runtime'

type Props = {
  seriesNav?: SeriesNav
  currentSlug: string
}

export function ArticleNav({ seriesNav, currentSlug, }: Props,) {
  if (!seriesNav) return <></>

  return (
    <nav class="article-nav" aria-label="Series articles">
      <p class="sidebar-title">{seriesNav.series.shortName || seriesNav.series.displayName}</p>
      <ul class="nav-articles">
        {seriesNav.articles.map((a,) => (
          <li class={a.url === currentSlug ? 'current' : ''}>
            <a href={a.url}>{a.title}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
