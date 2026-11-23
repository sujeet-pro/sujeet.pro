/**
 * Knowledge-graph compiler (Stage 3.1).
 *
 * - Compiles `/graph-index.<hash>.json` (§4.3): series memberships, published articles + pages + sections,
 *   and relation edges between published articles.
 * - Validates the graph at build time: unknown `targetSlug` / `targetPage` / `targetSection` (in `relations[]`
 *   and in `<ArticleRef>` usages) throw; cycles over `prerequisite` + `deep-dive-of` throw with the path.
 * - Exposes build-time view models for zero-JS UI: series nav (breadcrumb, switcher, Prev/Next),
 *   resolved relations (Connections panel) and backlinks (Referenced By).
 *
 * Visibility (§3): a relation whose target is a draft is resolved as `upcoming: true`. Upcoming view models
 * carry NO slug and NO url, so a draft slug cannot reach published HTML, and the index never emits them.
 *
 * Vite-only (imports the registry, which uses import.meta.glob).
 */
import { createHash } from 'node:crypto';
import {
  getAllArticles,
  getArticle,
  getPublishedArticles,
  getSeries,
  type RegistryEntry,
  type RegistryPage,
} from '../articles/registry';
import type { GraphIndex } from './types';

export type { GraphIndex } from './types';

export interface BuiltGraphIndex {
  index: GraphIndex;
  /** Exact bytes served at `url`. */
  body: string;
  hash: string;
  url: string;
}

export type RelationKind = 'prerequisite' | 'builds-on' | 'deep-dive-of' | 'uses-building-block' | 'related';

/** A relation target as the UI may render it. `url` is present only when the target is published. */
export interface ResolvedRelation {
  kind: RelationKind;
  reason?: string;
  upcoming: boolean;
  title: string;
  archetype: string;
  /** Published targets only: `/<slug>/[page/][#section]`. */
  url?: string;
  pageTitle?: string;
  sectionTitle?: string;
}

/** One incoming edge from a published source article (Referenced By). */
export interface Backlink {
  kind: RelationKind;
  reason?: string;
  sourceTitle: string;
  /** Source tab where the reference lives (from `<ArticleRef>` usage), else the article index. */
  sourcePageLabel: string;
  sourceUrl: string;
  /** Target section on this article, when the relation points at one. */
  sectionTitle?: string;
}

export interface SeriesNavLink {
  title: string;
  url: string;
}

export interface SeriesNav {
  slug: string;
  title: string;
  description: string;
  isPrimary: boolean;
  /** 1-based position among published articles of the series. */
  position: number;
  total: number;
  hubUrl: string;
  prev?: SeriesNavLink;
  next?: SeriesNavLink;
}

const HASH_LENGTH = 10;
const CYCLE_KINDS: ReadonlySet<RelationKind> = new Set(['prerequisite', 'deep-dive-of']);

/** Raw MDX sources, scanned for `<ArticleRef>` usages (from.page attribution + validation). */
const rawPages = import.meta.glob<string>('/src/articles/*/pages/*.mdx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const fail = (msg: string): never => {
  throw new Error(`[graph] ${msg}`);
};

export const seriesCtx = (seriesSlug: string): string => `?ctx=series:${seriesSlug}`;
export const seriesHubUrl = (seriesSlug: string): string => `/series/${seriesSlug}/${seriesCtx(seriesSlug)}`;

// ---------------------------------------------------------------------------
// Target resolution + validation
// ---------------------------------------------------------------------------

interface TargetRef {
  targetSlug: string;
  targetPage?: string;
  targetSection?: string;
}

interface ResolvedTarget {
  entry: RegistryEntry;
  page: RegistryPage;
  section?: { id: string; title: string };
}

function headingsOf(page: RegistryPage): Array<{ depth: number; slug: string; text: string }> {
  return page.module.getHeadings?.() ?? [];
}

export interface PageSection {
  id: string;
  title: string;
  level: 2 | 3;
}

const EVO_TAG_RE = /<(EvolutionLadder|EvolutionStages|EvolutionStage)\b([^>]*)>/g;
const LEVEL_ATTR_RE = /\blevel\s*=\s*(?:\{\s*(\d+)\s*\}|"(\d+)"|'(\d+)')/;
const sectionCache = new Map<string, PageSection[]>();

/**
 * Sections of a page in document order (Stage 3.11).
 *
 * MDX `getHeadings()` lists only Markdown headings: H2s rendered inside Astro components (EvolutionLadder,
 * EvolutionStage) are absent (verified 2026-11-23, @astrojs/mdx 8.1.6). So the raw MDX is scanned: Markdown
 * `##`/`###` lines consume `getHeadings()` entries in order, and evolution component tags inject
 * `evolution-ladder` / `stage-l<n>` (title `L<n> · <title>`) from the article's validated evolution data.
 */
