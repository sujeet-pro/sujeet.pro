import type { ArticleLayoutProps } from "../schemas/layout-props";
import { ArticleNav } from "./components/ArticleNav";
import { ContentMeta } from "./components/ContentMeta";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Html } from "./components/Html";
import { SeriesBlock } from "./components/SeriesBlock";
import { TOC } from "./components/TOC";

export { ArticleLayoutPropsSchema as propsSchema } from "../schemas/layout-props";

export default function Article(props: ArticleLayoutProps) {
  const { content, frontmatter, headings, slug, site, pageType, seriesNav } = props;
  const filteredHeadings = headings.filter((h) => h.depth >= 2 && h.depth <= 3);

  return (
    <Html
      hasLeftSidebar={!!seriesNav}
      title={`${frontmatter.title} — ${site.title}`}
      description={frontmatter.description}
      url={`${slug}/`}
      pageType="article"
      site={site}
    >
      <Header site={site} slug={slug} hasLeftSidebar={!!seriesNav} />
      <div class={seriesNav ? "layout-three-col" : "layout-two-col"}>
        {seriesNav ? (
          <aside class="sidebar sidebar-left">
            <ArticleNav seriesNav={seriesNav} currentSlug={slug} />
          </aside>
        ) : null}
        <div class="main-content">
          <main>
            <article>
              <a href={`${site.basePath}/articles`} class="article-back">
                Articles
              </a>
              <ContentMeta frontmatter={frontmatter} />
              {seriesNav ? <SeriesBlock seriesNav={seriesNav} currentSlug={slug} /> : null}
              {filteredHeadings.length > 0 ? (
                <details class="toc-mobile">
                  <summary>On this page</summary>
                  <TOC headings={headings} />
                </details>
              ) : null}
              <div class="prose" innerHTML={content} />
              {seriesNav ? (
                <nav class="series-nav" aria-label="Series navigation">
                  <div class="series-nav-inner">
                    {seriesNav.prev ? (
                      <a href={seriesNav.prev.url} class="series-nav-prev">
                        <span class="series-nav-label">Previous</span>
                        <span class="series-nav-title">{seriesNav.prev.title}</span>
                      </a>
                    ) : (
                      <span />
                    )}
                    {seriesNav.next ? (
                      <a href={seriesNav.next.url} class="series-nav-next">
                        <span class="series-nav-label">Next</span>
                        <span class="series-nav-title">{seriesNav.next.title}</span>
                      </a>
                    ) : null}
                  </div>
                </nav>
              ) : null}
            </article>
          </main>
          <Footer site={site} pageType={pageType} />
        </div>
        <aside class="sidebar sidebar-right">
          <TOC headings={headings} />
        </aside>
      </div>
    </Html>
  );
}
