import type { TagIndexLayoutProps } from "../schemas/layout-props";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Html } from "./components/Html";

export { TagIndexLayoutPropsSchema as propsSchema } from "../schemas/layout-props";

export default function TagIndex(props: TagIndexLayoutProps) {
  const { frontmatter, slug, site, allTags } = props;
  const bp = site.basePath ?? "";
  const tags = allTags ? [...allTags.entries()] : [];

  const entryCount = (data: (typeof tags)[0][1]) =>
    Object.values(data.entries).reduce((sum, arr) => sum + arr.length, 0);

  tags.sort((a, b) => entryCount(b[1]) - entryCount(a[1]));

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
          {tags.map(([tag, data]) => {
            const count = entryCount(data);
            return (
              <li class="tag-item">
                <a href={`${bp}/tags/${tag}`} class="tag-link">
                  {tag}
                  <span class="tag-count">{count}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <Footer site={site} />
      </main>
    </Html>
  );
}