export function sectionsOf(entry: RegistryEntry, page: RegistryPage): PageSection[] {
  const key = page.url;
  const hit = sectionCache.get(key);
  if (hit) return hit;
  const headings = headingsOf(page).filter((h) => h.depth === 2 || h.depth === 3);
  const raw = rawPages[`/src/articles/${entry.slug}/${page.entry}`] ?? '';
  const stages = entry.evolution?.evolution.stages ?? [];
  const stageSection = (level: number): PageSection => {
    const s = stages.find((x) => x.level === level) ?? fail(`${page.url}: <EvolutionStage level={${level}}> has no stage in data/evolution.json`);
    return { id: `stage-l${s.level}`, title: `L${s.level} · ${s.title}`, level: 2 };
  };
  const out: PageSection[] = [];
  let hi = 0;
  let fence: string | null = null;
  for (const line of raw.split('\n')) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const md = /^(#{1,6})\s+\S/.exec(line);
    if (md) {
      const depth = md[1].length;
      if (depth === 2 || depth === 3) {
        const h = headings[hi++];
        if (h) out.push({ id: h.slug, title: h.text, level: h.depth as 2 | 3 });
      }
      continue;
    }
    for (const m of line.matchAll(EVO_TAG_RE)) {
      if (!entry.evolution) fail(`${page.url}: <${m[1]}> used but "${entry.slug}" has no data/evolution.json`);
      if (m[1] === 'EvolutionLadder') out.push({ id: 'evolution-ladder', title: 'Evolution ladder', level: 2 });
      else if (m[1] === 'EvolutionStages') out.push(...stages.map((s) => stageSection(s.level)));
      else {
        const lv = LEVEL_ATTR_RE.exec(m[2]);
        if (!lv) fail(`${page.url}: <EvolutionStage> needs a literal level={n} attribute`);
        out.push(stageSection(Number(lv![1] ?? lv![2] ?? lv![3])));
      }
    }
  }
  // Headings the line scan could not place (e.g. emitted by a remark plugin) keep their getHeadings() order.
  for (const h of headings.slice(hi)) out.push({ id: h.slug, title: h.text, level: h.depth as 2 | 3 });
  const seen = new Set<string>();
  const result = out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  sectionCache.set(key, result);
  return result;
}

function resolveTarget(ref: TargetRef, where: string): ResolvedTarget {
  const entry = getArticle(ref.targetSlug) ?? fail(`${where}: unknown targetSlug "${ref.targetSlug}"`);
  const page = ref.targetPage
    ? (entry.pages.find((p) => p.slug === ref.targetPage) ??
      fail(`${where}: unknown targetPage "${ref.targetPage}" on "${ref.targetSlug}"`))
    : entry.pages.find((p) => p.isIndex)!;
  let section: ResolvedTarget['section'];
  if (ref.targetSection) {
    const h =
      sectionsOf(entry, page).find((x) => x.id === ref.targetSection) ??
      fail(`${where}: unknown targetSection "#${ref.targetSection}" on ${page.url}`);
    section = { id: h.id, title: h.title };
  }
  return { entry, page, section };
}

function targetUrl(t: ResolvedTarget): string {
  return t.section ? `${t.page.url}#${t.section.id}` : t.page.url;
}

// ---------------------------------------------------------------------------
// <ArticleRef> usage scan
// ---------------------------------------------------------------------------

interface RefUsage extends TargetRef {
  sourceSlug: string;
  sourcePage: RegistryPage;
}

