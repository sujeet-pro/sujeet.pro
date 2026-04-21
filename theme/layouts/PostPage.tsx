import { withBasePath } from "@pagesmith/site";
import { SiteDocument } from "@pagesmith/site/components";
import type {
  SiteBreadcrumb,
  SiteDocumentData,
  SitePageLink,
  SitePageMeta,
  SiteSidebarSection,
} from "@pagesmith/site/components";
import { PageShell } from "@pagesmith/site/layouts";
import type { Heading } from "@pagesmith/site/ssg-utils";
import { ContentMeta } from "../components/ContentMeta";
import { resolveTags } from "../lib/content";

export type PostPageProps = {
  content: string;
  frontmatter: Record<string, unknown>;
  headings: Heading[];
  slug: string;
  site: SiteDocumentData;
  sidebarSections?: SiteSidebarSection[];
  breadcrumbs?: SiteBreadcrumb[];
  prev?: SitePageLink;
  next?: SitePageLink;
  editUrl?: string;
  editLabel?: string;
  lastUpdated?: string;
};

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function PostPage(props: PostPageProps) {
  const {
    content,
    frontmatter,
    headings,
    slug,
    site,
    sidebarSections,
    breadcrumbs,
    prev,
    next,
    editUrl,
    editLabel,
    lastUpdated,
  } = props;

  // Title resolution order for the `<title>` tag and OpenGraph: explicit
  // SEO override → canonical title → site fallback. The visible H1 in the
  // markdown body is unaffected and remains the page heading.
  const fallbackTitle = pickString(frontmatter.title);
  const seoTitle = pickString(frontmatter.seoTitle) ?? fallbackTitle;
  const pageDescription = pickString(frontmatter.description);

  const publishedDate = frontmatter.publishedDate;
  const publishedTime =
    publishedDate instanceof Date
      ? publishedDate.toISOString()
      : typeof publishedDate === "string" && publishedDate
        ? publishedDate
        : undefined;

  const rawTags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const displayTags = resolveTags(rawTags);
  const tagNames = displayTags.map((tag) => tag.name);

  const meta: SitePageMeta = {
    ogType: "article",
    publishedTime,
    modifiedTime: lastUpdated || undefined,
    tags: tagNames,
  };

  return (
    <SiteDocument
      title={seoTitle ? `${seoTitle} — ${site.title}` : site.title || site.name}
      description={pageDescription ?? site.description}
      url={slug}
      socialImage={
        typeof frontmatter.socialImage === "string"
          ? withBasePath(site.basePath || "", frontmatter.socialImage)
          : undefined
      }
      site={site}
      meta={meta}
    >
      <PageShell
        site={site}
        currentPath={slug}
        headings={headings}
        breadcrumbs={breadcrumbs}
        sidebarSections={sidebarSections}
        editUrl={editUrl}
        editLabel={editLabel}
        lastUpdated={lastUpdated}
        prev={prev}
        next={next}
      >
        <ContentMeta
          publishedDate={frontmatter.publishedDate as string | undefined}
          lastUpdatedDate={frontmatter.lastUpdatedOn as string | undefined}
          isDraft={frontmatter.draft as boolean | undefined}
          tags={tagNames}
        />
        <div class="prose" innerHTML={content} />
      </PageShell>
    </SiteDocument>
  );
}
