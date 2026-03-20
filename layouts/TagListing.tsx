import type { TagListingLayoutProps, } from '../schemas/layout-props'
import { Fragment, h, } from '../src/jsx-runtime'
import { Footer, } from './components/Footer'
import { Header, } from './components/Header'
import { Html, } from './components/Html'

export { TagListingLayoutPropsSchema as propsSchema, } from '../schemas/layout-props'

export default function TagListing(props: TagListingLayoutProps,) {
  const { frontmatter, slug, site, allTags, } = props
  const tag = slug.split('/',).pop() || ''
  const tagData = allTags?.get(tag,)

  const total = tagData
    ? tagData.articles.length + tagData.blogs.length + tagData.projects.length
    : 0

  return (
    <Html
      title={`${frontmatter.title} — ${site.title}`}
      description={frontmatter.description}
      url={`${slug}/`}
      site={site}
    >
      <Header site={site} slug={slug} />
      <main class="main-content main-narrow">
        <header class="article-header">
          <a href="/tags" class="article-back">All Tags</a>
          <h1>Tag: {tag}</h1>
          <p class="article-lead">{total} items</p>
        </header>
        {tagData?.articles.length
          ? (
            <section>
              <h2>Articles ({tagData.articles.length})</h2>
              <ul class="article-list">
                {tagData.articles.map((a,) => (
                  <li class="article-card">
                    <a href={a.url} class="article-card-link">
                      <span class="article-card-title">{a.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )
          : null}
        {tagData?.blogs.length
          ? (
            <section>
              <h2>Blogs ({tagData.blogs.length})</h2>
              <ul class="article-list">
                {tagData.blogs.map((a,) => (
                  <li class="article-card">
                    <a href={a.url} class="article-card-link">
                      <span class="article-card-title">{a.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )
          : null}
        {tagData?.projects.length
          ? (
            <section>
              <h2>Projects ({tagData.projects.length})</h2>
              <ul class="article-list">
                {tagData.projects.map((a,) => (
                  <li class="article-card">
                    <a href={a.url} class="article-card-link">
                      <span class="article-card-title">{a.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )
          : null}
        <Footer site={site} />
      </main>
    </Html>
  )
}
