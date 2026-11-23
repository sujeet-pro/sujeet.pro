import { z } from 'astro/zod';

export const RESERVED_SLUGS = new Set([
  'series', 'explore', 'graph', 'pagefind', 'prototype', 'drafts',
  'print-export', 'llms.txt', 'llms-full.txt', 'rss.xml', 'drafts-index.json', '404',
]);

const Slug = z.string().regex(/^[a-z0-9-]+$/);

// Single source of truth for series membership & ordering (src/series/series.json)
export const SeriesEntrySchema = z.strictObject({
  slug: Slug,
  title: z.string().min(1),
  description: z.string().min(1),
  pillarSlug: Slug.optional(),
  articles: z.array(Slug).min(1), // unique slugs; order = array index
});
export const SeriesFileSchema = z.array(SeriesEntrySchema);

export const ArticleRelationSchema = z.strictObject({
  targetSlug: Slug,
  targetPage: Slug.optional(),
  targetSection: z.string().min(1).optional(),
  kind: z.enum(['prerequisite', 'builds-on', 'deep-dive-of', 'uses-building-block', 'related']),
  reason: z.string().min(1).optional(),
});

// Base (unrefined) object: keeps .shape/.extend reachable for consumers (§4.2 note).
export const ArticleManifestBaseSchema = z.strictObject({
  slug: Slug.refine((s) => !RESERVED_SLUGS.has(s), 'Reserved slug'),
  archetype: z.enum(['standard', 'design-x', 'business-story', 'building-block']).default('standard'),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  summary: z.string().min(1),
  phase: z.enum(['idea', 'discussing', 'prototyping', 'building', 'review', 'published']).default('idea'),
  // status is derived: phase === 'published' ? 'published' : 'draft'
  primarySeries: Slug.optional(), // validated against series.json memberships (cross-file check in registry + validate.mjs)
  tags: z.array(z.string().min(1)).default([]),
  concepts: z.array(z.string().min(1)).default([]),
  version: z.number().int().positive().default(1),
  publishedAt: z.iso.date().optional(),
  updatedAt: z.iso.date(),
  quickRead: z.strictObject({
    readingMinutes: z.number().int().positive().default(3),
    tldr: z.string().min(1),
    keyTakeaways: z.array(z.string().min(1)).min(2).max(6),
  }).optional(),
  thumbnailAlt: z.string().min(1).optional(), // paths derived by convention under social/thumbnail*
  features: z.strictObject({
    audio: z.boolean().default(false),
    pdf: z.boolean().default(true),
  }).default({ audio: false, pdf: true }),
  pages: z.array(z.strictObject({
    slug: Slug.optional(), // omit for index; must be unique
    title: z.string().min(1),
    navLabel: z.string().min(1).optional(),
    entry: z.string().regex(/^pages\/[a-z0-9-]+\.mdx$/),
    summary: z.string().min(1),
  })).min(1),
  relations: z.array(ArticleRelationSchema).default([]),
});

export const ArticleManifestSchema = ArticleManifestBaseSchema.superRefine((m, ctx) => {
  if (m.phase !== 'published') return;
  if (!m.publishedAt) ctx.addIssue({ code: 'custom', path: ['publishedAt'], message: 'Required when published' });
  if (!m.quickRead) ctx.addIssue({ code: 'custom', path: ['quickRead'], message: 'Required when published' });
  if (!m.thumbnailAlt) ctx.addIssue({ code: 'custom', path: ['thumbnailAlt'], message: 'Required when published' });
  const pageSlugs = m.pages.map((p) => p.slug ?? '');
  if (new Set(pageSlugs).size !== pageSlugs.length) ctx.addIssue({ code: 'custom', path: ['pages'], message: 'Duplicate page slug' });
});

export const deriveStatus = (phase: string) => (phase === 'published' ? 'published' : 'draft');

