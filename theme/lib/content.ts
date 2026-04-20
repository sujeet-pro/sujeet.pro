import {
  buildBreadcrumbs,
  buildPrevNext,
  buildSidebarFromEntries,
  extractFrontmatter,
  sortByDate,
  sortByManualOrder,
  withBasePath,
} from "@pagesmith/site";
import type {
  SiteBreadcrumb,
  SitePageLink,
  SiteSidebarItem,
  SiteSidebarSection,
} from "@pagesmith/site/components";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJson5File } from "../../lib/read-json5";
import {
  type FooterLinkGroup,
  type HomeData,
  HomeDataSchema,
  type RedirectConfig,
  RedirectConfigSchema,
  type RootMeta,
  RootMetaSchema,
  type SectionMeta,
  SectionMetaSchema,
} from "../../schemas/content-data";
import { ArticleFrontmatterSchema, BlogFrontmatterSchema } from "../../schemas/frontmatter";

type RawEntry = {
  slug: string;
  title: string;
  description?: string;
  publishedDate?: string;
  lastUpdatedOn?: string;
  tags: string[];
};

export type ListingEntry = RawEntry & {
  path: string;
};

export type SeriesGroup = {
  slug: string;
  displayName: string;
  shortName?: string;
  description?: string;
  articles: ListingEntry[];
};

export type { SiteSidebarItem, SiteSidebarSection } from "@pagesmith/site/components";

const CONTENT_ROOT = join(process.cwd(), "content");
const rawEntriesCache = new Map<string, RawEntry[]>();
const sectionMetaCache = new Map<string, SectionMeta | undefined>();

let rootMetaCache: RootMeta | undefined;
let homeDataCache: HomeData | undefined;
let redirectsCache: RedirectConfig | undefined;

