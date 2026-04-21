import { withBasePath } from "@pagesmith/site";
import {
  HeroSection,
  SiteDocument,
  SiteFooter,
  SiteHeader,
  SiteSidebarModal,
  buildSidebarModalSections,
} from "@pagesmith/site/components";
import type { SiteAction, SiteDocumentData } from "@pagesmith/site/components";
import { getFeaturedArticles, getFeaturedSeries, getSiteStats } from "../lib/content";

type Props = {
  content: string;
  frontmatter: Record<string, unknown>;
  slug: string;
  site: SiteDocumentData;
};

type RawHomeAction = {
  text: string;
  link: string;
  theme?: string;
};

type HomeHero = {
  name?: string;
  tagline?: string;
  description?: string;
  actions?: SiteAction[];
};

function isRawHomeAction(value: unknown): value is RawHomeAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  return typeof action.text === "string" && typeof action.link === "string";
}

function getHomeHero(
  frontmatter: Record<string, unknown>,
  site: SiteDocumentData,
  base: string,
): HomeHero {
  const rawHero = frontmatter.hero;
  if (!rawHero || typeof rawHero !== "object") {
    return { name: site.name, tagline: site.title, description: site.description, actions: [] };
  }
  const hero = rawHero as Record<string, unknown>;
  const rawActions: RawHomeAction[] = Array.isArray(hero.actions)
    ? hero.actions.filter(isRawHomeAction)
    : [];
  return {
    name: typeof hero.name === "string" ? hero.name : site.name,
    tagline: typeof hero.text === "string" ? hero.text : site.title,
    description: typeof hero.tagline === "string" ? hero.tagline : site.description,
    actions: rawActions.map((a) => ({
      label: a.text,
      href: withBasePath(base, a.link),
      variant: a.theme === "alt" ? ("secondary" as const) : ("primary" as const),
    })),
  };
}

export default function Home({ content, frontmatter, slug, site }: Props) {
  const base = site.basePath || "";
  const hero = getHomeHero(frontmatter, site, base);

  const featuredArticles = getFeaturedArticles(
    base,
    Array.isArray(frontmatter.featuredArticles)
      ? frontmatter.featuredArticles.filter((entry): entry is string => typeof entry === "string")
      : [],
  );
  const featuredSeries = getFeaturedSeries(
    base,
    Array.isArray(frontmatter.featuredSeries)
      ? frontmatter.featuredSeries.filter((entry): entry is string => typeof entry === "string")
      : [],
  );
  const stats = getSiteStats();
  const modalSections = buildSidebarModalSections(site.navItems);
  const seoTitle =
    (typeof frontmatter.seoTitle === "string" && frontmatter.seoTitle.trim()
      ? frontmatter.seoTitle
      : undefined) ??
    (typeof frontmatter.title === "string" && frontmatter.title.trim()
      ? frontmatter.title
      : site.title);
  const pageDescription =
    typeof frontmatter.description === "string" && frontmatter.description.trim()
      ? frontmatter.description
      : site.description;

  return (
    <SiteDocument
      title={seoTitle || site.name}
      description={pageDescription}
      url={slug}
      socialImage={
        typeof frontmatter.socialImage === "string"
          ? withBasePath(base, frontmatter.socialImage)
          : undefined
      }
      site={site}
    >
      <SiteHeader
        siteName={site.name}
        basePath={site.basePath}
        homeLink={site.homeLink}
        navItems={site.navItems}
        currentPath={slug}
        searchEnabled={site.search?.enabled}
        showSidebarToggle
      />
      <main id="doc-main-content" class="site-home" tabindex="-1" data-pagefind-body="">
        <HeroSection
          name={hero.name}
          tagline={hero.tagline}
          description={hero.description}
          actions={hero.actions}
        />

        {featuredSeries.length > 0 ? (
          <>
            <hr class="site-home-divider" />
            <section class="site-home-section">
              <div class="site-home-section-header">
                <h2>Knowledge Hub</h2>
                <p class="site-home-stats">
                  {stats.articleCount} articles across {stats.seriesCount} topics
                </p>
              </div>
              <p class="site-home-section-desc">
                Deep-dive articles for engineers who want to understand how systems actually work.
              </p>
              <div class="site-home-series-grid">
                {featuredSeries.map((series) => (
                  <a href={`${base}/articles#${series.slug}`} class="site-home-series-card">
                    <span class="site-home-series-name">{series.displayName}</span>
                    <span class="site-home-series-count">{series.articles.length} articles</span>
                    {series.description ? (
                      <span class="site-home-series-desc">{series.description}</span>
                    ) : null}
                  </a>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {featuredArticles.length > 0 ? (
          <>
            <hr class="site-home-divider" />
            <section class="site-home-section">
              <div class="site-home-section-header">
                <p class="site-home-section-label">Featured Articles</p>
                <p class="site-home-section-meta">Hand-picked reads</p>
              </div>
              <ul class="site-home-featured-list">
                {featuredArticles.map((entry) => (
                  <li class="site-home-featured-item">
                    <a href={entry.path} class="site-home-featured-link">
                      <span class="site-home-featured-title">{entry.cardTitle ?? entry.title}</span>
                      {entry.description ? (
                        <span class="site-home-featured-desc">{entry.description}</span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        {content ? (
          <>
            <hr class="site-home-divider" />
            <section class="site-home-markdown">
              <div class="prose" innerHTML={content} />
            </section>
          </>
        ) : null}
      </main>
      <div class="site-home-footer">
        <SiteFooter
          links={site.footerLinks}
          maintainer={site.maintainer}
          copyright={site.copyright}
        />
      </div>
      <SiteSidebarModal
        sections={modalSections}
        currentPath={slug}
        collapsible={site.sidebar?.collapsible}
        navLabel="Navigation"
      />
    </SiteDocument>
  );
}