export const AudioScriptSchema = z.strictObject({
  title: z.string().min(1),
  voice: z.string().optional(),
  speed: z.number().min(0.75).max(1.5).optional(),
  lexicon: z.record(z.string(), z.string()).default({}), // e.g. { "DynamoDB": "Dynamo D B", "P99": "P ninety-nine" }
  chapters: z.array(z.strictObject({
    id: Slug, // unique per script
    title: z.string().min(1),
    targetPage: z.string().optional(),
    targetSectionId: z.string().optional(),
    targetVisualId: z.string().optional(),
    paragraphs: z.array(z.strictObject({
      text: z.string().min(1),       // shown in the Transcript drawer
      spoken: z.string().optional(), // optional TTS phrasing override
    })).min(1),
  })).min(1),
});

export const CostModelSchema = z.strictObject({
  pricingAsOf: z.iso.date(),
  region: z.string().default('us-east-1'),
  sources: z.array(z.strictObject({ label: z.string().min(1), url: z.url() })).min(1),
  enterpriseDiscountRangePct: z.tuple([z.number().min(0).max(60), z.number().min(0).max(60)]),
  tiers: z.array(z.strictObject({
    id: z.string().min(1),
    label: z.string().min(1),
    monthlyRequestsM: z.number().positive(),
    components: z.array(z.strictObject({
      name: z.string().min(1),
      awsService: z.string().min(1),
      monthlyListUsd: z.number().nonnegative(),
      assumption: z.string().min(1),
    })).min(1),
  })).min(1),
});

export const AudioChaptersOutputSchema = z.strictObject({ // audio/chapters.json (generated)
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  voice: z.string().min(1),
  model: z.string().min(1),
  durationSec: z.number().nonnegative(),
  sampleRateHz: z.number().int().positive(),
  chapters: z.array(z.strictObject({
    id: Slug,
    title: z.string().min(1),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    targetPage: Slug.optional(),
    targetSectionId: z.string().min(1).optional(),
    targetVisualId: z.string().min(1).optional(),
    transcript: z.array(z.string().min(1)).min(1),
  })).min(1),
});

export const GeneratedLockSchema = z.strictObject({ // generated.lock.json
  schemaVersion: z.literal(1),
  artifacts: z.record(z.string(), z.strictObject({ // key = artifact path relative to article folder
    pipeline: z.enum(['visuals', 'audio', 'pdf']),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    outputHash: z.string().regex(/^[a-f0-9]{64}$/),
    toolVersion: z.string().min(1),
    generatedAt: z.iso.datetime(),
  })),
});

export const LinkedInMetadataSchema = z.strictObject({ // social/linkedin.json
  status: z.enum(['not-started', 'drafted', 'scheduled', 'published']),
  postUrl: z.url().optional(),
  postUrn: z.string().optional(),
  syncedArticleVersion: z.number().int().positive(),
  cardPath: z.literal('social/linkedin-card.png'),
  revisions: z.array(z.strictObject({ date: z.iso.date(), note: z.string().min(1) })).default([]),
});

export const DraftsIndexSchema = z.strictObject({ // dist/drafts-index.json
  drafts: z.array(z.strictObject({ slug: z.string(), title: z.string(), archetype: z.string(), phase: z.string(), url: z.string() })),
  prototypes: z.array(z.strictObject({ slug: z.string(), version: z.number().int().positive(), latest: z.boolean(), url: z.string() })),
});

// ---------------------------------------------------------------------------
// Evolution + topology (§4.2.1–4.2.2, Stage 3.8)
// ---------------------------------------------------------------------------
const slug = Slug;

