/**
 * Deterministic plain-text synthesis for `/llms.txt` and `/<slug>/llms-full.txt` (plan 4.5).
 *
 * - Published articles only (§3): callers pass registry entries filtered by `getPublishedArticles()`; draft slugs
 *   never reach any output (ArticleRef / lab components are stripped, relations to drafts are skipped).
 * - No timestamps beyond article dates. Ordering comes from series.json / registry order.
 * - MDX is rendered to text by reading the raw source: import/export lines and JSX tags are dropped, Markdown and
 *   fenced code are kept, and `<EvolutionStage>` / `<EvolutionLadder>` are replaced by text built from
 *   `data/evolution.json` (the stripped JSX would otherwise lose them).
 *
 * Vite-only (registry + import.meta.glob).
 */
import { spConfig } from '../../../sp.config.ts';
import { getEvolution, getPublishedArticles, getSeries, type RegistryEntry, type RegistryPage } from '../articles/registry';
import { activeSet, costBand, stageDiff } from '../articles/evolution';
import type { CostModel, EvolutionStage, Topology } from '../articles/schema';
import { buildGraphIndex, getRelations } from '../graph/build-graph';

const rawPages = import.meta.glob<string>('/src/articles/*/pages/*.mdx', { query: '?raw', import: 'default', eager: true });
const rawNotes = import.meta.glob<string>('/src/articles/*/llms-notes.md', { query: '?raw', import: 'default', eager: true });
const logFiles = Object.keys(import.meta.glob('/src/articles/*/logs/*.md'));

const abs = (path: string): string => new URL(path, spConfig.siteUrl).href;
export const llmsFullPath = (slug: string): string => `/${slug}/llms-full.txt`;
export const llmsFullUrl = (slug: string): string => abs(llmsFullPath(slug));

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

// ---------------------------------------------------------------------------
// Evolution text
// ---------------------------------------------------------------------------

function nodeLabeler(topology: Topology): (id: string) => string {
  const byId = new Map(topology.nodes.map((n) => [n.id, n]));
  return (id) => {
    const n = byId.get(id);
    if (!n) return id;
    return n.awsLabel && n.awsLabel !== n.label ? `${n.label} (${n.awsLabel})` : n.label;
  };
}

function tierTotal(costModels: CostModel | undefined, tierId: string | undefined): { label: string; total: number } | undefined {
  const tier = costModels?.tiers.find((t) => t.id === tierId);
  if (!tier) return undefined;
  return { label: tier.label, total: tier.components.reduce((sum, c) => sum + c.monthlyListUsd, 0) };
}

/** One stage as text. The first line is `L<n> · <title>` so `rg -n '^L[0-9]'` lists levels in order. */
function stageText(slug: string, stage: EvolutionStage): string {
  const bundle = getEvolution(slug);
  if (!bundle) return '';
  const { evolution, topology, costModels } = bundle;
  const label = nodeLabeler(topology);
  const list = (ids: string[]) => ids.map(label).join('; ');
  const out: string[] = [];
  out.push(`L${stage.level} · ${stage.title}`);
  out.push(`Mode: ${stage.mode}`);
  if (stage.trigger) out.push(`Trigger (${stage.trigger.kind}): ${stage.trigger.headline}. ${stage.trigger.scenario}`);
  out.push(`Requirements: ${stage.requirements.map((r) => `${r.label} ${r.value}`).join('; ')}`);
  out.push('Key points:');
  for (const k of stage.keyPoints) out.push(`- ${k}`);
  const d = stage.decision;
  out.push('Decision:');
  out.push(`- Add: ${d.add.length ? list(d.add) : 'none'}`);
  out.push(`- Change: ${d.change.length ? list(d.change) : 'none'}`);
  out.push(`- Remove: ${d.remove.length ? list(d.remove) : 'none'}`);
  out.push(`- Defer: ${d.defer.length ? d.defer.map((x) => `${x.item} (until ${x.until})`).join('; ') : 'none'}`);
  out.push(`Build vs buy: ${stage.buildVsBuy.verdict}. ${stage.buildVsBuy.rationale}`);
  out.push(`Options considered: ${stage.buildVsBuy.options.join('; ')}`);
  const tier = tierTotal(costModels, stage.costTierId);
  if (tier && costModels) {
    out.push(
      `Cost band: ${costBand(tier.total)} · about ${money(tier.total)}/month (${tier.label}). AWS list price at modelled volume, ${costModels.region}, pricing as of ${costModels.pricingAsOf}.`,
    );
  }
  if (stage.exitCriteria.length) {
    out.push('Exit criteria:');
    for (const e of stage.exitCriteria) out.push(`- ${e}`);
  }
  const diff = stageDiff(evolution, stage.level);
  const parts = [
    diff.added.length ? `adds ${list(diff.added)}` : '',
    diff.changed.length ? `changes ${list(diff.changed)}` : '',
    diff.removed.length ? `removes ${list(diff.removed)}` : '',
  ].filter(Boolean);
  out.push(`Topology: ${activeSet(evolution, stage.level).length} components active; this level ${parts.length ? parts.join(', ') : 'changes nothing'}.`);
  return out.join('\n');
}

