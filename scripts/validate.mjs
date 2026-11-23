#!/usr/bin/env node
// Pre-build validator (implementation plan, Stage 5.1).
//
//   node scripts/validate.mjs            (npm run validate)
//
// Plain Node (P13): sp.config.ts, schema.ts and evolution.ts load via native type stripping;
// no Vite, no import.meta.glob. Cross-file evolution rules come from checkEvolutionRefs() (P24),
// never reimplemented here. Staleness recomputes each generated.lock.json inputHash with the
// helpers exported by scripts/render-{visuals,audio,pdf}.mjs, so the hash logic has one owner.
//
// Output: findings grouped by file as `file:field  message [rule]`. Exit 1 on any error;
// warnings never fail the run.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { spConfig } from '../sp.config.ts';
import {
  ArticleManifestSchema,
  AudioChaptersOutputSchema,
  AudioScriptSchema,
  CostModelSchema,
  EvolutionSchema,
  GeneratedLockSchema,
  LinkedInMetadataSchema,
  RESERVED_SLUGS,
  SeriesFileSchema,
  TopologySchema,
  deriveStatus,
} from '../src/lib/articles/schema.ts';
import { checkEvolutionRefs } from '../src/lib/articles/evolution.ts';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'src/articles');
const SERIES_FILE = path.join(REPO_ROOT, 'src/series/series.json');
const GLOBAL_CSS = path.join(REPO_ROOT, 'src/styles/global.css');
const LINKEDIN_MAX_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** group (repo-relative file) -> findings */
const findings = new Map();
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');
function add(level, file, field, message, rule) {
  const group = file.startsWith('/') ? rel(file) : file;
  if (!findings.has(group)) findings.set(group, []);
  findings.get(group).push({ level, field, message, rule });
}
const error = (file, field, message, rule = '') => add('error', file, field, message, rule);
const warn = (file, field, message, rule = '') => add('warning', file, field, message, rule);

