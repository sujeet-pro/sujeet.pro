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
  const pageTitle =
    typeof frontmatter.title === "string" && frontmatter.title.trim()
      ? frontmatter.title
      : undefined;
  const pageDescription =
    typeof frontmatter.description === "string" && frontmatter.description.trim()
      ? frontmatter.description
      : undefined;

  const publishedDate = frontmatter.publishedDate;
  const publishedTime =
    publishedDate instanceof Date
      ? publishedDate.toISOString()
      : typeof publishedDate === "string" && publishedDate
        ? publishedDate
        : undefined;

  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter((tag): tag is string => typeof tag === "string")
    : undefined;

  const meta: SitePageMeta = {
    ogType: "article",
    publishedTime,
    modifiedTime: lastUpdated || undefined,
    tags,
  };

  return (
    <SiteDocument
      title={pageTitle ? `${pageTitle} — ${site.title}` : site.title || site.name}
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
          tags={
            Array.isArray(frontmatter.tags)
              ? frontmatter.tags.filter((tag): tag is string => typeof tag === "string")
              : undefined
          }
        />
        <div class="prose" innerHTML={content} />
      </PageShell>
    </SiteDocument>
  );
}
