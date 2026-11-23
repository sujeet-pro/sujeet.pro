// Vite-only module (uses import.meta.glob). Plain-Node validators must not import this file.
import fs from 'node:fs';
import nodePath from 'node:path';
import {
  ArticleManifestSchema,
  CostModelSchema,
  EvolutionSchema,
  SeriesFileSchema,
  TopologySchema,
  deriveStatus,
  type CostModel,
  type Evolution,
  type Topology,
} from './schema';
import { checkEvolutionRefs, formatIssues, type RefIssue } from './evolution';
import type { z } from 'astro/zod';
import seriesJson from '../../series/series.json';

export type ArticleManifest = z.infer<typeof ArticleManifestSchema>;
export type SeriesEntry = z.infer<typeof SeriesFileSchema>[number];

/** MDX module shape (Astro MDX integration). */
export interface MdxModule {
  default: (props: Record<string, unknown>) => unknown;
  getHeadings?: () => Array<{ depth: number; slug: string; text: string }>;
  frontmatter?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RegistryPage {
  /** undefined for the index page */
  slug: string | undefined;
  title: string;
  navLabel: string;
  summary: string;
  entry: string;
  /** Trailing-slash URL: `/<slug>/` or `/<slug>/<page>/` */
  url: string;
  isIndex: boolean;
  module: MdxModule;
}

export interface ArticleEvolution {
  evolution: Evolution;
  topology: Topology;
  costModels?: CostModel;
  /** Non-fatal E9/T3 findings (fatal ones throw at build time). */
  warnings: RefIssue[];
}

export interface RegistryEntry {
  manifest: ArticleManifest;
  slug: string;
  status: 'published' | 'draft';
  pages: RegistryPage[];
  evolution?: ArticleEvolution;
}

export interface Prototype {
  slug: string;
  version: number;
  latest: boolean;
  /** `/<slug>/prototype/` for latest, else `/<slug>/prototype/vN/` */
  url: string;
  html: string;
}

const manifestModules = import.meta.glob<{ default: unknown }>('/src/articles/*/article.json', { eager: true });
const pageModules = import.meta.glob<MdxModule>('/src/articles/*/pages/*.mdx', { eager: true });
const dataModules = import.meta.glob<{ default: unknown }>('/src/articles/*/data/*.json', { eager: true });
const prototypeModules = import.meta.glob<string>('/src/articles/*/prototypes/v*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const fail = (msg: string): never => {
  throw new Error(`[registry] ${msg}`);
};

function loadSeries(): SeriesEntry[] {
  const parsed = SeriesFileSchema.safeParse(seriesJson);
  if (!parsed.success) fail(`src/series/series.json is invalid:\n${z_format(parsed.error)}`);
  const series = (parsed as { data: SeriesEntry[] }).data;
  const seen = new Set<string>();
  for (const s of series) {
    if (seen.has(s.slug)) fail(`series.json: duplicate series slug "${s.slug}"`);
    seen.add(s.slug);
    if (new Set(s.articles).size !== s.articles.length) {
      fail(`series.json: series "${s.slug}" lists duplicate article slugs`);
    }
    if (s.pillarSlug && !s.articles.includes(s.pillarSlug)) {
      fail(`series.json: series "${s.slug}" pillarSlug "${s.pillarSlug}" is not one of its articles`);
    }
  }
  return series;
}

function z_format(err: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return err.issues.map((i) => `  - ${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('\n');
}

/**
 * Load data/evolution.json + data/topology.json (+ cost-models.json) when present,
 * validate with Zod (E1–E6) and checkEvolutionRefs (E7–E10). Errors throw; warnings are logged.
 */
function loadEvolution(slug: string): ArticleEvolution | undefined {
  const base = `/src/articles/${slug}/data/`;
  const evoMod = dataModules[`${base}evolution.json`];
  const topoMod = dataModules[`${base}topology.json`];
  const costMod = dataModules[`${base}cost-models.json`];
  if (!evoMod && !topoMod) return undefined;
  if (!evoMod || !topoMod) fail(`${base}: evolution.json and topology.json must exist together`);
  const evo = EvolutionSchema.safeParse(evoMod!.default);
  if (!evo.success) fail(`${base}evolution.json failed validation:\n${z_format(evo.error)}`);
  const topo = TopologySchema.safeParse(topoMod!.default);
  if (!topo.success) fail(`${base}topology.json failed validation:\n${z_format(topo.error)}`);
  let costModels: CostModel | undefined;
  if (costMod) {
    const cost = CostModelSchema.safeParse(costMod.default);
    if (!cost.success) fail(`${base}cost-models.json failed validation:\n${z_format(cost.error)}`);
    costModels = (cost as { data: CostModel }).data;
  }
  const articleDir = nodePath.join(process.cwd(), 'src', 'articles', slug);
  const fileExists = (rel: string) => fs.existsSync(nodePath.join(articleDir, rel));
  const evolution = (evo as { data: Evolution }).data;
  const topology = (topo as { data: Topology }).data;
  // E9 is an error only once generated.lock.json exists (owner deviation 2026-11-23; Stage 6 tightens).
  const { errors, warnings } = checkEvolutionRefs({
    evolution,
    topology,
    costModels,
    fileExists,
    figuresRequired: fileExists('generated.lock.json'),
  });
  if (errors.length > 0) fail(`article "${slug}": evolution cross-file checks failed:\n${formatIssues(errors)}`);
  if (warnings.length > 0 && !warnedSlugs.has(slug)) {
    warnedSlugs.add(slug);
    console.warn(`[registry] article "${slug}": ${warnings.length} evolution warning(s):\n${formatIssues(warnings)}`);
  }
  return { evolution, topology, costModels, warnings };
}
const warnedSlugs = new Set<string>();

function build(): { entries: RegistryEntry[]; series: SeriesEntry[]; prototypes: Prototype[] } {
  const series = loadSeries();
  const entries: RegistryEntry[] = [];
  const seenSlugs = new Set<string>();

  for (const [path, mod] of Object.entries(manifestModules)) {
    const folder = path.split('/')[3];
    const parsed = ArticleManifestSchema.safeParse(mod.default);
    if (!parsed.success) fail(`${path} failed validation:\n${z_format(parsed.error)}`);
    const manifest = (parsed as { data: ArticleManifest }).data;
    if (manifest.slug !== folder) fail(`${path}: folder "${folder}" does not equal slug "${manifest.slug}"`);
    if (seenSlugs.has(manifest.slug)) fail(`duplicate article slug "${manifest.slug}"`);
    seenSlugs.add(manifest.slug);

    const pages: RegistryPage[] = manifest.pages.map((p) => {
      const key = `/src/articles/${manifest.slug}/${p.entry}`;
      const module = pageModules[key];
      if (!module) fail(`${path}: page entry "${p.entry}" not found (expected ${key})`);
      return {
        slug: p.slug,
        title: p.title,
        navLabel: p.navLabel ?? p.title,
        summary: p.summary,
        entry: p.entry,
        url: p.slug ? `/${manifest.slug}/${p.slug}/` : `/${manifest.slug}/`,
        isIndex: !p.slug,
        module,
      };
    });
    entries.push({
      manifest,
      slug: manifest.slug,
      status: deriveStatus(manifest.phase) as RegistryEntry['status'],
      pages,
      evolution: loadEvolution(manifest.slug),
    });
  }

  const bySlug = new Map(entries.map((e) => [e.slug, e]));
  const memberships = new Map<string, string[]>();
  for (const s of series) {
    for (const a of s.articles) {
      if (!bySlug.has(a)) fail(`series.json: series "${s.slug}" references unknown article "${a}"`);
      memberships.set(a, [...(memberships.get(a) ?? []), s.slug]);
    }
  }
  for (const e of entries) {
    const m = memberships.get(e.slug) ?? [];
    const ps = e.manifest.primarySeries;
    if (ps && !m.includes(ps)) {
      fail(`article "${e.slug}": primarySeries "${ps}" is not among its series memberships [${m.join(', ')}]`);
    }
    if (m.length >= 1 && !ps) {
      fail(`article "${e.slug}" is in ${m.length} series [${m.join(', ')}] but declares no primarySeries`);
    }
  }

  const protoBase: Array<{ slug: string; version: number; html: string }> = [];
  for (const [path, html] of Object.entries(prototypeModules)) {
    const parts = path.split('/');
    const m = /^v(\d+)\.html$/.exec(parts[5] ?? '');
    if (!m) continue;
    protoBase.push({ slug: parts[3], version: Number(m[1]), html });
  }
  const maxBySlug = new Map<string, number>();
  for (const p of protoBase) maxBySlug.set(p.slug, Math.max(maxBySlug.get(p.slug) ?? 0, p.version));
  const prototypes: Prototype[] = protoBase
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.version - b.version)
    .map((p) => {
      const latest = maxBySlug.get(p.slug) === p.version;
      return { ...p, latest, url: latest ? `/${p.slug}/prototype/` : `/${p.slug}/prototype/v${p.version}/` };
    });

  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  return { entries, series, prototypes };
}

const registry = build();

export const getAllArticles = (): RegistryEntry[] => registry.entries;
export const getPublishedArticles = (): RegistryEntry[] => registry.entries.filter((e) => e.status === 'published');
export const getDraftArticles = (): RegistryEntry[] => registry.entries.filter((e) => e.status === 'draft');
export const getArticle = (slug: string): RegistryEntry | undefined => registry.entries.find((e) => e.slug === slug);
/** Validated evolution bundle (evolution + topology + cost models) for an article, if it has one. */
export const getEvolution = (slug: string): ArticleEvolution | undefined => getArticle(slug)?.evolution;
export const getSeries = (): SeriesEntry[] => registry.series;
/** Series (in series.json order) that contain the article. */
export const getMemberships = (slug: string): SeriesEntry[] => registry.series.filter((s) => s.articles.includes(slug));
/** All prototypes, numerically sorted by version per slug; `latest` marks the highest N. Optionally filter by slug. */
export const getPrototypes = (slug?: string): Prototype[] =>
  slug ? registry.prototypes.filter((p) => p.slug === slug) : registry.prototypes;