export const EvolutionStageSchema = z.strictObject({
  id: slug,                                        // e.g. "l3-bloom-guard"
  level: z.number().int().min(0),                  // contiguous 0..n
  title: z.string().min(1),
  mode: z.enum(['baseline', 'extend', 'replace']),
  trigger: z.strictObject({
    kind: z.enum(['launch', 'scale', 'business', 'incident', 'feature-request', 'cost', 'org']),
    headline: z.string().min(1),
    scenario: z.string().min(1),
  }).optional(),                                   // required for level > 0 (superRefine)
  requirements: z.array(z.strictObject({ label: z.string().min(1), value: z.string().min(1) })).min(1),
  keyPoints: z.array(z.string().min(1)).min(2).max(5),
  decision: z.strictObject({
    add: z.array(z.string()).default([]),          // topology node ids
    change: z.array(z.string()).default([]),
    remove: z.array(z.string()).default([]),       // required non-empty when mode === 'replace'
    defer: z.array(z.strictObject({ item: z.string().min(1), until: z.string().min(1) })).default([]),
  }),
  buildVsBuy: z.strictObject({
    verdict: z.enum(['configure', 'buy', 'build']),
    options: z.array(z.string().min(1)).min(1),
    rationale: z.string().min(1),
  }),
  costTierId: z.string().min(1).optional(),        // must exist in data/cost-models.json (E7)
  figures: z.array(z.strictObject({
    visual: slug,                                  // diagrams/<visual>-{light,dark}.webp (E9)
    alt: z.string().min(1),
    interactive: z.enum(['none', 'stage', 'diff']).default('diff'),
  })).min(1),
  exitCriteria: z.array(z.string().min(1)).default([]), // required for all but the last stage (E6)
});

// Base (unrefined) object keeps .shape reachable; EvolutionSchema adds E1–E6.
export const EvolutionBaseSchema = z.strictObject({
  subject: z.string().min(1),
  stages: z.array(EvolutionStageSchema).min(2),
});

export const EvolutionSchema = EvolutionBaseSchema.superRefine((e, ctx) => {
  const ids = e.stages.map((s) => s.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['stages'], message: 'Duplicate stage id' }); // E1
  const last = e.stages.length - 1;
  e.stages.forEach((s, i) => {
    if (s.level !== i) ctx.addIssue({ code: 'custom', path: ['stages', i, 'level'], message: `Expected level ${i}` }); // E2
    if (i === 0 && s.mode !== 'baseline') ctx.addIssue({ code: 'custom', path: ['stages', 0, 'mode'], message: 'Stage 0 must be baseline' }); // E3
    if (s.level > 0 && !s.trigger) ctx.addIssue({ code: 'custom', path: ['stages', i, 'trigger'], message: 'Trigger required for level > 0' }); // E4
    if (s.mode === 'replace' && s.decision.remove.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['stages', i, 'decision', 'remove'], message: 'replace stage must remove something' }); // E5
    }
    if (i < last && s.exitCriteria.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['stages', i, 'exitCriteria'], message: 'Exit criteria required except on the last stage' }); // E6
    }
  });
});

export const TopologySchema = z.strictObject({
  viewBox: z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]),
  nodes: z.array(z.strictObject({
    id: Slug,
    label: z.string().min(1),                 // generic building block
    awsLabel: z.string().min(1).optional(),   // Generic ↔ AWS toggle
    kind: z.enum(['client', 'dns', 'edge', 'compute', 'cache', 'store', 'queue', 'analytics', 'config', 'external']),
    x: z.number(), y: z.number(),             // fixed position across stages → stable morph/diff, zero CLS
    failure: z.strictObject({
      blastRadius: z.array(z.string().min(1)).min(1),
      fallback: z.string().min(1).optional(),
    }).optional(),
  })).min(1),
  edges: z.array(z.strictObject({
    from: Slug,
    to: Slug,
    kind: z.enum(['request', 'write', 'async', 'fallback']).default('request'),
    label: z.string().min(1).optional(),
  })).default([]),
});
export const SystemTopologySchema = TopologySchema; // master-plan name

export type Evolution = z.infer<typeof EvolutionSchema>;
export type EvolutionStage = z.infer<typeof EvolutionStageSchema>;
export type Topology = z.infer<typeof TopologySchema>;
export type TopologyNode = Topology['nodes'][number];
export type TopologyEdge = Topology['edges'][number];
export type CostModel = z.infer<typeof CostModelSchema>;
export type CostTier = CostModel['tiers'][number];