const zodIssues = (err) => err.issues.map((i) => ({ field: i.path.map(String).join('.') || '(root)', message: i.message }));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function readJsonFile(file, field = '(root)') {
  try {
    return { ok: true, raw: fs.readFileSync(file, 'utf8'), data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    error(file, field, `Cannot read/parse JSON: ${e.message}`, 'json');
    return { ok: false };
  }
}

/** Parse `file` with `schema`; report every Zod issue as `file:field`. */
function parseWith(schema, file, rule) {
  const j = readJsonFile(file);
  if (!j.ok) return undefined;
  const r = schema.safeParse(j.data);
  if (!r.success) {
    for (const i of zodIssues(r.error)) error(file, i.field, i.message, rule);
    return undefined;
  }
  return { data: r.data, raw: j.raw };
}

// ---------------------------------------------------------------------------
// Articles + series
// ---------------------------------------------------------------------------

const exists = (p) => fs.existsSync(p);
const articleDirs = exists(ARTICLES_DIR)
  ? fs
      .readdirSync(ARTICLES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  : [];

/** slug -> { dir, folder, manifest, status } (only folders whose manifest parsed) */
const articles = new Map();

for (const folder of articleDirs) {
  const dir = path.join(ARTICLES_DIR, folder);
  const mf = path.join(dir, 'article.json');
  if (!exists(mf)) {
    error(dir, '(folder)', 'Article folder has no article.json', 'manifest');
    continue;
  }
  if (RESERVED_SLUGS.has(folder)) error(mf, 'slug', `Folder name "${folder}" is a reserved slug`, 'reserved');
  const parsed = parseWith(ArticleManifestSchema, mf, 'schema');
  if (!parsed) continue;
  const manifest = parsed.data;
  if (manifest.slug !== folder) {
    error(mf, 'slug', `Folder "${folder}" does not equal slug "${manifest.slug}"`, 'folder-slug');
    continue;
  }
  articles.set(manifest.slug, { dir, folder, mf, manifest, status: deriveStatus(manifest.phase) });
}

// series.json
const memberships = new Map(); // article slug -> [series slug]
const seriesParsed = exists(SERIES_FILE) ? parseWith(SeriesFileSchema, SERIES_FILE, 'schema') : (error(SERIES_FILE, '(file)', 'Missing', 'series'), undefined);
if (seriesParsed) {
  const seen = new Set();
  seriesParsed.data.forEach((s, i) => {
    if (seen.has(s.slug)) error(SERIES_FILE, `${i}.slug`, `Duplicate series slug "${s.slug}"`, 'series');
    seen.add(s.slug);
    const inSeries = new Set();
    s.articles.forEach((a, j) => {
      if (inSeries.has(a)) error(SERIES_FILE, `${i}.articles.${j}`, `Series "${s.slug}" lists "${a}" more than once (duplicate membership)`, 'series');
      inSeries.add(a);
      if (!articles.has(a) && !articleDirs.includes(a)) error(SERIES_FILE, `${i}.articles.${j}`, `Unknown article "${a}"`, 'series');
      memberships.set(a, [...new Set([...(memberships.get(a) ?? []), s.slug])]);
    });
    if (s.pillarSlug && !s.articles.includes(s.pillarSlug)) {
      error(SERIES_FILE, `${i}.pillarSlug`, `pillarSlug "${s.pillarSlug}" is not one of the series' articles`, 'series');
    }
  });
}

// ---------------------------------------------------------------------------
// Per-article checks
// ---------------------------------------------------------------------------

const relationEdges = []; // { from, to, kind, file, field }

for (const [slug, a] of articles) {
  const { dir, mf, manifest } = a;
  const published = a.status === 'published';
  const f = (relPath) => path.join(dir, relPath);
  const has = (relPath) => exists(f(relPath));

  // primarySeries iff in >= 1 series, and one of its memberships.
  const m = memberships.get(slug) ?? [];
  if (manifest.primarySeries && !m.includes(manifest.primarySeries)) {
    error(mf, 'primarySeries', `"${manifest.primarySeries}" is not among its series memberships [${m.join(', ') || 'none'}]`, 'series');
  }
  if (m.length > 0 && !manifest.primarySeries) error(mf, 'primarySeries', `Required: article is in series [${m.join(', ')}]`, 'series');

  // pages[].entry exist; unreferenced MDX is a warning.
  const entries = new Set();
  manifest.pages.forEach((p, i) => {
    entries.add(p.entry);
    if (!has(p.entry)) error(mf, `pages.${i}.entry`, `File not found: ${p.entry}`, 'pages');
  });
  if (has('pages')) {
    for (const file of fs.readdirSync(f('pages')).filter((x) => x.endsWith('.mdx'))) {
      if (!entries.has(`pages/${file}`)) warn(f(`pages/${file}`), '(file)', 'MDX page is not referenced by article.json pages[]', 'pages');
    }
  }
  const pageSlugs = new Set(manifest.pages.map((p) => p.slug).filter(Boolean));

  // relations
  manifest.relations.forEach((r, i) => {
    const field = `relations.${i}`;
    if (r.targetSlug === slug) error(mf, `${field}.targetSlug`, 'Relation targets the article itself', 'relations');
    relationEdges.push({ from: slug, to: r.targetSlug, kind: r.kind, file: mf, field });
  });

  // audio/script.json (+ unique chapter ids, targetPage resolves)
  if (has('audio/script.json')) {
    const s = parseWith(AudioScriptSchema, f('audio/script.json'), 'schema');
    if (s) {
      const seen = new Set();
      s.data.chapters.forEach((c, i) => {
        if (seen.has(c.id)) error(f('audio/script.json'), `chapters.${i}.id`, `Duplicate chapter id "${c.id}"`, 'audio');
        seen.add(c.id);
        if (c.targetPage && !pageSlugs.has(c.targetPage)) error(f('audio/script.json'), `chapters.${i}.targetPage`, `Unknown page "${c.targetPage}"`, 'audio');
      });
    }
  }
  if (has('audio/chapters.json')) {
    const c = parseWith(AudioChaptersOutputSchema, f('audio/chapters.json'), 'schema');
    if (c) {
      const seen = new Set();
      c.data.chapters.forEach((ch, i) => {
        if (seen.has(ch.id)) error(f('audio/chapters.json'), `chapters.${i}.id`, `Duplicate chapter id "${ch.id}"`, 'audio');
        seen.add(ch.id);
        if (ch.targetPage && !pageSlugs.has(ch.targetPage)) error(f('audio/chapters.json'), `chapters.${i}.targetPage`, `Unknown page "${ch.targetPage}"`, 'audio');
        if (ch.endSec < ch.startSec) error(f('audio/chapters.json'), `chapters.${i}.endSec`, 'endSec < startSec', 'audio');
      });
    }
  }

  // data/cost-models.json
  let costModels;
  if (has('data/cost-models.json')) {
    const c = parseWith(CostModelSchema, f('data/cost-models.json'), 'schema');
    if (c) {
      costModels = c.data;
      const ids = new Set();
      c.data.tiers.forEach((t, i) => {
        if (ids.has(t.id)) error(f('data/cost-models.json'), `tiers.${i}.id`, `Duplicate tier id "${t.id}"`, 'cost');
        ids.add(t.id);
        t.components.forEach((comp, j) => {
          // §11: every figure sourced (pricingAsOf + sources, enforced by the schema) or labelled ASSUMPTION:.
          if (comp.monthlyListUsd > 0 && !/ASSUMPTION:/.test(comp.assumption) && !/\$\s?\d/.test(comp.assumption)) {
            warn(f('data/cost-models.json'), `tiers.${i}.components.${j}.assumption`, 'Neither shows the priced arithmetic nor is labelled "ASSUMPTION:"', 'cost');
          }
        });
      });
    }
  }

  // Evolution (E1-E6 via schema, E7-E10 via checkEvolutionRefs)
  const hasEvo = has('data/evolution.json');
  const hasTopo = has('data/topology.json');
  const lockExists = has('generated.lock.json');
  if (hasEvo !== hasTopo) {
    error(hasEvo ? f('data/evolution.json') : f('data/topology.json'), '(file)', 'data/evolution.json and data/topology.json must exist together', 'evolution');
  } else if (hasEvo) {
    const evo = parseWith(EvolutionSchema, f('data/evolution.json'), 'E1-E6');
    const topo = parseWith(TopologySchema, f('data/topology.json'), 'schema');
    if (evo && topo) {
      if (evo.data.stages.some((s) => s.costTierId) && !costModels && !has('data/cost-models.json')) {
        error(f('data/evolution.json'), 'stages', 'Stages reference costTierId but data/cost-models.json is missing', 'E7');
      }
      const { errors, warnings } = checkEvolutionRefs({
        evolution: evo.data,
        topology: topo.data,
        costModels,
        fileExists: (p) => has(p),
        // E9: error once generated.lock.json exists or the article is published (§4.2.1 table).
        figuresRequired: lockExists || published,
      });
      const split = (issue) => {
        const [file, field] = issue.path.split(':');
        return [f(`data/${file}`), field ?? '(root)'];
      };
      for (const i of errors) error(...split(i), i.message, i.rule);
      for (const i of warnings) warn(...split(i), i.message, i.rule);
    }
  }
  if (published && manifest.archetype === 'design-x' && !(hasEvo && hasTopo)) {
    error(mf, 'archetype', 'Published design-x needs data/evolution.json and data/topology.json', 'publish-gate');
  }

  // social/linkedin.json (status is non-blocking) + linkedin-card size
  if (has('social/linkedin.json')) {
    const l = parseWith(LinkedInMetadataSchema, f('social/linkedin.json'), 'schema');
    if (l && l.data.syncedArticleVersion < manifest.version) {
      warn(f('social/linkedin.json'), 'syncedArticleVersion', `Synced to v${l.data.syncedArticleVersion}; article is v${manifest.version}`, 'linkedin');
    }
  }
  if (has('social/linkedin-card.png')) {
    const size = fs.statSync(f('social/linkedin-card.png')).size;
    if (size >= LINKEDIN_MAX_BYTES) error(f('social/linkedin-card.png'), '(size)', `${(size / 1048576).toFixed(2)} MB; must be < 5 MB`, 'linkedin');
  }

  // generated.lock.json schema (staleness runs later, once pipelines are loaded)
  if (lockExists) {
    const l = parseWith(GeneratedLockSchema, f('generated.lock.json'), 'schema');
    a.lock = l?.data;
  }

  // Completeness of generated artifacts per features.* (error when published, warning on drafts; §7)
  const gate = published ? error : warn;
  if (manifest.features.audio) {
    for (const p of ['audio/episode.mp3', 'audio/chapters.json']) {
      if (!has(p)) gate(mf, 'features.audio', `features.audio is true but ${p} is missing`, 'publish-gate');
      else if (!a.lock?.artifacts[p]) gate(f('generated.lock.json'), `artifacts.${p}`, 'No lock entry (run npm run audio)', 'publish-gate');
    }
    if (!has('audio/script.json')) gate(mf, 'features.audio', 'features.audio is true but audio/script.json is missing', 'publish-gate');
  }
  if (manifest.features.pdf) {
    const p = `exports/${slug}.pdf`;
    if (!has(p)) gate(mf, 'features.pdf', `features.pdf is true but ${p} is missing`, 'publish-gate');
    else if (!a.lock?.artifacts[p]) gate(f('generated.lock.json'), `artifacts.${p}`, 'No lock entry (run npm run pdf)', 'publish-gate');
  }

  // Publish gate (§11): schema already enforces publishedAt/quickRead/thumbnailAlt when published.
  if (published) {
    for (const p of ['social/thumbnail-light.webp', 'social/thumbnail-dark.webp', 'social/thumbnail.png', 'llms-notes.md', 'tests/article.e2e.ts']) {
      if (!has(p)) error(f(p), '(file)', 'Missing (publish gate §11)', 'publish-gate');
    }
  }
}

// Relations: targets exist, targetPage exists, published -> draft only as "upcoming".
for (const e of relationEdges) {
  const from = articles.get(e.from);
  const target = articles.get(e.to);
  const r = from.manifest.relations[Number(e.field.split('.')[1])];
  if (!target) {
    error(e.file, `${e.field}.targetSlug`, `Unknown relation target "${e.to}"`, 'relations');
    continue;
  }
  if (r.targetPage && !target.manifest.pages.some((p) => p.slug === r.targetPage)) {
    error(e.file, `${e.field}.targetPage`, `"${e.to}" has no page "${r.targetPage}"`, 'relations');
  }
  if (from.status === 'published' && target.status === 'draft') {
    warn(e.file, `${e.field}.targetSlug`, `Published -> draft "${e.to}": rendered as an unlinked upcoming card (allowed)`, 'relations');
  }
}

// Cycle check over prerequisite + deep-dive-of (DFS, reports the cycle path once per cycle).
{
  const adj = new Map();
  for (const e of relationEdges) {
    if (e.kind !== 'prerequisite' && e.kind !== 'deep-dive-of') continue;
    if (!articles.has(e.to)) continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e);
  }
  const state = new Map(); // 1 = on stack, 2 = done
  const reported = new Set();
  const stack = [];
  const visit = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const e of adj.get(node) ?? []) {
      if (state.get(e.to) === 1) {
        const cycle = [...stack.slice(stack.indexOf(e.to)), e.to];
        const key = [...cycle.slice(0, -1)].sort().join('|');
        if (!reported.has(key)) {
          reported.add(key);
          error(e.file, `${e.field}.kind`, `Cycle over prerequisite/deep-dive-of: ${cycle.join(' -> ')}`, 'cycle');
        }
      } else if (!state.get(e.to)) visit(e.to);
    }
    stack.pop();
    state.set(node, 2);
  };
  for (const n of [...adj.keys()].sort()) if (!state.get(n)) visit(n);
}

