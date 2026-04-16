import { SiteDocument } from "@pagesmith/site/components";
import type { SiteDocumentData, SiteSidebarSection } from "@pagesmith/site/components";
import { PageShell } from "@pagesmith/site/layouts";
import type { Heading } from "@pagesmith/site/ssg-utils";
import { EntryCardList } from "../components/EntryCardList";
import { getBlogListing } from "../lib/content";

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

export default function BlogListing(props: Props) {
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
  const { entries, meta } = getBlogListing(site.basePath || "");
  const pageTitle =
    typeof frontmatter.title === "string" && frontmatter.title.trim()
      ? frontmatter.title
      : undefined;
  const pageDescription =
    typeof frontmatter.description === "string" && frontmatter.description.trim()
      ? frontmatter.description
      : undefined;
  const tocHeadings = headings.filter((heading) => heading.depth >= 2 && heading.depth <= 3);

  return (
    <SiteDocument
      title={pageTitle ? `${pageTitle} — ${site.title}` : site.title || site.name}
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
        <p class="site-listing-stats">{entries.length} blog posts</p>
        <EntryCardList entries={entries} showDates />
      </PageShell>
    </SiteDocument>
  );
}
