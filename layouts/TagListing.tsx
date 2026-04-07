import type { TagListingLayoutProps } from "../schemas/layout-props";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Html } from "./components/Html";

export { TagListingLayoutPropsSchema as propsSchema } from "../schemas/layout-props";

/** Capitalize first letter of a content type name for section headings. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function TagListing(props: TagListingLayoutProps) {
  const { frontmatter, slug, site, allTags } = props;
  const tag = slug.split("/").pop() || "";
  const tagData = allTags?.get(tag);

  const total = tagData
    ? Object.values(tagData.entries).reduce((sum, arr) => sum + arr.length, 0)
    : 0;

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
          <a href={`${site.basePath}/tags`} class="article-back">
            All Tags
          </a>
          <h1>Tag: {tag}</h1>
          <p class="article-lead">{total} items</p>
        </header>
        {tagData
          ? Object.entries(tagData.entries).map(([type, items]) =>
              items.length ? (
                <section>
                  <h2>
                    {capitalize(type)} ({items.length})
                  </h2>
                  <ul class="article-list">
                    {items.map((a) => (
                      <li class="article-card">
                        <a href={a.url} class="article-card-link">
                          <span class="article-card-title">{a.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )
          : null}
        <Footer site={site} />
      </main>
    </Html>
  );
}