// ---------------------------------------------------------------------------
// Staleness: recompute every lock entry's inputHash with the pipeline's own helper
// ---------------------------------------------------------------------------

const PIPELINES = {
  visuals: { file: 'scripts/render-visuals.mjs', fns: ['computeToolVersion', 'computeVisualsInputHash'] },
  audio: { file: 'scripts/render-audio.mjs', fns: ['computeToolVersion', 'computeAudioInputHash'] },
  pdf: { file: 'scripts/render-pdf.mjs', fns: ['computeToolVersion', 'computePdfInputHash'] },
};
const loaded = {};
async function pipeline(name) {
  if (name in loaded) return loaded[name];
  const spec = PIPELINES[name];
  const file = path.join(REPO_ROOT, spec.file);
  try {
    if (!exists(file)) throw new Error('script not found');
    const mod = await import(pathToFileURL(file).href);
    const missing = spec.fns.filter((fn) => typeof mod[fn] !== 'function');
    if (missing.length) throw new Error(`does not export ${missing.join(', ')}`);
    loaded[name] = { mod, toolVersion: mod.computeToolVersion() };
  } catch (e) {
    warn(spec.file, '(module)', `Cannot load ${name} hash helpers (${e.message}); ${name} lock entries not checked for staleness`, 'stale');
    loaded[name] = null;
  }
  return loaded[name];
}

