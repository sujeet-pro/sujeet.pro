import type { ListingLayoutProps } from "../schemas/layout-props";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Html } from "./components/Html";
import { TOC } from "./components/TOC";

export { ListingLayoutPropsSchema as propsSchema } from "../schemas/layout-props";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
}

export default function Listing(props: ListingLayoutProps) {
  const { content, frontmatter, headings, slug, site, pageType } = props;

  const series = pageType?.series || [];
  const unsorted = pageType?.unsorted || [];
  const hasSeries = series.length > 0;

  const totalItems = series.reduce((sum, s) => sum + s.articles.length, 0) + unsorted.length;

  // Build TOC headings from page content headings + series section headings
  const contentHeadings = headings.filter((h) => h.depth >= 2 && h.depth <= 3);
  const seriesHeadings = series.map((s) => ({
    depth: 2,
    text: s.displayName,
    slug: slugify(s.slug),
  }));
  const tocHeadings = [
    ...contentHeadings,
    ...seriesHeadings,
    ...(unsorted.length > 0 ? [{ depth: 2, text: "Other", slug: "other" }] : []),
  ];

  if (!hasSeries) {
    return (
      <Html
        title={`${frontmatter.title} — ${site.title}`}
        description={frontmatter.description}
        url={`${slug}/`}
        site={site}
      >
        <Header site={site} slug={slug} />
        <main class="main-content main-narrow">
          <h1>{frontmatter.title}</h1>
          {totalItems > 0 ? (
            <p class="listing-stats">
              {totalItems} {pageType?.displayName?.toLowerCase() || "items"}
            </p>
          ) : null}
          {content ? <div class="intro prose" innerHTML={content} /> : null}
          {unsorted.length > 0 ? (
            <ul class="article-list">
              {unsorted.map((a) => (
                <li class="article-card">
                  <a href={a.url} class="article-card-link">
                    <span class="article-card-title">{a.title}</span>
                    {a.description ? <span class="article-card-desc">{a.description}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <Footer site={site} />
        </main>
      </Html>
    );
  }

  return (
    <Html
      title={`${frontmatter.title} — ${site.title}`}
      description={frontmatter.description}
      url={`${slug}/`}
      site={site}
    >
      <Header site={site} slug={slug} />
      <div class="layout-two-col">
        <main class="main-content">
          {tocHeadings.length > 0 ? (
            <details class="toc-mobile">
              <summary>On this page</summary>
              <TOC headings={tocHeadings} />
            </details>
          ) : null}
          <h1>{frontmatter.title}</h1>
          <p class="listing-stats">
            {totalItems} {pageType?.displayName?.toLowerCase() || "items"} across {series.length}{" "}
            {series.length === 1 ? "topic" : "topics"}
          </p>
          {content ? <div class="intro prose" innerHTML={content} /> : null}
          <div class="category-listing">
            {series.map((s) => (
              <section class="category-section">
                <h2 id={slugify(s.slug)}>{s.displayName}</h2>
                {s.description ? <p class="series-desc">{s.description}</p> : null}
                <ul class="article-list">
                  {s.articles.map((a) => (
                    <li class="article-card">
                      <a href={a.url} class="article-card-link">
                        <span class="article-card-title">{a.title}</span>
                        {a.description ? (
                          <span class="article-card-desc">{a.description}</span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {unsorted.length > 0 ? (
              <section class="category-section">
                <h2 id="other">Other</h2>
                <ul class="article-list">
                  {unsorted.map((a) => (
                    <li class="article-card">
                      <a href={a.url} class="article-card-link">
                        <span class="article-card-title">{a.title}</span>
                        {a.description ? (
                          <span class="article-card-desc">{a.description}</span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          <Footer site={site} pageType={pageType} />
        </main>
        <aside class="sidebar sidebar-right">
          <TOC headings={tocHeadings} />
        </aside>
      </div>
    </Html>
  );
}
