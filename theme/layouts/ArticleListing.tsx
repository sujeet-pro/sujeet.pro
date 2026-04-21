import { SiteDocument } from "@pagesmith/site/components";
import type { SiteDocumentData, SiteSidebarSection } from "@pagesmith/site/components";
import { PageShell } from "@pagesmith/site/layouts";
import type { Heading } from "@pagesmith/site/ssg-utils";
import { EntryCardList } from "../components/EntryCardList";
import { getArticleListing } from "../lib/content";

type Props = {
  content: string;
  frontmatter: Record<string, unknown>;
  headings: Heading[];
  slug: string;
  site: SiteDocumentData;
  sidebarSections?: SiteSidebarSection[];
  editUrl?: string;
  editLabel?: string;
  lastUpdated?: string;
};

export default function ArticleListing(props: Props) {
  const {
    content,
    frontmatter,
    headings,
    slug,
    site,
    sidebarSections,
    editUrl,
    editLabel,
    lastUpdated,
  } = props;
  const { series, other, meta } = getArticleListing(site.basePath || "");
  const totalItems =
    series.reduce((count, group) => count + group.articles.length, 0) + other.length;
  // Listing pages prefer `seoTitle` for the document title; the in-page H1
  // is still driven by the markdown body, so authors can keep the visible
  // heading short while exposing a richer SEO title.
  const seoTitle =
    (typeof frontmatter.seoTitle === "string" && frontmatter.seoTitle.trim()
      ? frontmatter.seoTitle
      : undefined) ??
    (typeof frontmatter.title === "string" && frontmatter.title.trim()
      ? frontmatter.title
      : undefined);
  const pageDescription =
    typeof frontmatter.description === "string" && frontmatter.description.trim()
      ? frontmatter.description
      : undefined;
  const tocHeadings: Heading[] = [
    ...headings.filter((heading) => heading.depth >= 2 && heading.depth <= 3),
    ...series.map((group) => ({
      depth: 2,
      text: group.displayName,
      slug: group.slug,
    })),
    ...(other.length > 0 ? [{ depth: 2, text: "Other", slug: "other" }] : []),
  ];

  return (
    <SiteDocument
      title={seoTitle ? `${seoTitle} — ${site.title}` : site.title || site.name}
      description={pageDescription ?? meta?.description ?? site.description}
      url={slug}
      site={site}
    >
      <PageShell
        site={site}
        currentPath={slug}
        headings={tocHeadings}
        sidebarSections={sidebarSections}
        editUrl={editUrl}
        editLabel={editLabel}
        lastUpdated={lastUpdated}
      >
        {content ? <div class="prose site-section-intro" innerHTML={content} /> : null}
        <p class="site-listing-stats">
          {totalItems} articles across {series.length} {series.length === 1 ? "topic" : "topics"}
        </p>
        {series.map((group) => (
          <section class="site-section-group">
            <h2 id={group.slug}>{group.displayName}</h2>
            {group.description ? <p class="site-section-description">{group.description}</p> : null}
            <EntryCardList entries={group.articles} />
          </section>
        ))}
        {other.length > 0 ? (
          <section class="site-section-group">
            <h2 id="other">Other</h2>
            <EntryCardList entries={other} />
          </section>
        ) : null}
      </PageShell>
    </SiteDocument>
  );
}