const ATTR_RE = /([A-Za-z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const TAG_RE = /<ArticleRef\b([^>]*?)\/?>/g;

function scanArticleRefs(): RefUsage[] {
  const out: RefUsage[] = [];
  for (const [path, raw] of Object.entries(rawPages)) {
    const [, , , sourceSlug, , file] = path.split('/');
    const entry = getArticle(sourceSlug);
    const sourcePage = entry?.pages.find((p) => p.entry === `pages/${file}`);
    if (!entry || !sourcePage) continue; // MDX file not referenced by a manifest page
    for (const m of raw.matchAll(TAG_RE)) {
      const attrs: Record<string, string> = {};
      for (const a of m[1].matchAll(ATTR_RE)) attrs[a[1]] = a[2] ?? a[3];
      if (!attrs.slug) fail(`${path}: <ArticleRef> needs a literal slug="…" attribute`);
      out.push({
        sourceSlug,
        sourcePage,
        targetSlug: attrs.slug,
        ...(attrs.page ? { targetPage: attrs.page } : {}),
        ...(attrs.section ? { targetSection: attrs.section } : {}),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Compiled model (memoised; the registry is immutable for a build)
// ---------------------------------------------------------------------------

interface EdgeRecord {
  source: RegistryEntry;
  /** Page that carries the `<ArticleRef>` for this relation, when found. */
  sourcePage?: RegistryPage;
  target: ResolvedTarget;
  kind: RelationKind;
  reason?: string;
}

interface Model {
  edges: EdgeRecord[];
  bySource: Map<string, EdgeRecord[]>;
  byTarget: Map<string, EdgeRecord[]>;
}

let model: Model | undefined;

function detectCycles(edges: EdgeRecord[]): void {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!CYCLE_KINDS.has(e.kind)) continue;
    adj.set(e.source.slug, [...(adj.get(e.source.slug) ?? []), e.target.entry.slug]);
  }
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const stack: string[] = [];
  const visit = (n: string): void => {
    state.set(n, 1);
    stack.push(n);
    for (const m of adj.get(n) ?? []) {
      const s = state.get(m);
      if (s === 1) {
        const cycle = [...stack.slice(stack.indexOf(m)), m].join(' → ');
        fail(`cycle in prerequisite/deep-dive-of relations: ${cycle}`);
      }
      if (!s) visit(m);
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const n of [...adj.keys()].sort()) if (!state.has(n)) visit(n);
}

function compile(): Model {
  if (model) return model;
  const usages = scanArticleRefs();
  for (const u of usages) resolveTarget(u, `${u.sourcePage.entry} of "${u.sourceSlug}" <ArticleRef>`);

  const edges: EdgeRecord[] = [];
  for (const source of getAllArticles()) {
    source.manifest.relations.forEach((rel, i) => {
      if (rel.targetSlug === source.slug) fail(`"${source.slug}" relations[${i}]: an article cannot relate to itself`);
      const target = resolveTarget(rel, `"${source.slug}" relations[${i}]`);
      const usage =
        usages.find(
          (u) =>
            u.sourceSlug === source.slug &&
            u.targetSlug === rel.targetSlug &&
            (u.targetPage ?? undefined) === (rel.targetPage ?? undefined),
        ) ?? usages.find((u) => u.sourceSlug === source.slug && u.targetSlug === rel.targetSlug);
      edges.push({
        source,
        ...(usage ? { sourcePage: usage.sourcePage } : {}),
        target,
        kind: rel.kind,
        ...(rel.reason ? { reason: rel.reason } : {}),
      });
    });
  }
  detectCycles(edges);

  const bySource = new Map<string, EdgeRecord[]>();
  const byTarget = new Map<string, EdgeRecord[]>();
  for (const e of edges) {
    bySource.set(e.source.slug, [...(bySource.get(e.source.slug) ?? []), e]);
    byTarget.set(e.target.entry.slug, [...(byTarget.get(e.target.entry.slug) ?? []), e]);
  }
  model = { edges, bySource, byTarget };
  return model;
}

// ---------------------------------------------------------------------------
// View models for the article UI
// ---------------------------------------------------------------------------

const isPublished = (e: RegistryEntry) => e.status === 'published';

/**
 * Resolve a target for `<ArticleRef>`. Draft targets come back `upcoming` with title + archetype only.
 */
export function resolveRef(ref: TargetRef): Omit<ResolvedRelation, 'kind' | 'reason'> {
  const t = resolveTarget(ref, `<ArticleRef slug="${ref.targetSlug}">`);
  if (!isPublished(t.entry)) {
    return { upcoming: true, title: t.entry.manifest.title, archetype: t.entry.manifest.archetype };
  }
  return {
    upcoming: false,
    title: t.entry.manifest.title,
    archetype: t.entry.manifest.archetype,
    url: targetUrl(t),
    ...(t.page.isIndex ? {} : { pageTitle: t.page.navLabel }),
    ...(t.section ? { sectionTitle: t.section.title } : {}),
  };
}

/** Outgoing relations of an article, in manifest order. Draft targets are `upcoming` (no slug, no url). */
export function getRelations(slug: string): ResolvedRelation[] {
  return (compile().bySource.get(slug) ?? []).map((e) => {
    const base = { kind: e.kind, ...(e.reason ? { reason: e.reason } : {}) };
    if (!isPublished(e.target.entry)) {
      return { ...base, upcoming: true, title: e.target.entry.manifest.title, archetype: e.target.entry.manifest.archetype };
    }
    return {
      ...base,
      upcoming: false,
      title: e.target.entry.manifest.title,
      archetype: e.target.entry.manifest.archetype,
      url: targetUrl(e.target),
      ...(e.target.page.isIndex ? {} : { pageTitle: e.target.page.navLabel }),
      ...(e.target.section ? { sectionTitle: e.target.section.title } : {}),
    };
  });
}

/** Incoming relations from **published** sources only (a draft source must never be linked). */
export function getBacklinks(slug: string): Backlink[] {
  return (compile().byTarget.get(slug) ?? [])
    .filter((e) => isPublished(e.source))
    .map((e) => {
      const page = e.sourcePage ?? e.source.pages.find((p) => p.isIndex)!;
      return {
        kind: e.kind,
        ...(e.reason ? { reason: e.reason } : {}),
        sourceTitle: e.source.manifest.title,
        sourcePageLabel: page.navLabel,
        sourceUrl: page.url,
        ...(e.target.section ? { sectionTitle: e.target.section.title } : {}),
      };
    });
}

/**
 * Series navigation for a published article: one entry per series membership (series.json order),
 * positions and Prev/Next computed over **published** members only. Drafts get [] (no series context).
 */
export function getSeriesNav(slug: string): SeriesNav[] {
  const entry = getArticle(slug);
  if (!entry || !isPublished(entry)) return [];
  const published = new Set(getPublishedArticles().map((a) => a.slug));
  const ctxLink = (s: string, seriesSlug: string): SeriesNavLink => ({
    title: getArticle(s)!.manifest.title,
    url: `/${s}/${seriesCtx(seriesSlug)}`,
  });
  return getSeries()
    .filter((s) => s.articles.includes(slug))
    .map((s) => {
      const members = s.articles.filter((a) => published.has(a));
      const i = members.indexOf(slug);
      return {
        slug: s.slug,
        title: s.title,
        description: s.description,
        isPrimary: entry.manifest.primarySeries === s.slug,
        position: i + 1,
        total: members.length,
        hubUrl: seriesHubUrl(s.slug),
        ...(i > 0 ? { prev: ctxLink(members[i - 1], s.slug) } : {}),
        ...(i < members.length - 1 ? { next: ctxLink(members[i + 1], s.slug) } : {}),
      };
    });
}

// ---------------------------------------------------------------------------
// Compiled index (§4.3)
// ---------------------------------------------------------------------------

let cached: BuiltGraphIndex | undefined;

export function buildGraphIndex(): BuiltGraphIndex {
  if (cached) return cached;
  const { edges: allEdges } = compile();

  const published = getPublishedArticles();
  const publishedSlugs = new Set(published.map((a) => a.slug));

  const series = getSeries()
    .map((s) => ({
      slug: s.slug,
      title: s.title,
      description: s.description,
      ...(s.pillarSlug && publishedSlugs.has(s.pillarSlug) ? { pillarSlug: s.pillarSlug } : {}),
      articles: s.articles.filter((slug) => publishedSlugs.has(slug)),
    }))
    .filter((s) => s.articles.length > 0);

  const articles: GraphIndex['articles'] = published.map((a) => ({
    slug: a.slug,
    title: a.manifest.title,
    subtitle: a.manifest.subtitle,
    archetype: a.manifest.archetype,
    ...(a.manifest.primarySeries ? { primarySeries: a.manifest.primarySeries } : {}),
    seriesSlugs: series.filter((s) => s.articles.includes(a.slug)).map((s) => s.slug),
    tags: a.manifest.tags,
    concepts: a.manifest.concepts,
    pages: a.pages.map((p) => ({
      ...(p.slug ? { slug: p.slug } : {}),
      title: p.title,
      url: p.url,
      sections: sectionsOf(a, p),
    })),
  }));

  // Published → published only; upcoming (draft-target) relations are never emitted.
  const edges: GraphIndex['edges'] = allEdges
    .filter((e) => isPublished(e.source) && isPublished(e.target.entry))
    .map((e) => ({
      from: { article: e.source.slug, ...(e.sourcePage?.slug ? { page: e.sourcePage.slug } : {}) },
      to: {
        article: e.target.entry.slug,
        ...(e.target.page.slug ? { page: e.target.page.slug } : {}),
        ...(e.target.section ? { section: e.target.section.id } : {}),
      },
      kind: e.kind,
      ...(e.reason ? { reason: e.reason } : {}),
    }));

  const content = { schemaVersion: 1 as const, series, articles, edges };
  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, HASH_LENGTH);
  const index: GraphIndex = { schemaVersion: 1, graphHash: hash, series, articles, edges };

  // Defence in depth (§3): no slug-bearing field may name an unpublished article.
  const referenced = [
    ...articles.map((a) => a.slug),
    ...series.flatMap((s) => [...s.articles, ...(s.pillarSlug ? [s.pillarSlug] : [])]),
    ...edges.flatMap((e) => [e.from.article, e.to.article]),
  ];
  const leaked = referenced.find((s) => !publishedSlugs.has(s));
  if (leaked) fail(`leak: unpublished article "${leaked}" in the graph index`);

  const body = JSON.stringify(index);

  cached = { index, body, hash, url: `/graph-index.${hash}.json` };
  return cached;
}