for (const [slug, a] of articles) {
  if (!a.lock) continue;
  const lockFile = path.join(a.dir, 'generated.lock.json');
  const byPipeline = new Map();
  for (const [artifact, entry] of Object.entries(a.lock.artifacts)) {
    if (!byPipeline.has(entry.pipeline)) byPipeline.set(entry.pipeline, []);
    byPipeline.get(entry.pipeline).push([artifact, entry]);
  }
  for (const [name, list] of byPipeline) {
    const p = await pipeline(name);
    let current;
    if (p) {
      try {
        if (name === 'visuals') current = p.mod.computeVisualsInputHash(a.dir, p.toolVersion);
        else if (name === 'pdf') current = p.mod.computePdfInputHash(a.dir, p.toolVersion);
        else if (name === 'audio') {
          const script = path.join(a.dir, 'audio/script.json');
          if (!exists(script)) error(lockFile, 'artifacts', 'Audio lock entries exist but audio/script.json is missing', 'stale');
          else current = p.mod.computeAudioInputHash(fs.readFileSync(script, 'utf8'), spConfig.audio, p.toolVersion);
        }
      } catch (e) {
        error(lockFile, 'artifacts', `${name}: cannot recompute inputHash: ${e.message}`, 'stale');
      }
    }
    const stale = [];
    for (const [artifact, entry] of list) {
      const file = path.join(a.dir, artifact);
      if (!exists(file)) {
        error(lockFile, `artifacts.${artifact}`, 'Listed in the lock but the file is missing', 'stale');
        continue;
      }
      if (sha256(fs.readFileSync(file)) !== entry.outputHash) {
        error(lockFile, `artifacts.${artifact}.outputHash`, 'File on disk differs from the recorded outputHash (edited by hand?)', 'stale');
      }
      if (current && entry.inputHash !== current) stale.push([artifact, entry]);
    }
    if (stale.length) {
      const was = [...new Set(stale.map(([, e]) => e.inputHash.slice(0, 12)))].join(', ');
      error(
        lockFile,
        stale.length === 1 ? `artifacts.${stale[0][0]}.inputHash` : 'artifacts.*.inputHash',
        `${name}: ${stale.length} artifact(s) stale (lock ${was}…, inputs now ${current.slice(0, 12)}…): ${stale.map(([k]) => k).join(', ')}. Run \`npm run ${name} -- --slug ${slug}\``,
        'stale',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Layout sync (§6.1)
// ---------------------------------------------------------------------------

if (!exists(GLOBAL_CSS)) error(GLOBAL_CSS, '(file)', 'Missing', 'layout');
else {
  const css = fs.readFileSync(GLOBAL_CSS, 'utf8');
  const expect = { '--sp-container': `${spConfig.layout.containerPx}px`, '--sp-measure': `${spConfig.layout.measureCh}ch` };
  for (const [token, want] of Object.entries(expect)) {
    const re = new RegExp(`${token}\\s*:\\s*([^;}]+)[;}]`, 'g');
    const found = [...css.matchAll(re)];
    if (found.length === 0) error(GLOBAL_CSS, token, `Not declared; expected ${want} (spConfig.layout)`, 'layout');
    for (const mm of found) {
      const got = mm[1].trim();
      if (got !== want) {
        const line = css.slice(0, mm.index).split('\n').length;
        error(GLOBAL_CSS, `${token} (line ${line})`, `Is ${got}; spConfig.layout says ${want}`, 'layout');
      }
    }
  }
}

// `rg 'sp-breakout' src/ -g '!**/prototypes/**'` must be empty (plain-Node walk; CI has no rg).
{
  const walk = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (d.name === 'prototypes' || d.name === 'node_modules' || d.name.startsWith('.')) continue;
        walk(p);
      } else if (d.isFile() && fs.statSync(p).size < 2_000_000) {
        const text = fs.readFileSync(p, 'utf8');
        if (!text.includes('sp-breakout')) continue;
        text.split('\n').forEach((line, i) => {
          if (line.includes('sp-breakout')) error(p, `line ${i + 1}`, '`sp-breakout` is forbidden (§6.1 uniform container)', 'layout');
        });
      }
    }
  };
  walk(path.join(REPO_ROOT, 'src'));
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

let nErr = 0;
let nWarn = 0;
for (const group of [...findings.keys()].sort()) {
  const list = findings.get(group).sort((x, y) => (x.level === y.level ? 0 : x.level === 'error' ? -1 : 1));
  console.log(`\n${group}`);
  for (const i of list) {
    if (i.level === 'error') nErr++;
    else nWarn++;
    console.log(`  ${i.level === 'error' ? 'ERROR' : 'warn '} ${group}:${i.field}  ${i.message}${i.rule ? ` [${i.rule}]` : ''}`);
  }
}
const pub = [...articles.values()].filter((a) => a.status === 'published').length;
console.log(
  `\nvalidate: ${articles.size} article(s) (${pub} published), ${seriesParsed?.data.length ?? 0} series — ${nErr} error(s), ${nWarn} warning(s)`,
);
process.exit(nErr > 0 ? 1 : 0);
