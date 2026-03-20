import type { TagIndexLayoutProps, } from '../schemas/layout-props'
import { Fragment, h, } from '../src/jsx-runtime'
import { Footer, } from './components/Footer'
import { Header, } from './components/Header'
import { Html, } from './components/Html'

export { TagIndexLayoutPropsSchema as propsSchema, } from '../schemas/layout-props'

export default function TagIndex(props: TagIndexLayoutProps,) {
  const { frontmatter, slug, site, allTags, } = props
  const tags = allTags ? [...allTags.entries(),] : []

  tags.sort((a, b,) => {
    const countA = a[1].articles.length + a[1].blogs.length + a[1].projects.length
    const countB = b[1].articles.length + b[1].blogs.length + b[1].projects.length
    return countB - countA
  },)

  return (
    <Html
      title={`${frontmatter.title} — ${site.title}`}
      description={frontmatter.description}
      url="/tags/"
      site={site}
    >
      <Header site={site} slug={slug} />
      <main class="main-content main-narrow">
        <h1>{frontmatter.title}</h1>
        <p>{tags.length} tags across all content</p>
        <ul class="tag-cloud">
          {tags.map(([tag, data,],) => {
            const count = data.articles.length + data.blogs.length + data.projects.length
            return (
              <li class="tag-item">
                <a href={`/tags/${tag}`} class="tag-link">
                  {tag}
                  <span class="tag-count">{count}</span>
                </a>
              </li>
            )
          },)}
        </ul>
        <Footer site={site} />
      </main>
    </Html>
  )
}