function formatSchemaError(
  path: string,
  issues: Array<{ path: PropertyKey[]; message: string }>,
): string {
  const details = issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "<root>"}: ${issue.message}`)
    .join("; ");
  return `Invalid content metadata in ${path}: ${details}`;
}

function toDateString(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
  }
  return undefined;
}

function titleCompare(left: RawEntry, right: RawEntry): number {
  return left.title.localeCompare(right.title);
}

function sortRawEntries(entries: RawEntry[], meta: SectionMeta | undefined): RawEntry[] {
  if (meta?.orderBy === "publishedDate") {
    return sortByDate(entries, (e) => e.publishedDate, titleCompare);
  }
  if (meta?.orderBy === "manual" && meta.items?.length) {
    return sortByManualOrder(entries, meta.items, (e) => e.slug, titleCompare);
  }
  return [...entries].sort(titleCompare);
}

function withPath(entry: RawEntry, section: string, basePath: string): ListingEntry {
  return {
    ...entry,
    path: withBasePath(basePath, `/${section}/${entry.slug}`),
  };
}

function loadRawEntries(section: "articles" | "blogs"): RawEntry[] {
  const cached = rawEntriesCache.get(section);
  if (cached) return cached;

  const sectionDir = join(CONTENT_ROOT, section);
  const entries: RawEntry[] = [];
  if (!existsSync(sectionDir)) {
    rawEntriesCache.set(section, entries);
    return entries;
  }

  for (const entry of readdirSync(sectionDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const readmePath = join(sectionDir, entry.name, "README.md");
    if (!existsSync(readmePath)) continue;

    const raw = readFileSync(readmePath, "utf-8");
    const extracted = extractFrontmatter(raw);
    const schema = section === "articles" ? ArticleFrontmatterSchema : BlogFrontmatterSchema;
    const parsed = schema.safeParse(extracted.frontmatter ?? {});

    if (!parsed.success) {
      throw new Error(formatSchemaError(readmePath, parsed.error.issues));
    }

    if (parsed.data.draft) continue;

    entries.push({
      slug: entry.name,
      title: parsed.data.title,
      description: parsed.data.description,
      publishedDate: toDateString(parsed.data.publishedDate),
      lastUpdatedOn: toDateString(parsed.data.lastUpdatedOn),
      tags: parsed.data.tags,
    });
  }

  rawEntriesCache.set(section, entries);
  return entries;
}

function prefixFooterLinks(basePath: string, groups: FooterLinkGroup[]): FooterLinkGroup[] {
  return groups.map((group) => ({
    ...group,
    links: group.links.map((link) => ({
      ...link,
      path: withBasePath(basePath, link.path),
    })),
  }));
}

export function loadRootMeta(): RootMeta {
  rootMetaCache ??= readJson5File(join(CONTENT_ROOT, "meta.json5"), RootMetaSchema);
  return rootMetaCache;
}

export function loadHomeData(): HomeData {
  homeDataCache ??= readJson5File(join(CONTENT_ROOT, "home.json5"), HomeDataSchema);
  return homeDataCache;
}

export function loadRedirectConfig(): RedirectConfig {
  redirectsCache ??= readJson5File(join(CONTENT_ROOT, "redirects.json5"), RedirectConfigSchema);
  return redirectsCache;
}

export function loadSectionMeta(section: "articles" | "blogs"): SectionMeta | undefined {
  if (sectionMetaCache.has(section)) return sectionMetaCache.get(section);
  const metaPath = join(CONTENT_ROOT, section, "meta.json5");
  const meta = existsSync(metaPath) ? readJson5File(metaPath, SectionMetaSchema) : undefined;
  sectionMetaCache.set(section, meta);
  return meta;
}

export function loadSectionEntries(
  section: "articles" | "blogs",
  basePath: string,
): ListingEntry[] {
  return loadRawEntries(section).map((entry) => withPath(entry, section, basePath));
}

export function getSiteChrome(basePath: string): {
  navItems: Array<{ path: string; label: string }>;
  footerLinks: FooterLinkGroup[];
} {
  const meta = loadRootMeta();
  return {
    navItems: meta.headerLinks.map((item) => ({
      ...item,
      path: withBasePath(basePath, item.path),
    })),
    footerLinks: prefixFooterLinks(basePath, meta.footerLinks),
  };
}

export function getArticleListing(basePath: string): {
  meta: SectionMeta | undefined;
  series: SeriesGroup[];
  other: ListingEntry[];
} {
  const meta = loadSectionMeta("articles");
  const entries = loadSectionEntries("articles", basePath);
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const included = new Set<string>();

  const series = (meta?.series ?? [])
    .map((seriesDef) => ({
      slug: seriesDef.slug,
      displayName: seriesDef.displayName,
      shortName: seriesDef.shortName,
      description: seriesDef.description,
      articles: seriesDef.articles
        .map((slug) => {
          const entry = bySlug.get(slug);
          if (!entry) return undefined;
          included.add(entry.slug);
          return entry;
        })
        .filter((entry): entry is ListingEntry => entry !== undefined),
    }))
    .filter((seriesDef) => seriesDef.articles.length > 0);

  const other = sortRawEntries(
    loadRawEntries("articles").filter((entry) => !included.has(entry.slug)),
    meta,
  ).map((entry) => withPath(entry, "articles", basePath));

  return { meta, series, other };
}

export function getArticleContext(
  basePath: string,
  slug: string,
): {
  breadcrumbs: SiteBreadcrumb[];
  sidebarSections: SiteSidebarSection[];
  prev?: SitePageLink;
  next?: SitePageLink;
} {
  const listing = getArticleListing(basePath);

  // Flat reading order across the whole section: every series in declared
  // order, then any "Other" entries. Prev/next traverses this list so that
  // the last article of a series links to the first article of the next
  // series (and vice versa).
  const flat: ListingEntry[] = [
    ...listing.series.flatMap((group) => group.articles),
    ...listing.other,
  ];
  const flatIndex = flat.findIndex((entry) => entry.slug === slug);
  const { prev, next } =
    flatIndex >= 0
      ? buildPrevNext(
          flat,
          flatIndex,
          (e) => e.title,
          (e) => e.path,
        )
      : { prev: undefined, next: undefined };

  let currentSeries: SeriesGroup | undefined;
  let currentTitle: string | undefined;
  for (const group of listing.series) {
    const hit = group.articles.find((entry) => entry.slug === slug);
    if (hit) {
      currentSeries = group;
      currentTitle = hit.title;
      break;
    }
  }
  if (!currentTitle) {
    currentTitle = listing.other.find((entry) => entry.slug === slug)?.title;
  }

  // Sidebar: every series renders as a top-level item that links to its first
  // article, with its articles attached as children. Pagesmith's renderer adds
  // an `expanded` class to the parent whose child path matches the current
  // page; CSS hides children of non-matching parents. The result: the current
  // series shows as an expanded accordion (with the active article highlighted
  // beneath it), every other series stays collapsed, and there is no
  // user-facing toggle so it cannot be collapsed away.
  const seriesItems: SiteSidebarItem[] = listing.series.map((group) => ({
    title: group.displayName,
    path: group.articles[0]!.path,
    children: group.articles.map((entry) => ({
      title: entry.title,
      path: entry.path,
    })),
  }));

  const sidebarSections: SiteSidebarSection[] = [];
  if (seriesItems.length > 0) {
    sidebarSections.push({ title: "Series", items: seriesItems });
  }
  if (listing.other.length > 0) {
    sidebarSections.push({
      title: "Other",
      items: listing.other.map((entry) => ({
        title: entry.title,
        path: entry.path,
      })),
    });
  }

  const breadcrumbTrail: SiteBreadcrumb[] = [{ label: "Articles", path: "/articles" }];
  if (currentSeries) {
    breadcrumbTrail.push(
      { label: currentSeries.displayName, path: "/articles" },
      { label: currentTitle ?? slug },
    );
  } else if (currentTitle) {
    breadcrumbTrail.push({ label: currentTitle });
  }

  return {
    breadcrumbs: buildBreadcrumbs(basePath, breadcrumbTrail),
    sidebarSections,
    prev,
    next,
  };
}

export function getBlogListing(basePath: string): {
  meta: SectionMeta | undefined;
  entries: ListingEntry[];
} {
  const meta = loadSectionMeta("blogs");
  const entries = sortRawEntries(loadRawEntries("blogs"), meta).map((entry) =>
    withPath(entry, "blogs", basePath),
  );
  return { meta, entries };
}

export function getBlogContext(
  basePath: string,
  slug: string,
): {
  breadcrumbs: SiteBreadcrumb[];
  sidebarSections: SiteSidebarSection[];
  prev?: SitePageLink;
  next?: SitePageLink;
} {
  const listing = getBlogListing(basePath);
  const index = listing.entries.findIndex((entry) => entry.slug === slug);

  const { prev, next } = buildPrevNext(
    listing.entries,
    index,
    (e) => e.title,
    (e) => e.path,
  );

  return {
    breadcrumbs:
      index >= 0
        ? buildBreadcrumbs(basePath, [
            { label: "Blogs", path: "/blogs" },
            { label: listing.entries[index]!.title },
          ])
        : buildBreadcrumbs(basePath, [{ label: "Blogs", path: "/blogs" }]),
    sidebarSections: buildSidebarFromEntries(
      listing.meta?.displayName ?? "Blogs",
      listing.entries.map((e) => ({ title: e.title, path: e.path })),
    ),
    prev,
    next,
  };
}

export function getFeaturedArticles(basePath: string, slugs: string[]): ListingEntry[] {
  const entries = loadSectionEntries("articles", basePath);
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((entry): entry is ListingEntry => entry !== undefined);
}

export function getFeaturedSeries(basePath: string, slugs: string[]): SeriesGroup[] {
  const { series } = getArticleListing(basePath);
  const bySlug = new Map(series.map((entry) => [entry.slug, entry]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((entry): entry is SeriesGroup => entry !== undefined);
}

export function getSiteStats(): { articleCount: number; blogCount: number; seriesCount: number } {
  return {
    articleCount: loadRawEntries("articles").length,
    blogCount: loadRawEntries("blogs").length,
    seriesCount: loadSectionMeta("articles")?.series?.length ?? 0,
  };
}