/** Compact ladder: bullets (not `L<n>` line starts, so the stage blocks own those). */
function ladderText(slug: string): string {
  const bundle = getEvolution(slug);
  if (!bundle) return '';
  const { evolution, costModels } = bundle;
  const rows = evolution.stages.map((s) => {
    const tier = tierTotal(costModels, s.costTierId);
    const band = tier ? ` · ${costBand(tier.total)}` : '';
    return `- Level ${s.level} · ${s.title} [${s.mode}]${band}${s.trigger ? `: ${s.trigger.headline}` : ''}`;
  });
  return ['Evolution ladder:', ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// MDX → text
// ---------------------------------------------------------------------------

const LEVEL_ATTR = /\blevel\s*=\s*(?:\{\s*(\d+)\s*\}|"(\d+)"|'(\d+)')/;
// Opening/closing/self-closing PascalCase JSX tags. Attribute values here never contain `>` (static MDX).
const JSX_TAG = /<(\/?)([A-Z][A-Za-z0-9.]*)((?:\s(?:[^>"'{}]|"[^"]*"|'[^']*'|\{[^}]*\})*)?)(\/?)>/g;

function stripProse(slug: string, prose: string): string {
  let s = prose.replace(/<!--[\s\S]*?-->/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  s = s.replace(JSX_TAG, (_m, close: string, name: string, attrs: string) => {
    if (name === 'EvolutionLadder') return close ? '' : `\n\n${ladderText(slug)}\n\n`;
    if (name === 'EvolutionStage' || name === 'EvolutionStages') {
      if (close) return '';
      const stages = getEvolution(slug)?.evolution.stages ?? [];
      if (name === 'EvolutionStages') return `\n\n${stages.map((st) => stageText(slug, st)).join('\n\n')}\n\n`;
      const lv = LEVEL_ATTR.exec(attrs);
      const level = lv ? Number(lv[1] ?? lv[2] ?? lv[3]) : -1;
      const stage = stages.find((x) => x.level === level);
      return stage ? `\n\n${stageText(slug, stage)}\n\n` : '';
    }
    return ''; // ArticleRef, labs, any other component: dropped (no draft slug can leak through attributes)
  });
  // Demote Markdown headings one level (the article owns H1, pages own H2).
  return s.replace(/^(#{1,5})(\s+\S)/gm, '#$1$2');
}

/** Raw MDX → text: drop import/export lines and JSX, keep Markdown and fenced code verbatim. */
export function mdxToText(slug: string, raw: string): string {
  const out: string[] = [];
  let prose: string[] = [];
  let fence: { ch: string; len: number } | null = null;
  const flush = () => {
    if (prose.length) out.push(stripProse(slug, prose.join('\n')));
    prose = [];
  };
  for (const line of raw.split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) {
        flush();
        fence = { ch: f[1][0], len: f[1].length };
        out.push(line);
      } else {
        out.push(line);
        if (f[1][0] === fence.ch && f[1].length >= fence.len) fence = null;
      }
      continue;
    }
    if (fence) out.push(line);
    else if (!/^(import|export)\s/.test(line)) prose.push(line);
  }
  flush();
  return out.join('\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Topology + cost summaries (the lab page is interactive; this keeps its facts in text)
// ---------------------------------------------------------------------------

function topologyText(slug: string): string {
  const bundle = getEvolution(slug);
  if (!bundle) return '';
  const { topology, evolution } = bundle;
  const label = nodeLabeler(topology);
  const introduced = new Map<string, number>();
  for (const s of evolution.stages) for (const id of s.decision.add) introduced.set(id, s.level);
  const lines = ['## Topology', ''];
  for (const n of topology.nodes) {
    const lv = introduced.get(n.id);
    const fb = n.failure?.fallback ? ` Fallback: ${n.failure.fallback}` : '';
    lines.push(`- ${label(n.id)} [${n.kind}]${lv !== undefined ? `, added at L${lv}` : ''}.${fb}`);
  }
  const edges = topology.edges.map((e) => `${label(e.from)} -> ${label(e.to)} (${e.kind}${e.label ? `: ${e.label}` : ''})`);
  if (edges.length) lines.push('', 'Edges:', ...edges.map((e) => `- ${e}`));
  return lines.join('\n');
}

function costText(slug: string): string {
  const cm = getEvolution(slug)?.costModels;
  if (!cm) return '';
  const lines = [
    '## Cost model',
    '',
    `AWS list price at modelled volume, ${cm.region}, pricing as of ${cm.pricingAsOf}. Enterprise discount range (assumption): ${cm.enterpriseDiscountRangePct[0]}-${cm.enterpriseDiscountRangePct[1]}% off list.`,
    '',
  ];
  for (const t of cm.tiers) {
    const total = t.components.reduce((s, c) => s + c.monthlyListUsd, 0);
    lines.push(`### ${t.label}: ${costBand(total)} · about ${money(total)}/month at ${t.monthlyRequestsM}M requests/month`);
    for (const c of t.components) lines.push(`- ${c.name} (${c.awsService}): ${money(c.monthlyListUsd)}. ${c.assumption}`);
    lines.push('');
  }
  lines.push('Pricing sources:', ...cm.sources.map((s) => `- ${s.label}: ${s.url}`));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------

function pageText(entry: RegistryEntry, page: RegistryPage): string {
  const raw = rawPages[`/src/articles/${entry.slug}/${page.entry}`] ?? '';
  const hasIsland = /\bclient:[a-z]+/.test(raw);
  const body = mdxToText(entry.slug, raw);
  const head = `## Page: ${page.title}\nURL: ${abs(page.url)}\n${page.summary}`;
  const note = hasIsland ? '\n\n(Interactive components on this page are omitted here; their data is under Topology and Cost model below.)' : '';
  return `${head}\n\n${body}${note}`;
}

export function buildLlmsFull(entry: RegistryEntry): string {
  const { manifest, slug } = entry;
  const published = getPublishedArticles();
  const seriesTitles = getSeries()
    .filter((s) => s.articles.includes(slug))
    .map((s) => s.title);
  const related = getRelations(slug)
    .filter((r) => !r.upcoming && r.url)
    .map((r) => `- ${r.kind}: ${r.title} — ${abs(r.url!)}${r.reason ? ` (${r.reason})` : ''}`);

  const header = [
    `# ${manifest.title}`,
    '',
    `> ${manifest.subtitle}`,
    '',
    `- Source: ${abs(`/${slug}/`)}`,
    `- Author: ${spConfig.author.name} (${spConfig.siteUrl})`,
    `- Archetype: ${manifest.archetype}`,
    `- Published: ${manifest.publishedAt ?? 'n/a'}`,
    `- Updated: ${manifest.updatedAt}`,
    `- Version: ${manifest.version}`,
    ...(seriesTitles.length ? [`- Series: ${seriesTitles.join('; ')}`] : []),
    ...(manifest.tags.length ? [`- Tags: ${manifest.tags.join(', ')}`] : []),
    ...(manifest.concepts.length ? [`- Concepts: ${manifest.concepts.join(', ')}`] : []),
    `- Pages: ${entry.pages.map((p) => `${p.title} (${abs(p.url)})`).join('; ')}`,
    `- Site index: ${abs('/llms.txt')} (${published.length} published article${published.length === 1 ? '' : 's'})`,
    ...(related.length ? ['- Related:', ...related.map((r) => `  ${r}`)] : []),
  ].join('\n');

  const sections: string[] = [header];
  if (manifest.quickRead) {
    const q = manifest.quickRead;
    sections.push(
      ['## Summary', '', q.tldr, '', ...q.keyTakeaways.map((t) => `- ${t}`)].join('\n'),
    );
  }
  for (const page of entry.pages) sections.push(pageText(entry, page));
  const topo = topologyText(slug);
  if (topo) sections.push(topo);
  const cost = costText(slug);
  if (cost) sections.push(cost);

  const notes = rawNotes[`/src/articles/${slug}/llms-notes.md`];
  if (notes?.trim()) sections.push(`## Notes for readers of this text\n\n${notes.trim().replace(/^(#{1,5})(\s+\S)/gm, '#$1$2')}`);

  const logs = logFiles.filter((p) => p.startsWith(`/src/articles/${slug}/logs/`)).sort();
  if (logs.length) {
    sections.push(
      ['## Decision logs', '', ...logs.map((p) => `- ${spConfig.repoUrl}/blob/main${p}`)].join('\n'),
    );
  }
  return `${sections.join('\n\n')}\n`;
}

const RELATION_KINDS = ['prerequisite', 'builds-on', 'deep-dive-of', 'uses-building-block', 'related'] as const;

export function buildLlmsTxt(): string {
  const { index } = buildGraphIndex();
  const lines: string[] = [
    `# ${spConfig.author.handle}`,
    '',
    `> Interactive, evolution-first engineering deep-dives by ${spConfig.author.name}. Each article starts at the simplest design that works and earns every component with a concrete trigger, a build-vs-buy call, a sourced AWS list-price cost band and exit criteria.`,
    '',
    'How to navigate:',
    `- Each article has a plain-text edition at \`/<slug>/llms-full.txt\` (summary, full prose, evolution levels L0..Ln, topology and cost model). Prefer it over scraping HTML.`,
    `- Articles belong to series (ordered below) and link to each other through typed relations.`,
    `- RSS: ${abs('/rss.xml')}`,
    `- Source: ${spConfig.repoUrl}`,
    '',
    '## Series',
    '',
  ];
  for (const s of index.series) {
    lines.push(`- [${s.title}](${abs(`/series/${s.slug}/`)}): ${s.description}`);
    for (const slug of s.articles) {
      const a = index.articles.find((x) => x.slug === slug);
      if (a) lines.push(`  - ${a.title}`);
    }
  }
  lines.push('', '## Articles', '');
  for (const a of index.articles) {
    lines.push(`- [${a.title}](${abs(`/${a.slug}/`)}): ${a.subtitle} Full text: ${llmsFullUrl(a.slug)}`);
  }
  const counts = new Map<string, number>(RELATION_KINDS.map((k) => [k, 0]));
  for (const e of index.edges) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  lines.push(
    '',
    '## Graph',
    '',
    `${index.articles.length} article${index.articles.length === 1 ? '' : 's'}, ${index.series.length} series, ${index.edges.length} relation edge${index.edges.length === 1 ? '' : 's'} between published articles.`,
    ...[...counts].map(([k, n]) => `- ${k}: ${n}`),
  );
  return `${lines.join('\n')}\n`;
}
