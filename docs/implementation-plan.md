# `sujeet.pro` v8 — Resumable Implementation Plan (Stages 2–7)

This is the canonical resume document for the v8 rebuild. It is written so a future session, including a lower-tier model such as Sonnet or Haiku, can pick up any stage without re-deriving the architecture. Companion docs:

| Doc | Purpose |
| :--- | :--- |
| `docs/preview-guide.md` | How to open and review the Stage 1 preview (and the v2 preview once its section lands); smoke-test assertions |
| `.junie/plans/interactive-articles-platform.md` | Master plan: requirements (incl. Editorial thesis, Visual-first explanation, FR 10–11), Preview 6, Key Decision #8, Evolution Schema, Delivery Steps. This doc mirrors its contracts verbatim; last synced **2026-11-23** (see §14). |
| `.junie/plans/implementation-runbook.md` | Earlier task-card draft with extra schema detail. **This file wins on conflict.** Example: the actual preview orders palette groups `… → Full-Text Matches → Commands`, not the reverse. |

---

## 1. Status Tracker

> **Scope decision (owner, 2026-11-23):** only the prototypes (Stage 1 `v1.html`, Stage 1b `v2.html`) and this plan are built now. All platform code (Stages 2–7 = master Delivery Steps 3–7) is **deferred** to future sessions, which resume from this doc.

| Stage | Title | Status | Recommended tier | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Standalone interactive preview `prototypes/v1.html` | **DONE (reviewed)** | — | `src/articles/design-url-redirection-service/prototypes/v1.html`, `docs/preview-guide.md` |
| 1b | v2 evolution-first preview `prototypes/v2.html`: uniform 1140px container + 6-level evolution body in 4 layout variants (`split` / `scrolly` / `stacked` / `stepper`) | **DONE — pending owner's layout pick** | — | `src/articles/design-url-redirection-service/prototypes/v2.html` (built by a separate agent run; confirm its smoke results in `docs/preview-guide.md`) |
| **Blocking input before Stage 3 (evolution components; master Step 4)** | Owner picks `spConfig.layout.stageVariant` from v2 | **DONE 2026-11-23 — `hybrid`** (`stacked` base, `split` at ≥1200px via CSS, `figureExpand: true`) | Owner | Recorded in §4.1 and the master plan Global Config. Owner preference: stacked-like reading first; the wide breakpoint and expand control are configurable. Stage 3 builds **two** CSS arrangements over one DOM (3.9) and the Expand dialog (3.10). |
| 2 | Astro 7 core + `sp.config.ts` (incl. `layout`) + router + `⌘K` + CI skeleton | **DONE 2026-11-23** (uncommitted) | Strong for 2.2, 2.6; Sonnet for the rest | Stage 2 Verify prints only `ok` lines + files; `astro check` 0/0/0 (22 files); 21/21 Playwright smoke checks for 2.6 (cold ⌘K 43 ms, no row jump, focus restore, WCAG gate, `g h`, `j`/`k`, P11 dark across swap, 390px). See Stage 2 notes below the Verify block. |
| 3 | Knowledge graph + multi-series breadcrumbs + `/explore/` + interactive primitives + evolution components + audio player | **DONE 2026-11-23** (uncommitted; per-sub-task Playwright evidence in agent runs; full QA in Stage 5) | Strong for 3.1, 3.3, 3.7, 3.8, 3.10; Sonnet for the rest | — |
| 4 | Local media pipelines (visuals/thumbnails + per-stage WebPs, MLX Kokoro audio, branded PDF, `llms.txt`/SEO-AEO) | **DONE 2026-11-23** — visuals (16 artifacts), MLX Kokoro audio (9:04, −16.4 LUFS), PDF (2.1 MB, deterministic), llms/RSS/SEO | Strong for 4.3, 4.4; Sonnet/Haiku for the rest | — |
| 5 | Validators (incl. evolution rules) + Playwright E2E/QA harness (incl. layout/evolution spec) | **DONE 2026-11-23** — `validate` 0 errors, `validate:dist` 0 errors, Playwright 151 passed / 7 skipped (hybrid-only variants) on desktop + mobile | Strong for 5.2; Sonnet for specs | — |
| 6 | Evolution-first flagship article + draft stub + hardened CI | **DONE 2026-11-23** — V1–V12 sourced (25 URLs) or labelled ASSUMPTION; published with audio + PDF; draft stub unlisted; CI hardened | Strong + web research for 6.1, 6.2, 6.8; Sonnet for the rest | — |
| 7 | Junie rules/skills/subagents + `validate-junie` | **DONE 2026-11-23** — reshaped: shared `ai-guidelines/` for Junie + Claude Code; `validate:junie` green | Sonnet; Strong for the final review | — |

Per-sub-task checkboxes live in §8. Update this table and the checkboxes in the same commit as the work.

**Stage ↔ master Delivery Step mapping.** The master plan numbers its work as "Steps"; this doc numbers "Stages". They are offset by one after the prototypes, and master Step 6 is split in two here:

| This doc | Master plan (`.junie/plans/interactive-articles-platform.md` → Delivery Steps) |
| :--- | :--- |
| Stage 1 | Step 1 — `prototypes/v1.html` + resume docs |
| Stage 1b | Step 2 — `prototypes/v2.html` (uniform container + 4 layout variants) |
| Stage 2 | Step 3 — Astro 7 core, `sp.config.ts`, router, `⌘K`, CI skeleton |
| Stage 3 | Step 4 — knowledge graph, breadcrumbs, `/explore/`, **evolution components**, primitives, audio player |
| Stage 4 | Step 5 — media pipelines, PDF, `llms.txt` / SEO-AEO |
| Stage 5 | Step 6 (first half) — validators + Playwright E2E/QA |
| Stage 6 | Step 6 (second half) — flagship article, draft stub, hardened CI |
| Stage 7 | Step 7 — Junie rules, skills, subagents, `validate-junie` |

When the master plan says "Stage 2" for `v2.html` (its File Structure comment), it means master **Step 2** = this doc's **Stage 1b**.

### 1.1 How to resume (start here)

Precise checklist for the first session after the 2026-11-23 deferral:

- [x] **(1) Pick a variant.** `open src/articles/design-url-redirection-service/prototypes/v2.html` (runs from `file://`). Compare `?layout=split|scrolly|stacked|stepper` on the same content (also the `v` key and `⌘K` → "Layout → …" in the prototype). Check at 1280px and 390px, Light and Dark. Criteria: skim speed, print/PDF fidelity (`stacked` and `split` degrade best), JS and CLS cost (`scrolly` is the most expensive, see P25), keyboard flow (`stepper`).
- [x] **(2) Record the pick** in three places in the same change: the "Blocking input" row in §1 (set to DONE with the variant and date), `layout.stageVariant` in §4.1 of this doc, and the `layout` block of the `sp.config.ts` contract in `.junie/plans/interactive-articles-platform.md` (Data Models / Contracts → Global Config). Until then the default is `split`.
- [ ] **(3) Start Stage 2** at sub-task 2.1 with the tier listed in §1 (Sonnet for 2.1; Strong for 2.2 and 2.6). Stage 2 does not depend on the variant; Stage 3 sub-tasks 3.9–3.11 do.
- [ ] **(4) Run the loop** below: one sub-task per agent call, run its acceptance checks and the stage Verify commands, tick the checkbox, update the tracker.

Per-sub-task loop:

1. Read §1–§7 of this doc. Skim §8 only for the stage you are about to run.
2. Pick the **first** stage whose status is not DONE, then the first unchecked `- [ ]` sub-task in it (follow the stage's **Execution order** line where one exists).
3. Run the stage's **Verify** commands *before* changing anything, to confirm the baseline state. Expect failures for unbuilt parts.
4. Execute **one sub-task per agent call**. Pass the agent only: §2 (decisions), §4 (contracts), the sub-task block, and the listed prototype anchors (§9).
5. Run the sub-task's acceptance checks, then the stage's Verify commands.
6. Tick the checkbox and, when every sub-task in a stage is ticked and Verify passes, set the stage to DONE in §1 with a short evidence note (commit SHA or command output summary).
7. Do not commit unless the owner asks. When asked, use conventional commits and add the trailer `--trailer "Co-authored-by: Junie <junie@jetbrains.com>"`.

### 1.2 Model routing and cost control

| Work type | Tier | Why |
| :--- | :--- | :--- |
| Contract design, cross-module state (graph compiler, breadcrumbs, palette/dispatcher, audio player, audio stitching, PDF route, `validate-dist`) | **Strong** (Opus-class) | Subtle invariants: zero CLS, hydration, leaks, sample-accurate timing |
| Mechanical wiring (deps, config, scripts, routes from a spec, CSS token copy, Playwright specs from listed assertions, Junie markdown) | **Sonnet** | Spec is explicit; low ambiguity |
| Read-only scouting (find anchors in the 4.8k-line prototype, check a doc URL, list files) | **Haiku** | Cheap fan-out |
| Factual content (AWS pricing, quotas, article prose) | **Strong + web**, then adversarial review | Accuracy is priority #1; no invented numbers |

Cost tips:
- Never hand the whole prototype to an agent. Give it the anchors from §9 and let it `rg` for the rest.
- One sub-task per call. Keep the file allow-list tight, and tell the agent to touch nothing else.
- Run a Strong-tier review once at the end of each stage rather than after every sub-task.
- Reuse the Verify commands verbatim; do not let agents invent new gates.
- Prefer `rg`/`fd` for search and `git`/`gh` CLI only. No MCP is required by this project.

---

## 2. Product Summary and Hard Decisions

Static, keyboard-first site for Principal-Engineer interactive deep-dives. Each article has a Quick Read, a tabbed Full Production Reference, a many-to-many knowledge graph with backlinks, an optional synced podcast companion, a branded PDF, and `llms.txt` endpoints.

| Area | Decision (do not revisit without owner sign-off) |
| :--- | :--- |
| Framework | Astro `7.4.13` (repo pin `^7.4.13`), Vite `8.3.8`, Zod 4 via `astro/zod` |
| Content | Every page entry is `pages/*.mdx`; React islands are imported statically inside MDX |
| Styling | Tailwind v4 (`@tailwindcss/vite`) + `--sp-*` CSS tokens copied from the approved prototype |
| Layout width | **Uniform container** (master Key Decision #8, FR 11): one `--sp-container: 1140px` (+20px gutters) on every horizontal container; text runs left-aligned at `max-width: var(--sp-measure)` (`68ch`). No `--sp-breakout`, no centred prose column. Supersedes the v1 measure/breakout split. Rules in §6.1. |
| Article body (Design X; Building Block / Business Story where useful) | **Evolution-first** (master Editorial thesis, FR 10): Quick Read → Evolution Ladder → ordered Stage blocks `L0…Ln` (`baseline` / `extend` / `replace`), each with trigger, key-point bullets, decision add/change/remove/defer, `ExplainerFigure` (static WebP ⇄ interactive diff), build-vs-buy, cost band, exit criteria. One `data/evolution.json` + `data/topology.json` per article feed the stages, the lab, `⌘K`, `llms-full.txt`, the PDF and audio chapters. |
| Stage layout variant | `spConfig.layout.stageVariant`, picked by the owner from `prototypes/v2.html`; default `split`. Production implements **only** the picked variant. |
| Code blocks | `astro-expressive-code`, theme bound to `data-sp-scheme` |
| Search | `cmdk@1.1.1` + build-time structural index + Pagefind (`data-pagefind-body` allowlist on published `<main>` only) |
| Testing | `@playwright/test` (Chromium) |
| Namespacing | `sp-` everywhere: `sp-v8-prefs`, `sp-v8-nav-series`, `sp-v8-idb`, `data-sp-scheme`, `data-sp-scheme-pref`, `data-sp-contrast`, `data-sp-text`, `data-sp-nav-series`, `data-sp-export`, `--sp-*`, `sp.config.ts` |
| TypeScript | `typescript@^5.8`. Astro 7 rejects TS 7. |
| Hosting | Static GitHub Pages only (`public/CNAME`, `public/.nojekyll` already exist). No backend, DB, CMS, auth or MCP server. |
| Heavy generation | Local only, on Apple Silicon. Audio: `mlx-audio` + `mlx-community/Kokoro-82M-bf16`, voice `am_michael`, run via `uv run --python 3.12`; FFmpeg two-pass `loudnorm` at −16 LUFS, 24 kHz, 64 kbps mono MP3. Visuals: Playwright + Sharp. PDF: Playwright `page.pdf()`. Binaries are committed; CI never runs these. |
| Node | CI runs Node 24 (`.github/workflows/deploy.yml`); `package.json` engines `>=22.23.4`. Plain-Node scripts may import `.ts` via native type stripping (keep imported TS erasable-only; see pitfall P13). |

Current baseline (verified at time of writing): `package.json` has only `astro`; `astro.config.mjs` sets only `site`; `src/pages/index.astro` is a placeholder; `deploy.yml` already has `concurrency: { group: pages, cancel-in-progress: false }` and runs `npm ci && npm run build` on Node 24.

---

## 3. Visibility Tiers and Leak Rules

| Tier | What | Where it appears | Where it must never appear |
| :--- | :--- | :--- | :--- |
| `published` | Articles with `phase === 'published'` | Homepage, series hubs, `/explore/`, sitemap, RSS, Pagefind, `graph-index.<hash>.json`, `/llms.txt`, `/<slug>/llms-full.txt` | — |
| `unlisted` | Drafts (any other phase) and prototypes `prototypes/vN.html` | Direct URL only: `/<slug>/` (draft) with `noindex, nofollow`; `/<slug>/prototype/` (latest by **numeric** N) and `/<slug>/prototype/vN/` with `noindex, nofollow` + preview banner; listed only by `/drafts-index.json`, fetched client-side when `/?drafts=true` | Any `href` in published HTML, sitemap, RSS, Pagefind (no `data-pagefind-body`), `graph-index`, `/llms.txt`, OG/JSON-LD of other pages |
| `local-only` | `/print-export/<slug>/` route, `audio/.cache/`, `audio/script.json`, `diagrams/.cache.json`, raw `prototypes/` files | Developer machine | Anything under `dist/` |

Rules:
- `<ArticleRef slug="…">` to a draft renders an unlinked "Coming Soon" card (title + archetype, **no** `href`, no slug in attributes).
- `status` is derived, never stored: `phase === 'published' ? 'published' : 'draft'`.
- Draft pages render without `data-pagefind-body`, so Pagefind skips them. Once any page has the attribute, pages without it are excluded.

---

## 4. Data Contracts (implement verbatim)

### 4.1 `sp.config.ts` (repo root)

```ts
export const spConfig = {
  prefix: 'sp',
  storageKey: 'sp-v8-prefs',
  navSessionKey: 'sp-v8-nav-series',
  idbName: 'sp-v8-idb',
  siteUrl: 'https://sujeet.pro',
  repoUrl: 'https://github.com/sujeet-pro/sujeet.pro',
  author: { name: 'Sujeet Jaiswal', handle: 'sujeet.pro' },
  features: {
    commandPalette: true,
    pagefindSearch: true,
    exploreGraph: true,
    indexedDbCache: false, // opt-in hash-keyed IDB; default uses hashed URL + memory + HTTP ETag
    audioCompanion: true,
    brandedPdfExport: true,
    printGuard: true,
    draftDiscoveryParam: 'drafts',
  },
  shortcuts: {
    palette: 'mod+k',
    search: '/',
    commands: '>',
    help: '?',
    cycleTheme: 't',
    toggleAudio: 'p',
    seekBack: '[',
    seekForward: ']',
    nextSection: 'j',
    prevSection: 'k',
    copyAiPrompt: 'l',
    goHome: 'g h',
    goExplore: 'g e',
  },
  theme: {
    defaultScheme: 'auto' as 'auto' | 'light' | 'dark',
    defaultContrast: 'default' as 'default' | 'high',
    defaultTextSize: 'default' as 'default' | 'large',
    singleKeyShortcutsEnabled: true, // WCAG 2.1.4 user-toggleable in sp-v8-prefs
  },
  media: { baseUrl: '' }, // empty = same-origin /<slug>/...; set to R2/CDN URL later without markup edits
  audio: {
    engine: 'mlx-audio' as const,
    model: 'mlx-community/Kokoro-82M-bf16',
    voice: 'am_michael',
    langCode: 'a',
    speed: 1.0,
    sampleRateHz: 24000,
    paragraphPauseMs: 350,
    chapterPauseMs: 900,
    targetLufs: -16,
    bitrateKbps: 64,
    baseUrl: '',
  },
  pdf: {
    watermarkText: 'sujeet.pro',
    watermarkOpacity: 0.06,
    headerBrand: 'sujeet.pro',
    footerAuthor: 'Sujeet Jaiswal',
    format: 'A4' as const,
  },
  layout: {
    containerPx: 1140,          // --sp-container: header, body, labs, footer share edges
    measureCh: 68,              // --sp-measure: max-width of text runs, left-aligned
    // Owner pick (2026-11-23): 'hybrid' = reading-first `stacked`, promoted to `split` on wide viewports
    // by a CSS media query only (same DOM, no JS, zero CLS; print/PDF always render `base`).
    stageVariant: 'hybrid' as 'split' | 'scrolly' | 'stacked' | 'stepper' | 'hybrid',
    hybrid: {
      base: 'stacked' as 'stacked' | 'split', // < wideMinPx, print and PDF
      wide: 'split' as 'stacked' | 'split',   // >= wideMinPx; set to 'stacked' for stacked everywhere
      wideMinPx: 1200,                        // viewport width; container (1140 + 2×20 gutters) fits from 1180
    },
    figureExpand: true, // "Expand" control on every stage figure → full-viewport dialog (image or interactive), Esc restores focus (P15)
  },
  qaBudgets: { maxCls: 0.05, maxLabLcpMs: 2500, maxFirstPaletteMs: 200, targetFieldInpMs: 200 },
} as const;

export type SpConfig = typeof spConfig;
```

`layout` is copied verbatim from the master plan. **Owner pick (2026-11-23): `hybrid`.** Owner's words: "a combination of split and stacked, depending on the size, and ideally a button to enlarge the interactive element — or maybe a configuration. Ideally stacked-like so it's easier to read." Implementation rules for Stage 3: (a) one DOM per stage; `base` layout by default, `wide` layout inside `@media (min-width: <wideMinPx>px)` (emit the breakpoint from `spConfig` at build time; no JS measurement, so CLS stays 0); (b) `@media print` and `data-sp-export="pdf"` always use `base`; (c) when `figureExpand` is true, `ExplainerFigure` adds an **Expand** button that opens the current figure (static image or hydrated topology) in a full-viewport `<dialog>` following P15 focus rules; (d) only `stacked` and `split` CSS ship — `scrolly`/`stepper` are not built. `global.css` emits `--sp-container: 1140px` and `--sp-measure: 68ch` with the same values; Stage 2.4 keeps them in sync (hard-code both, and add a `validate.mjs` check in 5.1 that the CSS values equal `spConfig.layout`). The v2 prototype's `v` key (cycle layout) is a prototype-only control and is **not** added to `shortcuts`.

The preview's `1`/`2` tab keys are not in this table. Add them during Stage 2 as `tab1: '1'`, `tab2: '2'` only if the owner confirms them in the preview review (`docs/preview-guide.md` §5 checklist).

User prefs stored in `localStorage["sp-v8-prefs"]`, matching the preview:

```ts
type UserPrefs = {
  scheme: 'auto' | 'light' | 'dark';
  contrast: 'default' | 'high';
  textSize: 'default' | 'large';
  singleKeyShortcuts: boolean; // WCAG 2.1.4 off-switch
};
```

`<html>` attributes set by the pre-paint script: `data-sp-scheme` (**resolved** `light|dark`; Tailwind and Expressive Code bind to it), `data-sp-scheme-pref` (`auto|light|dark`), `data-sp-contrast`, `data-sp-text`, `data-sp-nav-series` (multi-series articles only). `PrintLayout.astro` alone sets `data-sp-export="pdf"`.

### 4.2 `src/lib/articles/schema.ts` (Zod 4)

```ts
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

export const ArticleManifestSchema = z.strictObject({
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
}).superRefine((m, ctx) => {
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
```

Note: if a consumer needs `.shape` or `.extend` on the manifest, export an `ArticleManifestBaseSchema` without the `superRefine` alongside the refined export. Confirm how `.superRefine` chains on `z.strictObject` in the Zod 4 docs at implementation time; this is an assumption, not verified here.

Supporting schemas, adopted from `.junie/plans/implementation-runbook.md` (recommended; keep them in the same file):

```ts
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
```

`SystemTopologySchema` (for `diagrams/*.diagram.json`) is defined in Stage 3.6 from the preview's topology data shape. The runbook has a draft you can start from (`.junie/plans/implementation-runbook.md`, "Core Data Schemas"). **Amended 2026-11-23:** for evolution articles the topology lives in `data/topology.json` and is validated by `TopologySchema` (§4.2.2). Export `SystemTopologySchema` as an alias of `TopologySchema` (`export const SystemTopologySchema = TopologySchema;`) so the master plan's name keeps resolving; `diagrams/*.diagram.json` remains only for non-evolution diagrams.

#### 4.2.1 Evolution schema (`src/articles/<slug>/data/evolution.json`) — verbatim from the master plan

```ts
const slug = z.string().regex(/^[a-z0-9-]+$/);

export const EvolutionStageSchema = z.strictObject({
  id: slug,                                        // e.g. "l3-bloom-guard"
  level: z.number().int().min(0),                  // contiguous 0..n
  title: z.string().min(1),
  mode: z.enum(['baseline', 'extend', 'replace']),
  trigger: z.strictObject({
    kind: z.enum(['launch', 'scale', 'business', 'incident', 'feature-request', 'cost', 'org']),
    headline: z.string().min(1),                   // "Bot path-scans cause a 404 storm"
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
  costTierId: z.string().min(1).optional(),        // must exist in data/cost-models.json
  figures: z.array(z.strictObject({
    visual: slug,                                  // diagrams/<visual>-{light,dark}.webp
    alt: z.string().min(1),
    interactive: z.enum(['none', 'stage', 'diff']).default('diff'),
  })).min(1),
  exitCriteria: z.array(z.string().min(1)).default([]), // required for all but the last stage
});

export const EvolutionSchema = z.strictObject({
  subject: z.string().min(1),
  stages: z.array(EvolutionStageSchema).min(2),
}); // superRefine: unique ids, contiguous levels, stage 0 is 'baseline', trigger for level>0, remove[] for 'replace'
```

Implementation notes (amendments, not changes to the contract):
- `schema.ts` already declares `Slug`; write `const slug = Slug;` instead of redeclaring the regex.
- Following the manifest pattern above, export the plain object as `EvolutionBaseSchema` and the refined one as `EvolutionSchema`, so `.shape` stays reachable.
- **Assumption to verify:** that `.superRefine` chains on `z.strictObject` in Zod 4 (via `astro/zod`) and still returns a schema usable by `safeParse`. Check the Zod 4 docs at implementation time. If chaining behaves differently, run the same checks as a plain function after `safeParse`.
- **Verified in S2.2 (2026-11-23), zod 4.6.7 via `astro/zod`:** `z.strictObject({...}).superRefine(...)` returns a `ZodObject` (refinements are stored as checks), so `safeParse` works, unknown keys still fail with `unrecognized_keys`, and `.shape` stays reachable on the refined schema. `ArticleManifestBaseSchema` is still exported for clarity. Plain `node` (v26, type stripping) imports `schema.ts` and `sp.config.ts` directly, so validators do not need `tsx`; recheck on Node 24 in CI (5.1).

Rules split by where they can run:

| # | Rule | Where | Message path |
| :--- | :--- | :--- | :--- |
| E1 | Stage `id`s unique | `superRefine` | `stages` |
| E2 | Levels contiguous from 0 **in array order** (`stages[i].level === i`) | `superRefine` | `stages.<i>.level` |
| E3 | `stages[0].mode === 'baseline'` | `superRefine` | `stages.0.mode` |
| E4 | `trigger` required when `level > 0` | `superRefine` | `stages.<i>.trigger` |
| E5 | `decision.remove` non-empty when `mode === 'replace'` | `superRefine` | `stages.<i>.decision.remove` |
| E6 | `exitCriteria` non-empty for every stage except the last | `superRefine` | `stages.<i>.exitCriteria` |
| E7 | `costTierId` exists in `data/cost-models.json` `tiers[].id` | cross-file: `validate.mjs` (5.1) + registry | `evolution.json:stages.<i>.costTierId` |
| E8 | Every id in `decision.add/change/remove` exists in `data/topology.json` `nodes[].id` | cross-file | `…decision.<op>` |
| E9 | `figures[].visual` files exist: `diagrams/<visual>-light.webp` and `-dark.webp` | cross-file; **error** once `generated.lock.json` exists or `phase === 'published'`, **warning** before (fixtures predate Stage 4) | `…figures.<j>.visual` |
| E10 | No node in a stage before the stage whose `decision.add` introduces it: `add` ids must not already be active; `change`/`remove` ids must be active in the previous stage; any node a figure or lab scenario references must be in that stage's active set | cross-file (needs topology) | `…decision.<op>` |

Sketch of the intra-file refinement (E1–E6):

```ts
export const EvolutionSchema = EvolutionBaseSchema.superRefine((e, ctx) => {
  const ids = e.stages.map((s) => s.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['stages'], message: 'Duplicate stage id' });
  const last = e.stages.length - 1;
  e.stages.forEach((s, i) => {
    if (s.level !== i) ctx.addIssue({ code: 'custom', path: ['stages', i, 'level'], message: `Expected level ${i}` });
    if (i === 0 && s.mode !== 'baseline') ctx.addIssue({ code: 'custom', path: ['stages', 0, 'mode'], message: 'Stage 0 must be baseline' });
    if (s.level > 0 && !s.trigger) ctx.addIssue({ code: 'custom', path: ['stages', i, 'trigger'], message: 'Trigger required for level > 0' });
    if (s.mode === 'replace' && s.decision.remove.length === 0) ctx.addIssue({ code: 'custom', path: ['stages', i, 'decision', 'remove'], message: 'replace stage must remove something' });
    if (i < last && s.exitCriteria.length === 0) ctx.addIssue({ code: 'custom', path: ['stages', i, 'exitCriteria'], message: 'Exit criteria required except on the last stage' });
  });
});
```

Cross-file rules E7–E10 live in one pure function, `checkEvolutionRefs({ evolution, topology, costModels, fileExists })`, in `src/lib/articles/evolution.ts` (erasable TS, P13), called by the registry at build time and by `validate.mjs`.

#### 4.2.2 `TopologySchema` (`src/articles/<slug>/data/topology.json`) — recommendation, not in the master plan

Nodes and edges are defined **once**. A stage does not list its nodes; its active set is derived:

```text
active(L0) = stages[0].decision.add
active(Ln) = active(Ln-1) ∪ stages[n].decision.add − stages[n].decision.remove
activeEdges(Ln) = edges whose `from` and `to` are both in active(Ln)
diff(Ln) = { added: stages[n].decision.add, changed: stages[n].decision.change, removed: stages[n].decision.remove }
```

```ts
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
```

Why: one definition keeps the per-stage WebPs (S4), the interactive diff (S3) and the lab (S6) consistent, and makes E10 a set computation instead of a hand-maintained per-stage list. `activeSet(evolution, level)` and `stageDiff(evolution, level)` live next to `checkEvolutionRefs` in `src/lib/articles/evolution.ts`. Additional topology checks: unique node ids; edge endpoints exist; every node is added by some stage (warning if not).

### 4.3 Compiled structural index — `dist/graph-index.<hash>.json`

```ts
export interface GraphIndex {
  schemaVersion: 1;
  graphHash: string; // first 8+ hex of sha256 over the canonical JSON body
  series: Array<{ slug: string; title: string; description: string; pillarSlug?: string; articles: string[] }>;
  articles: Array<{
    slug: string;
    title: string;
    subtitle: string;
    archetype: string;
    primarySeries?: string;
    seriesSlugs: string[];
    tags: string[];
    concepts: string[];
    pages: Array<{
      slug?: string;
      title: string;
      url: string;
      sections: Array<{ id: string; title: string; level: 2 | 3 }>;
    }>;
  }>;
  edges: Array<{
    from: { article: string; page?: string };
    to: { article: string; page?: string; section?: string };
    kind: string;
    reason?: string;
  }>; // backlinks derived O(E) at build/client; never duplicated
}
```

Published articles only. Size budget: < 25 KB gzipped. The URL is embedded as `<meta name="sp-graph-url" content="/graph-index.<hash>.json">`.

### 4.4 URL map

| URL | Source |
| :--- | :--- |
| `/` | `src/pages/index.astro` |
| `/<slug>/`, `/<slug>/<page>/` | `src/pages/[...slug].astro` (registry) |
| `/<slug>/prototype/`, `/<slug>/prototype/vN/` | `src/pages/[slug]/prototype/[...variant].astro` (see P3). Flagship today: `/prototype/v1/`, `/prototype/v2/`, and `/prototype/` = v2 (highest N). `?layout=` must survive on the served v2 page. |
| `/<slug>/llms-full.txt` | `src/pages/[slug]/llms-full.txt.ts` |
| `/<slug>/<slug>.pdf` | `exports/<slug>.pdf` copied by `article-assets.ts` |
| `/<slug>/{data,diagrams,social,audio}/…` | allow-listed copy by `article-assets.ts` |
| `/series/<series>/` | `src/pages/series/[series].astro` |
| `/explore/` | `src/pages/explore.astro` |
| `/llms.txt`, `/rss.xml`, `/drafts-index.json` | `src/pages/*.ts` |
| `/graph-index.<hash>.json` | emitted from `build-graph.ts` (Stage 2.6 interim, Stage 3.1 final) |
| `/pagefind/*` | `npx pagefind --site dist` post-build |
| `/print-export/<slug>/` | dev-only `injectRoute` when `SP_PDF_RENDER=1`; never in `dist/` |

---

## 5. Target File Structure

`(S2)` = added in Stage 2, and so on. `(fixture S2 → full S6)` = schema-valid stub early, real content later. `EXISTS` = already in repo.

```text
.
├── AGENTS.md                                   (S7 rewrite; EXISTS with default Astro notes)
├── .gitignore                                  (S2 modify)
├── sp.config.ts                                (S2)
├── astro.config.mjs                            (S2 modify; EXISTS)
├── playwright.config.ts                        (S5)
├── package.json                                (S2 modify; EXISTS)
├── tsconfig.json                               (S2 modify; EXISTS)
├── docs/{implementation-plan.md,preview-guide.md}  (EXISTS — this doc)
├── public/
│   ├── CNAME                                   (EXISTS)
│   ├── .nojekyll                               (EXISTS)
│   └── robots.txt                              (S4: allows /llms.txt, Disallow: /*.pdf, Sitemap line)
├── .github/workflows/deploy.yml                (S2 add `astro check`; S6 full hardening; S7 add validate:junie; EXISTS)
├── .junie/
│   ├── config.json                             (S7)
│   ├── rules/{architecture,voice-and-quality,interactive-ux,archetypes-and-pe-standards}.md  (S7)
│   ├── skills/{article,article-prototype,article-media,article-social,article-qa}/SKILL.md  (S7)
│   └── agents/{article-researcher,article-builder,article-reviewer}.md  (S7)
├── scripts/
│   ├── render-visuals.mjs                      (S4)
│   ├── render-audio.mjs                        (S4)
│   ├── audio/synthesize_mlx.py                 (S4)
│   ├── render-pdf.mjs                          (S4)
│   ├── validate.mjs                            (S5)
│   ├── validate-dist.mjs                       (S5)
│   └── validate-junie.mjs                      (S7)
├── tests/e2e/
│   ├── helpers/qa-audit.ts                     (S5)
│   ├── {theme,command-palette,graph-navigation,audio-and-pdf,drafts-prototypes-llms}.spec.ts  (S5)
│   └── layout-and-evolution.spec.ts            (S5: container edges, 390px overflow, toggle CLS, ⌘K → #stage-l3, stepper keys, scrolly reduced motion)
└── src/
    ├── styles/global.css                       (S2; --sp-container / --sp-measure tokens, §6.1)
    ├── layouts/
    │   ├── BaseLayout.astro                    (S2)
    │   ├── ArticleLayout.astro                 (S2 skeleton → S3 multi-series/connections/audio)
    │   └── PrintLayout.astro                   (S4)
    ├── hooks/useArticleData.ts                 (S3)
    ├── lib/
    │   ├── articles/{schema,registry}.ts       (S2; S3 adds EvolutionSchema + TopologySchema to schema.ts)
    │   ├── articles/evolution.ts               (S3: activeSet, stageDiff, checkEvolutionRefs — erasable TS)
    │   ├── graph/build-graph.ts                (S2 interim index → S3 full graph)
    │   ├── cache/idb-cache.ts                  (S3)
    │   ├── keyboard/dispatcher.ts              (S2)
    │   ├── integrations/article-assets.ts      (S2; S4 adds print route body)
    │   └── llms/synthesize.ts                  (S4)
    ├── components/
    │   ├── CommandPalette.tsx                  (S2)
    │   ├── ShortcutsModal.tsx                  (S2)
    │   ├── ThemeControls.tsx                   (S2)
    │   ├── AudioPlayer.tsx                     (S3)
    │   ├── ExploreGraph.tsx                    (S3)
    │   ├── DraftDiscovery.tsx                  (S3)
    │   ├── CopyAiPrompt.tsx                    (S4)
    │   ├── ui/PrintNotice.astro                (S2)
    │   ├── ui/{QuickRead.astro,Callout.astro}  (S2)
    │   ├── ui/{ArticleCard.astro,ConnectionsPanel.astro,ArticleRef.astro,ArticleRefCard.tsx,StepFrame.tsx,ChartFrame.tsx}  (S3)
    │   ├── ui/ThemedVisual.astro               (S4)
    │   ├── evolution/{EvolutionLadder.astro,EvolutionStage.astro,ExplainerFigure.astro,FigureModeToggle.tsx}  (S3; chosen variant only)
    │   └── interactive/{SystemTopology,ScaleVariantSwitcher,CostModelCalculator}.tsx  (S3; SystemTopology modes stage|diff|lab; ScaleVariantSwitcher = level picker)
    ├── series/series.json                      (fixture S2 → final S3)
    ├── pages/
    │   ├── index.astro                         (S2 minimal → S3 full; EXISTS placeholder)
    │   ├── 404.astro                           (S2)
    │   ├── explore.astro                       (S3)
    │   ├── [...slug].astro                     (S2)
    │   ├── [slug]/prototype/[...variant].astro (S2)
    │   ├── [slug]/llms-full.txt.ts             (S4)
    │   ├── series/[series].astro               (S3)
    │   ├── llms.txt.ts                         (S4)
    │   ├── rss.xml.ts                          (S4)
    │   └── drafts-index.json.ts                (S3)
    ├── internal-routes/print-export.astro      (S4; dev-only injectRoute when SP_PDF_RENDER=1)
    └── articles/
        ├── design-url-redirection-service/
        │   ├── article.json                    (fixture S2 → full S6)
        │   ├── generated.lock.json             (S4)
        │   ├── prototypes/v1.html              (EXISTS — frozen; never edit, iterate via v2.html)
        │   ├── prototypes/v2.html              (EXISTS — Stage 1b; uniform container + 4 layout variants; reference for S3 evolution components)
        │   ├── pages/{index,interactive-lab}.mdx  (fixture S2 → full S6)
        │   ├── components/RedirectorLab.tsx    (S6)
        │   ├── data/cost-models.json           (fixture S3 → verified S6; one tier per level, ids referenced by costTierId)
        │   ├── data/{evolution,topology}.json  (fixture S3 → full S6; 6 levels L0–L5)
        │   ├── diagrams/stage-l{0..5}-{light,dark}.webp  (S6, rendered by the S4 pipeline from topology + evolution)
        │   ├── diagrams/{architecture.diagram.json,request-flow.mmd,architecture-light.webp,architecture-dark.webp}  (S6, rendered by S4 pipeline; optional for evolution articles, see §4.2)
        │   ├── social/{linkedin.md,linkedin.json,linkedin-card.png,thumbnail-light.webp,thumbnail-dark.webp,thumbnail.png}  (S6)
        │   ├── audio/{script.json,episode.mp3,chapters.json}  (S6; script.json is local-only, never copied)
        │   ├── exports/design-url-redirection-service.pdf  (S6)
        │   ├── logs/session-001.md             (S6)
        │   ├── tests/article.e2e.ts            (S6)
        │   └── llms-notes.md                   (S6)
        └── bloom-filter-building-block/        (fixture S2 → final S6; unlisted, phase "discussing", archetype "building-block")
            ├── article.json
            ├── pages/index.mdx
            ├── social/{linkedin.md,linkedin.json}
            ├── logs/session-001.md
            └── llms-notes.md
```

---

## 6. Known Pitfalls (read before any stage)

| # | Pitfall | Required handling |
| :--- | :--- | :--- |
| P1 | Astro 7 defaults to `@astrojs/markdown-satteri`; `rehypePlugins` (and possibly Expressive Code) are rejected without `@astrojs/markdown-remark` | **First task of Stage 2**: probe a fenced code block in a temporary `.mdx`. Add `@astrojs/markdown-remark` only if the probe fails. Record the result in this doc. **Result (2026-11-23, S2.1): PASS without `@astrojs/markdown-remark`.** Astro 7.4.13 ships `@astrojs/markdown-satteri` as a hard dependency (`node_modules/astro/package.json:109`); `@astrojs/mdx` 8.1.6 also uses Sätteri (`@astrojs/mdx/package.json:32`, `satteri ^0.11.6`), and `markdown-remark` is only an optional peer. A probe `.mdx` with a ```` ```ts ```` block and a `client:load` React island built cleanly; `dist/probe/index.html` contained `class="expressive-code"`, and `ec.*.css` used `[data-sp-scheme="dark"|"light"]` selectors. Expressive Code option names (`themeCssSelector`, `useDarkModeMediaQuery`) were confirmed in `@expressive-code/core/dist/index.d.ts:707,742` (astro-expressive-code 0.44.4). |
| P2 | `_`-prefixed files in `src/pages/` are not routed; `page.pdf()` triggers `@media print` | PDF route is a dev-only `injectRoute({ pattern: '/print-export/[slug]', entrypoint: 'src/internal-routes/print-export.astro' })` registered only when `process.env.SP_PDF_RENDER === '1'`, using `PrintLayout.astro` (`data-sp-export="pdf"`, no guard). Print-guard CSS is scoped `:root:not([data-sp-export="pdf"])`. `validate-dist` asserts no `print-export` in `dist/`. |
| P3 | Static `.ts` endpoints write the literal path and ignore `build.format: 'directory'` | Prototype route: try `[...variant].astro` rendering `<Fragment set:html={html} />` first. If Astro mangles the raw document, fall back to `[...file].ts` with params `index.html` and `vN/index.html`. Acceptance: `dist/<slug>/prototype/index.html` and `dist/<slug>/prototype/v1/index.html` exist and contain `noindex, nofollow`. |
| P4 | Dynamic `import.meta.glob` + `client:*` hydration → `NoMatchingImport` | Every page is `.mdx`. Full-React pages are 4-line MDX wrappers: `import X from '../components/X.tsx'` then `<X client:load />`. Eager-globbing the MDX modules for rendering in `[...slug].astro` is fine; hydration only works for statically imported islands. |
| P5 | Pagefind is absent in `astro dev`; Vite tries to resolve the import | `const pf = await import(/* @vite-ignore */ '/pagefind/pagefind.js')` in a try/catch. In dev, show "Full-text search available after build" in the Full-Text group. |
| P6 | `cmdk` filtering hides body-only Pagefind hits; rows jump as results stream in | `shouldFilter={false}`; filter structural rows yourself. Fixed group order **Series → Articles & Tabs → Sections → Full-Text Matches → Commands** (`>` mode: Commands only). Dedupe Pagefind hits by `canonicalPathname + '#' + fragment`. Discard responses whose query ≠ current query (stale guard). Debounce Pagefind (preview: 480 ms cold, 160 ms warm). |
| P7 | `<picture media="(prefers-color-scheme)">` follows the OS, not the user toggle | `ThemedVisual.astro` renders both `<img>` and toggles via `[data-sp-scheme="dark"] .sp-visual-light { display:none }` and the inverse. Both images keep `width`/`height` (zero CLS); the hidden one uses `loading="lazy"`. |
| P8 | Tailwind v4 `dark:` defaults to the media query; prototypes bloat CSS | In `src/styles/global.css`: `@custom-variant dark (&:where([data-sp-scheme="dark"], [data-sp-scheme="dark"] *));` and `@source not "../articles/*/prototypes";` |
| P9 | Expressive Code theme follows the OS | `expressiveCode({ themes: ['github-dark', 'github-light'], themeCssSelector: (theme) => \`[data-sp-scheme="${theme.type}"]\`, useDarkModeMediaQuery: false })`. Option names: verify against the Expressive Code docs. |
| P10 | Multi-series breadcrumb causes CLS or React `#418/#425` | Breadcrumbs, the switcher and Prev/Next are **Astro** markup, not React. Pre-render every membership variant with `data-sp-series-variant="<slug>"`; per-article inline `<style>` shows `html[data-sp-nav-series="<slug>"] [data-sp-series-variant="<slug>"]`. A pre-paint `is:inline` script resolves `?ctx=series:<slug>` → `sessionStorage` → `primarySeries`, validated against this article's memberships (invalid `ctx` ignores the session value, matching the preview). Each page keeps its own canonical without `?ctx=`. The switcher menu re-clamps on `resize` (known preview nit). |
| P11 | `<ClientRouter />` swaps `<html>` attributes on navigation, wiping `data-sp-*` | Re-apply prefs and nav-series in `document.addEventListener('astro:after-swap', …)` and re-sync on `astro:page-load`. Test with a tab switch in Light→Dark. |
| P12 | GitHub Pages deletes old hashed assets on deploy; Safari ITP evicts IDB after 7 days | Default: `<meta name="sp-graph-url">` + in-memory cache + browser HTTP cache (ETag/304). `sp-v8-idb` stays opt-in (`indexedDbCache: false`), keyed by hash, with atomic swap, and on any IDB error or 404 it falls back to a fresh HTTP fetch of the current meta URL. |
| P13 | Plain-Node `validate.mjs` cannot use `import.meta.glob` or Vite aliases | Use `fs` + `fast-glob`/`fs.globSync` (Node ≥22). Import `sp.config.ts` and `schema.ts` via Node type stripping, so those two files must use erasable TS only (no `enum`, no `namespace`, no parameter properties) and must not use `@/` aliases or relative imports without `.ts`. If stripping proves unreliable, run validators with `npx tsx`. |
| P14 | Keyboard dispatcher fires inside widgets | Ignore events when `ev.isComposing`, the target is `input`/`textarea`/`select`/`[contenteditable]`/`input[type=range]`/`[role=slider]`, or inside `.react-flow`; ignore `meta`/`ctrl`/`alt` except `mod+k`; **allow Shift** (`?` and `>` are shifted keys, so match on `ev.key`, not `ev.code`). Gate single keys on `prefs.singleKeyShortcuts` (WCAG 2.1.4). `g` chord timeout 900 ms. |
| P15 | Dialog focus bugs | Focus trap that excludes `tabindex="-1"` rows. `Esc` restores focus to the opener. On close, blur any focused element inside the now-hidden dialog before hiding it (avoids `aria-hidden` focus warnings). |
| P16 | Floating menus off-screen | The series switcher, display popover and chapter menus clamp to the viewport on open **and** on `resize`. |
| P17 | Command keyword matching | Each command has a separate `match` string (e.g. cycle theme matches `cycle theme rotate`), so a long label doesn't steal `dark`/`light` queries. |
| P18 | Flaky CI perf | Hard-gate CLS < 0.05, console/page errors, broken refs, anchors and leaks. LCP/INP are warn-only in CI; enforce them strictly locally through `article-qa`. |
| P19 | MP3/PDF git bloat | `generated.lock.json` input hashes prevent rewriting unchanged binaries; deterministic PDF metadata; 64 kbps mono; `media.baseUrl`/`audio.baseUrl` allow a later move to R2/Releases. |
| P20 | TS version | `typescript@^5.8`. Do not accept TS 7 upgrades (Astro 7 rejects them). |
| P21 | MP3 encoder priming delay | LAME adds roughly 1,105 samples (~46 ms at 24 kHz) of leading padding. Chapters are computed on WAV; this offset is acceptable. Do not "correct" it by hand-tuning. |
| P22 | `loudnorm` resamples internally to 192 kHz | Always pass `-ar 24000` on pass 2. |
| P23 | `j`/`k` are global next/prev-section keys **and** the `stepper` level keys | One owner: the dispatcher. In `stepper`, `EvolutionStage` subscribes to `nextSection`/`prevSection` (and `ArrowRight`/`ArrowLeft` only while focus is inside the level rail) and activates the next `#stage-l<n>`; outside the rail the default section scroll applies. Never add a second `keydown` listener. |
| P24 | Cross-file evolution rules cannot live in Zod | E7–E10 (§4.2.1) need `topology.json`, `cost-models.json` and the filesystem. Keep them in `checkEvolutionRefs()` and call it from the registry and `validate.mjs`; do not fake them in `superRefine`. |
| P25 | `scrolly` variant: pinned morphing figure costs JS and can cause CLS or motion sickness (master Risks) | Fixed-aspect sticky frame (`aspect-ratio` from `topology.viewBox`); IntersectionObserver swaps the active level; `prefers-reduced-motion: reduce` → instant swap, no transition; no-JS, print and PDF render every stage figure statically in flow; all `#stage-l<n>` sections stay in the DOM. |
| P26 | Evolution creep (master Risks): authors add "best practice" components early | E10 in `validate.mjs`; `article-reviewer` checklist (7.4) demands a concrete trigger, a deferred list and exit criteria per stage. |
| P27 | Image ⇄ Interactive toggle shifts layout or ships the topology island to every reader | `ExplainerFigure` reserves a fixed-aspect frame for both modes (CLS delta 0); the topology island hydrates only on Interactive intent (`client:visible` gated by the toggle, or dynamic import on click). No `@xyflow/react` here. |

### 6.1 Uniform container (rule, applies from Stage 2)

Source: master FR 11, Key Decision #8, Visual Direction "One container width everywhere (supersedes v1)".

| Rule | Detail |
| :--- | :--- |
| One token | `--sp-container: 1140px` with `20px` inline gutters (`padding-inline: 20px`; `max-width: calc(var(--sp-container) + 40px)`, `margin-inline: auto`). |
| Applies to every horizontal container | Top bar inner row, context (breadcrumb) bar, article header, Quick Read, Evolution Ladder, stage blocks, lab, Connections panel, footer, audio bar inner row. Full-bleed backgrounds (e.g. the audio bar) may span the viewport; their **inner row** uses the container. |
| Text runs | Left-aligned, `max-width: var(--sp-measure)` (`68ch`), never `margin-inline: auto`. Figures, the Ladder and labs use the full container width. |
| Forbidden | `--sp-breakout`, a centred prose column, per-component max-widths that differ from the container. `rg -n 'sp-breakout' src/ -g '!**/prototypes/**'` must return nothing. *(Amended S2.4: the gate excludes `prototypes/`, because frozen `v1.html` still defines `--sp-breakout` and must never be edited.)* |
| E2E acceptance (5.7) | At 1280px, the bounding-box `left` and `right` of the containers above are equal within **±1px**. At 390px, `document.documentElement.scrollWidth <= clientWidth` in Light and Dark (and for the chosen variant). |

---

## 7. Fixture-First Strategy (breaks stage circularity)

Routing, Pagefind and validators need articles before Stage 6 writes real content. So Stage 2.3 creates schema-valid fixtures:

| Fixture | Content | Replaced in |
| :--- | :--- | :--- |
| `design-url-redirection-service/article.json` | `phase: "published"`, `archetype: "design-x"`, `primarySeries: "system-design"`, `publishedAt`, `quickRead` (placeholder text marked `TODO(S6)`), `thumbnailAlt`, `features: { audio: false, pdf: false }`, 2 pages | S6 (`features` flipped to `true` after pipelines run) |
| `design-url-redirection-service/pages/{index,interactive-lab}.mdx` | 3–4 `##` headings each with ids that match the preview (`why-vanity-urls`, `bloom-filter-guard`, `ai-era-economics`, `cutover-runbook` / `topology-simulator`, `cost-economics`). **Amended 2026-11-23:** from Stage 3.9 the index page uses the evolution ids instead (`evolution-ladder`, `stage-l0` … `stage-l5`); the v1 ids are retired (AI-era and cutover notes move inside stages, see 6.2). The lab ids stay. | S6 |
| `design-url-redirection-service/data/{evolution,topology}.json` | Schema-valid 2-stage fixture (L0 baseline + L1 extend), 3–4 topology nodes, `costTierId` pointing at a fixture tier | S3.8 → full in S6.8 |
| `bloom-filter-building-block/{article.json,pages/index.mdx}` | `phase: "discussing"`, `archetype: "building-block"` | S6 |
| `src/series/series.json` | `system-design` and `edge-and-traffic-architecture`, both containing the flagship | S3 (final ordering/copy) |

The completeness gate in `validate.mjs` (S5) treats a missing *generated* artifact as an error **only** when the corresponding `features.*` flag is true, so fixtures pass until S6.

---

## 8. Stages

Common verify commands (as scripts are added in Stage 2.1):

```bash
npx astro check            # types + .astro diagnostics
npm run build              # astro build && npx pagefind --site dist
npm run validate           # S5+: pre-build plain-Node checks
npm run validate:dist      # S5+: post-build dist crawl
npm run test:e2e           # S5+: playwright test (needs a build; uses astro preview)
npm run validate:junie     # S7+
```

Target `package.json` scripts (all added in 2.1 so later stages never collide on this file; not-yet-existing scripts simply fail until their stage):

```json
{
  "dev": "astro dev",
  "build": "astro build && npx pagefind --site dist",
  "preview": "astro preview",
  "astro": "astro",
  "check": "astro check",
  "validate": "node scripts/validate.mjs",
  "validate:dist": "node scripts/validate-dist.mjs",
  "validate:junie": "node scripts/validate-junie.mjs",
  "test:e2e": "playwright test",
  "visuals": "node scripts/render-visuals.mjs",
  "audio": "node scripts/render-audio.mjs",
  "pdf": "node scripts/render-pdf.mjs"
}
```

Dev server rule (repo `AGENTS.md`): start with `astro dev --background`; manage with `astro dev stop|status|logs`.

---

### Stage 2 — Astro 7 core + `sp.config.ts` + router + `⌘K` palette + CI skeleton

**Goal:** the platform compiles, type-checks, renders fixture articles and noindex prototype routes, themes correctly with no FOUC, opens the palette, builds a Pagefind index of published `<main>` only, and deploys.

**Prerequisites:** Stage 1 done; owner has reviewed `docs/preview-guide.md` §5 (or explicitly waived it). After sign-off, the `:root`, `[data-sp-scheme="dark"]` and `[data-sp-contrast="high"]` token blocks in `v1.html` are frozen and copied verbatim. **Amended 2026-11-23:** Stage 1b (v2) is done; copy colour/semantic tokens from v1 (unchanged in v2 unless v2 says otherwise) and the **layout** tokens (`--sp-container`, `--sp-measure`) from v2, dropping `--sp-breakout` (§6.1). The stage-variant pick is **not** required to start Stage 2.

- [x] **2.1 Toolchain + Sätteri/Expressive Code probe** *(Sonnet)*
  - Files: `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`, temporary `src/pages/probe.mdx` (delete before finishing).
  - Install runtime deps: `@astrojs/mdx @astrojs/react react react-dom @tailwindcss/vite tailwindcss astro-expressive-code @astrojs/sitemap @astrojs/rss lucide-react @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-dialog cmdk@1.1.1 recharts @xyflow/react mermaid qrcode`.
  - Install dev deps: `typescript@^5.8 @astrojs/check @types/react @types/react-dom pagefind sharp @playwright/test`.
  - Probe: `probe.mdx` containing a fenced ` ```ts ` block plus a React island. Run `npm run build`; confirm `dist/probe/index.html` contains Expressive Code markup (`.expressive-code`). If it fails with a Sätteri/rehype error, `npm i @astrojs/markdown-remark` and configure it according to the Astro 7 docs, then re-probe. **Write the outcome under P1 in this doc.**
  - `astro.config.mjs`: `site: 'https://sujeet.pro'`, `trailingSlash: 'always'`, `build: { format: 'directory' }`, `prerenderConflictBehavior: 'error'` (confirm the option exists in the Astro 7 config reference; if not, drop it and rely on validate-dist duplicate-path checks), `integrations: [expressiveCode({...P9}), mdx(), react(), sitemap({ filter })]` (Expressive Code **before** MDX), `vite: { plugins: [tailwindcss()] }`.
  - `tsconfig.json`: add `"jsx": "react-jsx"`, `"jsxImportSource": "react"`, `"baseUrl": "."`, `"paths": { "@/*": ["src/*"] }`.
  - `.gitignore`: add `src/articles/*/audio/.cache/`, `src/articles/*/diagrams/.cache.json`, `playwright-report/`, `test-results/`.
  - Add all scripts from §8.
  - Accept: `npx astro check` and `npm run build` exit 0; `dist/pagefind/pagefind.js` exists; the probe file is removed.
- [x] **2.2 Contracts: `sp.config.ts` + `schema.ts`** *(Strong or Sonnet; contracts are verbatim)*
  - Files: `sp.config.ts`, `src/lib/articles/schema.ts`.
  - Copy §4.1 and §4.2 verbatim, **including the `layout` block** (`containerPx: 1140`, `measureCh: 68`, `stageVariant`, default `'split'` or the owner's recorded pick). Only `astro/zod` imports in `schema.ts` (P13). `EvolutionSchema` / `TopologySchema` (§4.2.1–4.2.2) are added in 3.8, not here.
  - Accept: `npx astro check` passes; `node -e "import('./src/lib/articles/schema.ts').then(m=>console.log(Object.keys(m)))"` prints schema names on Node 24 (else note that validators need `tsx`); `node -e "import('./sp.config.ts').then(m=>console.log(m.spConfig.layout))"` prints the `layout` block.
- [x] **2.3 Registry, fixtures, asset integration** *(Sonnet)*
  - Files: `src/lib/articles/registry.ts`, `src/series/series.json`, the fixtures from §7, `src/lib/integrations/article-assets.ts`, `astro.config.mjs` (register the integration).
  - `registry.ts`: `import.meta.glob('/src/articles/*/article.json', { eager: true })` and `import.meta.glob('/src/articles/*/pages/*.mdx', { eager: true })`; parse with `ArticleManifestSchema`; assert the folder name equals `slug`, every `pages[].entry` exists, `primarySeries` ∈ memberships from `series.json`, and every article in ≥1 series declares `primarySeries`. Export `getAllArticles()`, `getPublishedArticles()`, `getDraftArticles()`, `getArticle(slug)`, `getSeries()`, `getMemberships(slug)`, `getPrototypes()` (numeric sort of `prototypes/v(\d+).html`).
  - `article-assets.ts`: an Astro integration with an explicit allow-list: `data/*.json`, `diagrams/*.webp`, `social/linkedin-card.png`, `social/thumbnail-{light,dark}.webp`, `social/thumbnail.png`, `audio/episode.mp3`, `audio/chapters.json`, `exports/<slug>.pdf` → `/<slug>/<slug>.pdf`. Copy only for articles that are published, or that are drafts *and* the asset is needed by a direct-URL page. Simplest rule: copy for all articles, and let validate-dist ensure no published page links to draft assets. `astro:server:setup` adds middleware serving the same map in dev with HTTP `Range` support (206 + `Content-Range`, `Accept-Ranges: bytes`) for MP3 seeking. `astro:build:done` copies into `dist/`. Never copy `audio/script.json`, `audio/.cache/`, `diagrams/*.json|*.mmd`, or `prototypes/`. Also export a `mediaUrl(slug, relPath)` helper honouring `spConfig.media.baseUrl` / `audio.baseUrl`. Reserve the dev-only `injectRoute` hook behind `SP_PDF_RENDER === '1'` (body in S4).
  - Accept: `npm run build` → `dist/design-url-redirection-service/` exists for the fixture; `curl -sI -H 'Range: bytes=0-1' http://localhost:4321/<slug>/audio/episode.mp3` returns 206 once an MP3 exists (re-check in S4).
- [x] **2.4 Global CSS, BaseLayout, theme controls, print notice, 404** *(Sonnet)*
  - Files: `src/styles/global.css`, `src/layouts/BaseLayout.astro`, `src/components/ThemeControls.tsx`, `src/components/ui/PrintNotice.astro`, `src/pages/404.astro`, `src/pages/index.astro` (minimal listing).
  - `global.css`: `@import "tailwindcss";` + P8 lines + `--sp-*` tokens copied from the preview (§9 anchors) + `[data-sp-text="large"]` scale + reduced-motion block + print guard scoped `:root:not([data-sp-export="pdf"])` (hide shell and audio bar, show `.sp-print-notice` only when `<html data-sp-has-pdf>`; otherwise print clean prose).
  - Layout tokens per §6.1: `--sp-container: 1140px`, `--sp-measure: 68ch` (values equal `spConfig.layout`), one `.sp-container` utility (`max-width: calc(var(--sp-container) + 40px); margin-inline: auto; padding-inline: 20px`) and one `.sp-measure` utility (`max-width: var(--sp-measure)`, left-aligned). No `--sp-breakout`. The top bar renders its inner row inside `.sp-container`; the footer does too.
  - `BaseLayout.astro` props: `title`, `description`, `canonicalPath`, `noindex?`, `hasPdf?`, `pdfUrl?`, `navSeries?: { primary: string; memberships: string[] }`, `pagefindBody?: boolean`, `ogImage?`. Contents: `<ClientRouter />`; an `is:inline` pre-paint script (port from preview lines ~8–62) that reads `sp-v8-prefs`, resolves `auto` via `matchMedia`, sets the §4.1 attributes and resolves nav-series (P10), with re-apply on `astro:after-swap` (P11) and a `matchMedia` change listener for `auto`; `<link rel="canonical" href={new URL(canonicalPath, spConfig.siteUrl)}>` (never includes the query); `<meta name="robots" content="noindex, nofollow">` when `noindex`; `<meta name="sp-graph-url">`; 56px sticky top bar (brand, Articles, Series, Explore, `⌘K` trigger, theme button, `?` button); `<main data-pagefind-body={pagefindBody ? '' : undefined}>`; `PrintNotice` when `hasPdf`.
  - Accept: no FOUC on reload in dark (Playwright screenshot at `domcontentloaded`); `t` key placeholder not needed yet; `npx astro check` passes; `rg -n 'sp-breakout' src/ -g '!**/prototypes/**'` returns nothing; top bar inner row and footer have equal left/right edges (±1px) at 1280px (quick Playwright check; formal spec in 5.7).
- [x] **2.5 Article router, ArticleLayout skeleton, prototype route** *(Sonnet)*
  - Files: `src/pages/[...slug].astro`, `src/layouts/ArticleLayout.astro`, `src/components/ui/{QuickRead,Callout}.astro`, `src/pages/[slug]/prototype/[...variant].astro` (P3).
  - `[...slug].astro` `getStaticPaths()`: one path per article page (`<slug>` for the index page, `<slug>/<page.slug>` otherwise), for **all** articles; props carry `isDraft`. Drafts render with `noindex` and `pagefindBody=false`; published pages use `pagefindBody=true` and add `data-pagefind-filter="series:<slug>"` per membership plus `data-pagefind-filter="entityType:article"` (or `tab`).
  - `ArticleLayout.astro`: header (archetype · updated date, title, subtitle), action bar placeholders (Listen / PDF / Copy AI Prompt), `QuickRead` on the index page, tab nav (`<a>` links to each page with `aria-current="page"`), `<slot />`, and a footer slot for ConnectionsPanel (S3). Context bar, header, Quick Read, tab nav and body wrapper all sit in `.sp-container`; prose inside the slot gets `.sp-measure` (§6.1).
  - Prototype route: emits `/<slug>/prototype/` (max N) and `/<slug>/prototype/vN/`, ensures the robots meta, strips any `data-pagefind-body`, and injects a small fixed "Prototype vN · unlisted" banner. For the flagship this serves **v1 and v2**; `/prototype/` = **v2** (numeric sort, not lexical). The banner must not cover v2's pinned Layout switcher; `?layout=` query strings must reach the v2 script unchanged.
  - Accept: `npm run build` → `dist/design-url-redirection-service/index.html`, `…/interactive-lab/index.html`, `…/prototype/index.html` (v2 content), `…/prototype/v1/index.html`, `…/prototype/v2/index.html`, `dist/bloom-filter-building-block/index.html` (noindex). `rg -l --glob '*.html' 'data-pagefind-body' dist` lists only published article pages. `rg 'Expressive|expressive-code' dist/design-url-redirection-service/index.html` matches if a code block exists.
- [x] **2.6 Keyboard dispatcher, shortcuts modal, command palette, interim graph index** *(Strong)*
  - Files: `src/lib/keyboard/dispatcher.ts`, `src/components/ShortcutsModal.tsx`, `src/components/CommandPalette.tsx`, `src/lib/graph/build-graph.ts` (interim: series + articles + pages + sections from MDX `getHeadings()` depth 2–3, `edges: []`), plus the emission of `graph-index.<hash>.json`. Choose one mechanism: (a) a static endpoint `src/pages/graph-index.[hash].json.ts` with a single `getStaticPaths` entry, or (b) the integration writing the file in `astro:build:done` and serving it in dev. Pick (a) if Astro accepts a param inside a dotted segment; verify with a build.
  - Dispatcher: a single `keydown` listener on `document`, a binding table from `spConfig.shortcuts`, the rules in P14/P15, an `on(action, handler)` registry so islands (audio, tabs) subscribe, and `isEnabled()` reading `singleKeyShortcuts`. Mirror the preview ordering (preview lines ~4383–4491): Esc → mod+K → modal handling → modifier ignore → editable ignore → WCAG gate → chord → single keys.
  - Palette: `cmdk` `Command.Dialog`, `shouldFilter={false}`, own matching over the graph index (title + subtitle + concepts + tags + page titles + section titles), and the group order in P6. Commands: theme cycle/auto/light/dark, contrast, text size, audio play/pause, jump to section being discussed, download PDF (opens URL), preview print notice, copy AI prompt, open explore, go home, toggle drafts (`/?drafts=true`), keyboard shortcuts. Each has a `match` string (P17) and a `kbd` hint. `/` opens Search mode, `>` opens Commands mode (input prefilled `> `). Lazy-load the graph index on first open (or `requestIdleCallback`), and Pagefind per P5.
  - Mount `<CommandPalette client:idle />` in BaseLayout and give it `transition:persist="sp-palette"`.
  - Accept (manual + quick Playwright smoke): cold `⌘K` opens in < 200 ms after load (`qaBudgets.maxFirstPaletteMs`); typing `bloom` shows no row jump between keystrokes once Pagefind results arrive; `?` opens the modal; the WCAG toggle disables `t`.
- [x] **2.7 CI walking skeleton** *(Sonnet)*
  - Files: `.github/workflows/deploy.yml` only.
  - Insert `- run: npx astro check` before `npm run build` (keep the existing `concurrency`, permissions and actions versions).
  - Accept: YAML parses (`npx yaml-lint` or `yq . .github/workflows/deploy.yml`); push only when the owner asks.

**Verify (Stage 2):**

```bash
npx astro check && npm run build
ls dist/design-url-redirection-service/prototype/v1/index.html dist/design-url-redirection-service/prototype/v2/index.html dist/pagefind/pagefind.js
rg -c 'noindex, nofollow' dist/bloom-filter-building-block/index.html dist/design-url-redirection-service/prototype/index.html dist/design-url-redirection-service/prototype/v2/index.html
rg -q 'Prototype v2' dist/design-url-redirection-service/prototype/index.html && echo "ok (latest=v2)" || echo "FAIL (latest)"
rg -n 'sp-breakout' src/ -g '!**/prototypes/**' && echo "FAIL (breakout)" || echo "ok (container)"
rg -l --glob '*.html' 'data-pagefind-body' dist | rg -v 'design-url-redirection-service/(index|interactive-lab)' && echo "LEAK" || echo "ok"
find dist -path '*print-export*' | rg -q . && echo "LEAK (path)" || echo "ok (path)"
rg -l --glob '*.html' -e 'href="[^"]*print-export' -e 'src="[^"]*print-export' dist && echo "LEAK (href/src)" || echo "ok (href/src)"
```

**Definition of done:** all checkboxes ticked; the Verify block prints only `ok` lines plus the files; dark-mode reload shows no flash; `⌘K`, `/`, `>`, `?` work on an article page.

**Stage 2 implementation notes (2026-11-23):**

| Topic | What was built / decided |
| :--- | :--- |
| Toolchain (2.1) | astro 7.4.13, @astrojs/mdx 8.1.6, @astrojs/react 7.1.9, astro-expressive-code 0.44.4, tailwindcss 4.3.5, react 19.3.1, cmdk **1.1.1 (exact)**, typescript 5.9.3, pagefind 1.6.0, @playwright/test 1.65.1. No peer conflicts, no `--force`/`--legacy-peer-deps`. P1 result recorded in §6. |
| Sitemap (deviation, added) | `astro.config.mjs` reads `src/articles/*/article.json` with `fs` and drops drafts and `/prototype/` URLs from the sitemap. Without it, `@astrojs/sitemap` listed the draft fixture (a §3 leak the Stage 2 Verify block does not check). |
| Prefs (2.4, added file) | `src/lib/prefs.ts` holds `readPrefs` / `setScheme` / `cycleScheme` / `setContrast` / `setTextSize` / `setSingleKeyShortcuts`; it merges into `sp-v8-prefs` and emits `sp:prefs-changed`. The pre-paint script reads per-page config from `<meta name="sp-boot">` so `window.__spApplyPrefs` re-reads nav-series after each ClientRouter swap (P11). |
| Prototype route (2.5) | `[...variant].astro` + `<Fragment set:html>` works (doctype kept, no hoisting); P3 fallback not needed. The banner class is `sp-proto-unlisted` (v2 already owns `.sp-proto-banner`), placed bottom-left, clear of v2's bottom-right Layout switcher. |
| Verify gate fixes | `sp-breakout` gate excludes `prototypes/` (frozen v1). Pagefind leak gate uses `--glob '*.html'` (`pagefind-highlight.js` contains the string `data-pagefind-body`). |
| Graph index (2.6) | Option (a) works: `src/pages/graph-index.[hash].json.ts` (Astro accepts a param inside a dotted segment). sha256 over the canonical body, 10 hex chars. Fixture size: 621 B gzipped. BaseLayout defaults `<meta name="sp-graph-url">` to it. Published articles only. |
| Dispatcher (2.6) | `src/lib/keyboard/dispatcher.ts`: one `keydown` listener installed from a bundled BaseLayout module script; `on/has/trigger/isEnabled/kbdHint/openPalette/openShortcuts/jumpSection`. While any Radix dialog is open, only `mod+k` is handled (Radix owns Tab trap, Esc and ↑/↓/↵). Palette/shortcut requests made before `client:idle` hydration are buffered on `window`. `j`/`k` honour root `scroll-padding-top` + heading `scroll-margin-top`. |
| Palette (2.6, deviation) | Own `@radix-ui/react-dialog` wrapping `<Command shouldFilter={false}>` instead of `Command.Dialog`: it allows a hidden `Dialog.Title`/`Description` (Radix logs a console error without one), inline rendering that survives `transition:persist`, and explicit opener focus restore (P15). Commands for features not built yet (audio, PDF, print notice, AI prompt) are **hidden until available** (`has(action)` or DOM/meta presence), not shown dead. Series rows open the first article with `?ctx=series:<slug>` until `/series/<slug>/` exists (TODO(S3)). `/explore/` is still a 404 until S3. |
| CI (2.7) | `npx astro check` inserted before `npm run build`; YAML validated with `yq`. Done inline (one-line change) rather than by a subagent. |
| Not done | No Strong-tier end-of-stage review pass yet (§1.2 cost tip); no commit (owner instruction). Stage 2 E2E specs are formalised in S5. |

**Rollback / pitfalls:** if the Sätteri probe fails and `@astrojs/markdown-remark` does not fix it, temporarily drop Expressive Code (plain Shiki with dual themes via CSS variables) and record a TODO. Revert dependency changes with `git checkout package.json package-lock.json` (only for changes made in the current session).

---

### Stage 3 — Knowledge graph + multi-series breadcrumbs + `/explore/` + interactive primitives + evolution components + audio player

**Goal:** many-to-many series navigation with zero CLS, static Connections & Backlinks, `/explore/` graph, Design X widgets driven by JSON, evolution-first stage components in the chosen layout variant, and a persistent cross-tab audio player.

**Prerequisites:** Stage 2 DONE. For 3.9–3.11: the owner's `spConfig.layout.stageVariant` pick is recorded (§1 "Blocking input" row). Without it, build `split` only if the owner explicitly accepts the default.

**Execution order:** 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → **3.8** → 3.6 → 3.9 → 3.10 → 3.11 → 3.7. (3.8 provides the schemas and fixtures that 3.6 reads; the numbering is kept stable so older references stay valid.)

- [x] **3.1 Graph compiler** *(Strong)*
  - Files: `src/lib/graph/build-graph.ts`, `src/series/series.json` (final copy: `system-design` "System Design" with the flagship at index 0; `edge-and-traffic-architecture` "Edge & Traffic Architecture" with the flagship at index 1 if a second article exists, else index 0. The preview's "1/4" and "2/3" counts are illustrative, so use real counts).
  - Build: memberships (series → ordered articles, published only); edges from `relations[]` with `from.page` (from `<ArticleRef>` usage when available; relations are article-level); `referencedBy` reverse map including the source tab; cycle detection on `prerequisite` + `deep-dive-of` (DFS, throw with the cycle path); unknown `targetSlug`/`targetPage`/`targetSection` → throw; a published→draft relation is allowed but marked `upcoming: true` (rendered unlinked, never emitted in the index).
  - Emit the final `GraphIndex` (§4.3). The hash is sha256 of the JSON body.
  - Accept: unit check via a tiny script or `astro check`; `dist/graph-index.*.json` contains no draft slug (`rg bloom-filter-building-block dist/graph-index.*.json` → no match; *amended S3.1: the bare `bloom-filter` matches the flagship's own concept and section id*); gzipped size < 25 KB (`gzip -c dist/graph-index.*.json | wc -c`).
- [x] **3.2 Index cache helper** *(Sonnet)*
  - File: `src/lib/cache/idb-cache.ts`. `getGraphIndex(): Promise<GraphIndex>` reads `<meta name="sp-graph-url">`, keeps an in-memory promise, and fetches with `cache: 'default'` (ETag/304 via the browser). When `spConfig.features.indexedDbCache` is true it opens `sp-v8-idb` (store `blobs`, key = hash), returns a hit, otherwise fetches, writes in one transaction and deletes other keys; any IDB error or `onblocked` → HTTP path. A 404 on the hashed URL triggers one retry after re-reading the meta tag (stale tab after deploy).
  - Accept: palette works with the flag both `false` and `true` (flip locally, do not commit `true`).
- [x] **3.3 Multi-series breadcrumbs, switcher, Prev/Next, Connections panel, ArticleRef** *(Strong)*
  - Files: `src/layouts/ArticleLayout.astro`, `src/components/ui/{ConnectionsPanel.astro,ArticleRef.astro,ArticleRefCard.tsx}`.
  - Breadcrumb `Home › Series › [<Active> ▾] › <Article>`: every membership variant is pre-rendered (P10). The switcher is a `<button aria-haspopup="menu">` + `role="menu"` with `menuitemradio` items, plus an "Also in:" chip. Selecting an item writes `sessionStorage["sp-v8-nav-series"]`, sets `html[data-sp-nav-series]` and `history.replaceState` to add `?ctx=series:<slug>`; the canonical stays clean. The menu clamps on open and `resize` (P16). Use a small `<script>` (Astro-bundled, not React), idempotent on `astro:page-load`.
  - Series hub links and series-scoped Prev/Next links append `?ctx=series:<slug>`.
  - `ConnectionsPanel.astro` (zero JS): Part of Series (with position `n / total`), Prerequisites, Uses Building Blocks, Builds On / Deep Dive Of, Referenced By (source article › tab › §section), and Prev/Next variants.
  - `ArticleRef.astro`: published target → link card (`/<slug>/[page/]#section`); draft target → `ArticleRefCard` "Coming Soon" with **no** `href`/slug attribute.
  - Accept: `?ctx=series:edge-and-traffic-architecture` activates that variant before first paint (no visible swap); `?ctx=series:bogus` → primary; Playwright CLS < 0.05; zero React hydration warnings in the console; `rg 'bloom-filter-building-block' dist/design-url-redirection-service/index.html` → no `href` match.
- [x] **3.4 Homepage, series hub, ArticleCard, drafts discovery** *(Sonnet)*
  - Files: `src/pages/index.astro`, `src/components/ui/ArticleCard.astro`, `src/pages/series/[series].astro`, `src/components/DraftDiscovery.tsx`, `src/pages/drafts-index.json.ts`.
  - Homepage: hero line, archetype filter pills (client-side, no CLS: filter via `hidden` attribute), article cards (thumbnail 16:9 with explicit `width`/`height`, pills `DESIGN X · 2 SERIES`, Quick Read minutes, 🎧 duration when audio exists, PDF badge), and series package cards. `<DraftDiscovery client:idle />` renders nothing unless `?drafts=true`; then it fetches `/drafts-index.json` and shows the tray.
  - `drafts-index.json.ts` emits `DraftsIndexSchema` (drafts + prototypes). This file is the only place draft URLs exist in `dist/`.
  - Accept: `rg -l 'bloom-filter-building-block' dist --glob '*.html' --glob '!**/prototype/**'` lists only the draft's own page (*amended: the frozen prototype pages are unlisted-tier and mention the slug*); the drafts tray appears only with the flag.
- [x] **3.5 `/explore/`** *(Sonnet)*
  - Files: `src/pages/explore.astro`, `src/components/ExploreGraph.tsx`.
  - Static accessible matrix first (series × articles table, archetype and building-block lists), then an SVG graph island (`client:visible`) whose node positions are computed at build time (simple layered layout: series column, articles column, blocks column, as in the preview). Edge styles per §9. Filters: series, archetype. Clicking or pressing Enter on a node shows a preview pane with a link. No `@xyflow/react` on article pages; avoid it here too unless needed.
  - Accept: the page works with JS disabled (matrix); filters hide nodes; keyboard focus reaches every node.
- [x] **3.6 Interactive primitives + data hook** *(Sonnet, Strong review)* — run after 3.8
  - Files: `src/hooks/useArticleData.ts`, `src/components/interactive/{SystemTopology,ScaleVariantSwitcher,CostModelCalculator}.tsx`, fixture `data/cost-models.json` (tier ids match the fixture `costTierId`s). `SystemTopologySchema` is the alias added in 3.8 (§4.2.2); `diagrams/architecture.diagram.json` is only needed for non-evolution diagrams.
  - `useArticleData<T>(slug, relPath, schema)`: fetches `mediaUrl(slug, relPath)`, validates and returns `{ data, error, loading }`.
  - `SystemTopology`: SVG nodes as focusable `role="button"` with `aria-label`, plus an inspector with Healthy / 10× latency / Outage, blast-radius list, fallback path drawing, reset, and Generic ↔ AWS labels. Semantics: healthy `#10B981`, degraded `#F59E0B`, failed `#EF4444`, fallback `#8B5CF6` via `--sp-status-*`.
  - `SystemTopology` props: `mode: 'stage' | 'diff' | 'lab'`, `level`, `fromLevel?` (diff), data from `data/topology.json` + `data/evolution.json`. `stage` draws `activeSet(level)`; `diff` draws `activeSet(level)` plus the previous level's removed nodes, with added nodes highlighted (accent/healthy outline) and removed nodes struck through (dashed, muted, `aria-label` "removed at L<n>"); `lab` adds the level picker, cloud toggle and full failure inspector. Failure/slowdown injection works in `diff` and `lab`. Node positions come from `topology.json` (fixed across levels).
  - `ScaleVariantSwitcher` **becomes a level picker** over `evolution.json`: `role="radiogroup"`, one radio per stage (`L<n> · <title>`, mode badge, cost band), plus the cloud toggle. The old `tier1/tier2/tier3` list and the separate click-tracking toggle are retired (tracking is L4). Selecting a level drives `SystemTopology` (`lab`) and `CostModelCalculator` (that stage's `costTierId`).
  - `CostModelCalculator`: renders `CostModelSchema` rows per tier, the AWS list total, enterprise range from `enterpriseDiscountRangePct`, a point estimate from a slider, `pricingAsOf` plus visible source links, and an "illustrative assumption" badge on any non-sourced line.
  - Accept: works inside a 4-line MDX wrapper with `client:visible`; keyboard operable; typing in sliders doesn't trigger shortcuts; the level picker changes the topology and cost rows together; `diff` at a `replace` fixture level shows the removed node struck through.
- [x] **3.7 Persistent audio player** *(Strong)*
  - Files: `src/components/AudioPlayer.tsx`, `ArticleLayout.astro` (mount), `src/components/ui/{StepFrame,ChartFrame}.tsx`.
  - Mount `<AudioPlayer client:idle transition:persist="sp-audio-player" slug={…} chaptersUrl={…} srcUrl={…} />` only when `features.audio` is true and `chapters.json` exists. Use `<audio preload="none">`. Controls: play/pause, scrub, ±15 s, speed 1–2×, chapter drawer, transcript drawer, collapse, "Jump to Section" (navigate to `targetPage` via `navigate()` from `astro:transitions/client`, then scroll to `#targetSectionId`), Auto-Follow (default OFF; pauses on manual scroll/wheel/touch; respects `prefers-reduced-motion`), and Media Session metadata + action handlers. Announce chapter changes in a polite live region only (never per-second). Subscribe to dispatcher actions `toggleAudio`, `seekBack`, `seekForward`. When navigating to a different article (slug change), stop and reset.
  - Accept: start on Overview → click the Lab tab → `audio.currentTime` keeps increasing, with exactly one `<audio>` element in the DOM (`page.locator('audio').count() === 1`).
- [x] **3.8 Evolution + topology schemas, helpers, fixtures** *(Strong)* — run before 3.6
  - Files: `src/lib/articles/schema.ts` (add §4.2.1 `EvolutionStageSchema`, `EvolutionBaseSchema`, refined `EvolutionSchema`; §4.2.2 `TopologySchema` + `SystemTopologySchema` alias), `src/lib/articles/evolution.ts` (`activeSet`, `stageDiff`, `checkEvolutionRefs`), `src/lib/articles/registry.ts` (load `data/evolution.json` + `data/topology.json` when present, run `EvolutionSchema` then `checkEvolutionRefs`, expose `getEvolution(slug)`), fixtures `data/{evolution,topology}.json` (§7).
  - Verify the Zod 4 `superRefine`-on-`strictObject` assumption first (§4.2.1) and write the outcome next to that note.
  - Accept: `npx astro check` passes; the fixture parses; each of E1–E10 rejects a scratch copy that breaks it (temporary file outside `src/articles/`, deleted afterwards), with the message path from the §4.2.1 table; `node -e "import('./src/lib/articles/evolution.ts')…"` loads under Node type stripping (P13).
- [x] **3.9 `EvolutionLadder.astro` + `EvolutionStage.astro` (chosen variant only)** *(Sonnet, Strong review)*
  - Files: `src/components/evolution/{EvolutionLadder.astro,EvolutionStage.astro}`, `src/styles/global.css` (variant styles only).
  - Reference: v2 Ladder and stage blocks (§9.2). Implement **only** `spConfig.layout.stageVariant`; do not ship the other three or a runtime switcher.
  - `EvolutionLadder`: zero-JS table/list in `.sp-container`, `id="evolution-ladder"`; one row per level: level, mode badge (`baseline` / `extend` / `replace ↻`), trigger kind, headline decision, cost band; each row links to `#stage-l<n>`.
  - `EvolutionStage`: one real `<section id="stage-l<n>">` with an H2 `L<n> · <title>` per stage; trigger card (kind + headline + scenario), requirement chips, 2–5 key-point bullets (`.sp-measure`), decision add/change/remove/defer (`defer` shows `until`), `ExplainerFigure` slot (3.10), build-vs-buy verdict + rationale, cost band from the stage's `costTierId`, exit criteria ("Move up when…"; omitted on the last stage).
  - Per-variant notes (build only the picked one):

    | Variant | Implementation notes |
    | :--- | :--- |
    | `split` | Two-column grid inside the container: bullets left (~60ch), figure right. Stacks to one column **below 900px** (figure after bullets). Zero JS beyond the figure toggle. |
    | `scrolly` | Left column of stage sections; right column a `position: sticky` **fixed-aspect** frame (aspect from `topology.viewBox`). An IntersectionObserver (one instance, threshold ~0.5) sets the active level and swaps the figure. `prefers-reduced-motion: reduce` → instant swap, no transition. **No-JS and print/PDF fallback:** every stage renders its own static figure in flow (the sticky frame is progressive enhancement, hidden without JS and under `@media print` / `data-sp-export="pdf"`). See P25. |
    | `stacked` | Trigger card → `.sp-measure` bullets → full-container figure → decision/cost strip. Zero JS beyond the toggle. Best print fidelity. |
    | `stepper` | Horizontal level rail `L0 ─ … ─ L5` (`role="tablist"` or radio pattern). One level visible at a time, but **all `#stage-l<n>` sections stay in the DOM** (inactive ones hidden with a class, not removed) for search, print and SEO; print/PDF shows all. `←`/`→` and `j`/`k` move between levels via the dispatcher (P23). **Hash activation:** `#stage-l<n>` in the URL activates that level on load and on `hashchange`; changing level updates the hash with `history.replaceState`. Small Astro-bundled script, idempotent on `astro:page-load`. |

  - Accept: the page renders all stages with JS disabled (stepper/scrolly fall back to stacked flow); each stage block's left/right edges equal the header's (±1px) at 1280px; no horizontal overflow at 390px; zero hydration warnings; variant-specific: `split` stacks at 899px, `stepper` keys and hash activation work, `scrolly` swaps without animation under reduced motion.
- [x] **3.10 `ExplainerFigure.astro` + `FigureModeToggle.tsx`** *(Strong)*
  - Files: `src/components/evolution/{ExplainerFigure.astro,FigureModeToggle.tsx}`; uses `ThemedVisual.astro` (lands in 4.1; until then render the WebP pair inline with the same P7 CSS, or a placeholder box of the right size).
  - Static by default: `ThemedVisual` of `diagrams/<visual>-{light,dark}.webp` with explicit `width`/`height`, inside a **fixed-aspect frame**. Figure caption `Fig <level>.<n>`.
  - `[ Image | Interactive ]` toggle (`FigureModeToggle`, a small island) appears only when `figures[].interactive !== 'none'`. Interactive mounts `SystemTopology` in `diff` (or `stage`) mode **inside the same frame**. The topology island is hydrated **only on Interactive intent**: either `client:visible` on a wrapper rendered after the first toggle, or a dynamic `import()` on click. Readers who never toggle download no topology JS.
  - Multi-figure gallery when `figures.length > 1`: `‹ ›` buttons, `Fig n.m · m/k` counter, arrow keys only while focus is in the gallery (P14).
  - Accept: toggling Image ⇄ Interactive produces **CLS delta 0** (measured with the `layout-shift` observer from 5.3, or an ad-hoc observer now); network panel shows no topology chunk before the first toggle; the diff highlights added nodes and strikes removed ones on a `replace` level; failure injection works in Interactive mode; keyboard: toggle reachable and operable with Enter/Space.
- [x] **3.11 Stage sections → graph index, `⌘K`, audio targets** *(Sonnet)*
  - Files: `src/lib/graph/build-graph.ts`, `CommandPalette.tsx` (only if section labels need the level prefix). No `AudioScriptSchema` change.
  - **Verified S3.11:** MDX `getHeadings()` does **not** include H2s rendered inside Astro components; `sectionsOf()` in `build-graph.ts` scans the raw MDX and injects ladder/stage sections from `getEvolution`.
  - Add `evolution-ladder` and every `stage-l<n>` (title `L<n> · <title>`, level 2) to that page's `sections[]` in the graph index. **Assumption to verify:** MDX `getHeadings()` returns only Markdown headings, not H2s rendered inside Astro components; if so, inject stage sections from `getEvolution(slug)` instead of relying on `getHeadings()`.
  - Audio chapters may set `targetSectionId: "stage-l<n>"`; `validate-dist` (5.2) already checks the id exists on the target page.
  - Accept: `⌘K` "bloom" lists `L3 · …` (fixture title) under Sections and Enter scrolls to `#stage-l3` (in `stepper`, activates L3); `graph-index` stays < 25 KB gzipped.

**Verify (Stage 3):**

```bash
npx astro check && npm run build
gzip -c dist/graph-index.*.json | wc -c        # < 25600
rg -l 'bloom-filter-building-block' dist --glob '!drafts-index.json' --glob '!bloom-filter-building-block/**' --glob '!**/prototype/**'   # expect no output
rg -c 'id="stage-l[0-9]+"' dist/design-url-redirection-service/index.html   # = number of fixture stages
rg -q 'stage-l1' dist/graph-index.*.json && echo "ok (stage sections indexed)" || echo "FAIL (stage sections)"
```

**Definition of done:** checkboxes ticked; manual run of preview-guide assertions #10, #11, #12, #13, #14 and #17 against `astro preview` passes.

**Pitfalls:** P6, P10, P11, P12, P14, P16, P23–P27. Do not put breadcrumbs in React. Do not import `@xyflow/react` on article pages. Do not ship the three unpicked layout variants.

---

### Stage 4 — Local media pipelines (visuals/thumbnails, MLX Kokoro audio, branded PDF, `llms.txt` / SEO-AEO)

**Goal:** local scripts generate hash-locked binaries inside the article folder; LLM/SEO endpoints are deterministic.

**Prerequisites:** Stage 3 DONE. Local tools: `brew install ffmpeg uv` (verify with `ffmpeg -version`, `uv --version`); Apple Silicon for MLX.

- [x] **4.1 Visuals pipeline + `ThemedVisual.astro`** *(Sonnet)*
  - **Done 2026-11-23:** renders through a dev-only `/visuals-export/[slug]` route (`SP_VISUALS_RENDER=1`, `src/lib/integrations/visuals-route.ts`) that mounts `SystemTopology static` itself, so the images cannot drift from the interactive view (no forked render function). 16 artifacts (6 stage pairs at 1600×900, thumbnails 800×450, LinkedIn card 1200×628 at 142 KB); byte-deterministic; inputHash includes `global.css` and component CSS, so any token edit re-renders. Generic `*.diagram.json` / `*.mmd` rendering is deferred until a non-evolution article needs it.
  - Files: `scripts/render-visuals.mjs`, `src/components/ui/ThemedVisual.astro`.
  - For each article (or `--slug <slug>`): render `diagrams/*.diagram.json` (via an internal HTML template that draws the topology SVG) and `*.mmd` (Mermaid in the page, theme light/dark) in Chromium at DPR 2. Screenshot, then convert with Sharp to `<name>-light.webp` and `<name>-dark.webp` (quality 82). Thumbnails `social/thumbnail-{light,dark}.webp` (800×450) + `social/thumbnail.png`; `social/linkedin-card.png` 1200×628 (fail if > 5 MB). Skip any artifact whose `inputHash` (sha256 of the spec + template + tool versions) matches `generated.lock.json`.
  - **Evolution articles:** for each stage and each `figures[]` entry, render `diagrams/<visual>-{light,dark}.webp` (flagship: `diagrams/stage-l<n>-{light,dark}.webp`) from `data/topology.json` + `activeSet`/`stageDiff` (§4.2.2) using the **same SVG drawing code** as `SystemTopology` `stage` mode (import the pure render function; do not fork it), so the static image and the interactive view cannot drift. Output dimensions = `topology.viewBox` aspect, matching the `ExplainerFigure` frame. `inputHash` covers `evolution.json` + `topology.json` + template + tool versions.
  - **LinkedIn card from the Ladder:** `social/linkedin-card.png` for evolution articles renders the Evolution Ladder (levels, mode badges, cost bands) with title and `sujeet.pro` branding.
  - Accept (evolution): E9 (§4.2.1) passes as an error-level check after the run.
  - `ThemedVisual.astro` props: `slug`, `name`, `alt`, `width`, `height`, `id?` (anchor for `targetVisualId`). Implements P7.
  - Accept: running the script twice leaves `git status` clean the second time.
- [x] **4.2 MLX synthesizer** *(Sonnet)* — **Verified 2026-11-23 on mlx-audio 0.6.7:** `mlx_audio.tts.utils.load_model(repo_id)` (`tts/utils.py:110`) + `KokoroModel.generate(text, voice=, speed=, lang_code=)` (`tts/models/kokoro/kokoro.py:295`, a generator of `GenerationResult{audio, sample_rate}`; native 24 kHz). Extra deps: `misaki[en]==0.9.4` (not pulled by mlx-audio), spaCy `en_core_web_sm` pinned as a wheel URL; all pins in the script header. The Kokoro pipeline prints to stdout, so the script redirects `sys.stdout` to stderr and keeps the real stdout for JSON lines. Cold first run 2m02s (355 MB model + ~1.2 GB uv env incl. torch); warm ~1.8 s per short chunk; fully offline after the first run.
  - File: `scripts/audio/synthesize_mlx.py` (Python 3.12, uv inline script metadata `# /// script` with `dependencies = ["mlx-audio", "soundfile", "numpy"]`; pin versions after the first successful run).
  - Input: JSON on stdin `{ model, voice, langCode, speed, sampleRateHz, chunks: [{ key, text }] }`. Output: `audio/.cache/<key>.wav` (mono, 24 kHz, PCM16) for each missing key, and a JSON line per chunk `{ key, samples }` on stdout.
  - **Assumption to verify:** the exact `mlx-audio` Python API for Kokoro (model load + `generate(text, voice=…, speed=…, lang_code=…)`) may differ by version. Read the `mlx-audio` README at implementation time; do not guess the signature.
  - Run with: `uv run --python 3.12 scripts/audio/synthesize_mlx.py`.
- [x] **4.3 Audio orchestrator** *(Strong)* — **Amended 2026-11-23:** both loudnorm passes are prefixed with `alimiter=limit=0.2:level=false:attack=5:release=50`. Without it Kokoro's ~20 dB peak-to-loudness ratio forces loudnorm into dynamic mode and output lands at −17.1 LUFS (fails −16 ± 1); with it, −16.3 LUFS. MP3 encode is byte-deterministic for the same WAV; Kokoro synthesis is **not** deterministic, so never run `npm run audio -- --force` on a fresh clone unless you mean to replace the committed MP3 (the lock skip protects normal runs).
  - File: `scripts/render-audio.mjs`.
  - Steps: validate `audio/script.json` (`AudioScriptSchema`) → apply lexicon (whole-word, case-sensitive) to `spoken ?? text` → cache key = sha256 of `JSON.stringify([model, voice, langCode, speed, toolVersion, spokenText])` → call the Python synthesizer for misses → stitch the WAVs in Node (PCM concat + `paragraphPauseMs` / `chapterPauseMs` silence), tracking sample offsets → chapter `startSec = offsetSamples / 24000` → write `stitched.wav` to `audio/.cache/`.
  - Then run the two-pass FFmpeg:
    ```bash
    ffmpeg -hide_banner -i stitched.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -
    ffmpeg -hide_banner -y -i stitched.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=<I>:measured_TP=<TP>:measured_LRA=<LRA>:measured_thresh=<thresh>:offset=<offset>:linear=true -ar 24000 -ac 1 -c:a libmp3lame -b:a 64k audio/episode.mp3
    ```
  - Emit `audio/chapters.json` (`AudioChaptersOutputSchema`, transcript = `text` paragraphs) and update `generated.lock.json`.
  - Accept: a second run performs zero synthesis calls; `ffprobe` duration matches `durationSec` within 0.1 s; `ffmpeg -i audio/episode.mp3 -af ebur128 -f null -` reports an integrated loudness of −16 ± 1 LUFS.
- [x] **4.4 Print layout, dev-only route, PDF renderer** *(Strong)*
  - **Done 2026-11-23:** islands are suppressed via a per-request print flag (`src/lib/print.ts` on `Astro.locals`) plus `PrintIslands.astro`, which replaces each `<astro-island>` with a QR "See the interactive lab" box and absolutises links. `render-pdf.mjs` runs `astro dev --ignore-lock` in the foreground (Astro 7.4 auto-backgrounds `astro dev` under coding agents). The PDF is byte-deterministic (pdf-lib metadata, XMP and `/ID` stripped). **Pipeline order matters:** once `generated.lock.json` exists, E9 is an error, so run `visuals` → `audio` → `pdf`.
  - Files: `src/layouts/PrintLayout.astro`, `src/internal-routes/print-export.astro`, `src/lib/integrations/article-assets.ts` (`injectRoute` body), `scripts/render-pdf.mjs`.
  - `PrintLayout`: `<html data-sp-export="pdf" data-sp-scheme="light">`, no ClientRouter, no palette; the Quick Read followed by every tab's MDX content in order; `ThemedVisual` forced light; interactive islands replaced by their static snapshot or a "See interactive lab" box with a QR code (`qrcode` → inline SVG) pointing to `https://sujeet.pro/<slug>/`; a CSS watermark (`spConfig.pdf.watermarkText`, opacity `0.06`, rotated, fixed).
  - Evolution articles: the PDF contains the Evolution Ladder and **every stage in level order** (L0…Ln), each with its static light figure(s), whatever the chosen variant (`stepper` shows all levels; `scrolly` uses its static in-flow fallback, P25). No Image/Interactive toggles in print.
  - `render-pdf.mjs`: spawn `SP_PDF_RENDER=1 npx astro dev --port 4329` (foreground child process, killed at the end), wait for readiness, then for each article with `features.pdf`: `page.goto('/print-export/<slug>/')`, `page.pdf({ format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate, footerTemplate, margin })`. Header: `sujeet.pro · <title>`; footer: `Sujeet Jaiswal · sujeet.pro/<slug>/ · <pageNumber>/<totalPages>`. Make the metadata deterministic: post-process with `pdf-lib` (extra dev dependency) to set Title, Author, Subject, Producer and Creator, with CreationDate/ModDate = `updatedAt`. Write `exports/<slug>.pdf` and update `generated.lock.json`.
  - Accept: `npm run build && ls dist/<slug>/<slug>.pdf`; the scoped route check (no `print-export` file path under `dist/`, no `print-export` in any `href`/`src` attribute; see the Stage 4 verify block) passes; PDF text (via `pdfjs-dist` or `pdftotext` if installed) contains the Overview and Lab headings and does **not** contain the Print Notice text.
- [x] **4.5 LLM endpoints, RSS, Copy AI Prompt** *(Sonnet)*
  - Files: `src/lib/llms/synthesize.ts`, `src/pages/llms.txt.ts`, `src/pages/[slug]/llms-full.txt.ts`, `src/pages/rss.xml.ts`, `src/components/CopyAiPrompt.tsx`.
  - `/llms.txt`: site summary, how to navigate, published series (ordered) and articles (title, URL, one-line summary, `llms-full.txt` URL), and a graph summary (edges by kind). Deterministic ordering; no timestamps.
  - `/<slug>/llms-full.txt` (published only): manifest header, Quick Read, each tab's prose. Render MDX to text by stripping JSX components, or use a compiled-HTML-to-text step; summarise topology/Mermaid specs; include `llms-notes.md`; add GitHub `blob/main` links to `logs/*.md`.
  - Evolution articles: emit the stages **from `evolution.json` in level order** (stripping JSX would drop them): per stage the level, mode, trigger, requirements, key points, decision add/change/remove/defer, build-vs-buy, cost band and exit criteria, plus a one-line topology summary of `stageDiff`.
  - `CopyAiPrompt`: builds a prompt that cites `https://sujeet.pro/<slug>/llms-full.txt`; uses `navigator.clipboard.writeText`, falling back to a dialog with a pre-selected `<textarea readonly>`.
  - Accept: `curl` both endpoints after build; no draft slug in `/llms.txt`; `curl -s …/design-url-redirection-service/llms-full.txt | rg -n '^L[0-9]'` lists the levels in ascending order.
- [x] **4.6 SEO/AEO** *(Haiku or Sonnet)*
  - Files: `public/robots.txt`, `astro.config.mjs` (sitemap filter), `BaseLayout.astro` (OG/Twitter/JSON-LD).
  - `robots.txt`:
    ```text
    User-agent: *
    Allow: /
    Allow: /llms.txt
    Disallow: /*.pdf
    Sitemap: https://sujeet.pro/sitemap-index.xml
    ```
  - Sitemap `filter`: exclude draft slugs (read from the registry via a sync `fs` read of the manifests at config time), `/prototype/`, `/print-export/`, `/404`.
  - JSON-LD: `TechArticle` (headline, description, datePublished, dateModified, author `Person`, image = OG card), `BreadcrumbList` built from `primarySeries`, and a site-level `Person`.
  - Accept: `rg -c 'application/ld\+json' dist/design-url-redirection-service/index.html` ≥ 1; the sitemap has no draft or prototype URL.

**Verify (Stage 4):**

```bash
npm run visuals -- --slug design-url-redirection-service
npm run audio -- --slug design-url-redirection-service   # needs a fixture audio/script.json (2 short chapters)
npm run pdf -- --slug design-url-redirection-service
npx astro check && npm run build
find dist -path '*print-export*' | rg -q . && echo "LEAK (path)" || echo "ok (path)"
rg -l --glob '*.html' -e 'href="[^"]*print-export' -e 'src="[^"]*print-export' dist && echo "LEAK (href/src)" || echo "ok (href/src)"
rg -n '/bloom-filter-building-block/' dist/llms.txt dist/sitemap-*.xml dist/rss.xml && echo "LEAK (url)" || echo "ok (url)"
```

Expected: every check prints `ok (...)`. The leak checks match file paths, `href`/`src` attribute values and URL-form slugs (`/<slug>/`). They never search free text, because prose or `llms-full.txt` may legitimately mention a slug or the words `print-export`.

**Definition of done:** binaries are generated and re-runs are no-ops; endpoints are present; no leaks.

**Pitfalls:** P2, P19, P21, P22, P25. The `mlx-audio` API is unverified (4.2). Never run media pipelines in CI.

---

### Stage 5 — Validators + Playwright E2E/QA harness

**Goal:** pre-build and post-build checks catch every broken reference, cycle, dead anchor, stale binary and leak; Playwright covers the platform.

**Prerequisites:** Stage 4 DONE.

- [x] **5.1 `scripts/validate.mjs`** *(Sonnet)*
  - Plain Node (P13). Checks: every `article.json` passes the schema; the folder name equals the slug; `RESERVED_SLUGS`; `series.json` passes, with unique series slugs, unique article slugs per series, every listed article existing, and no duplicate membership; `primarySeries` required iff the article is in ≥1 series and must be one of its memberships; relations targets exist; `prerequisite`/`deep-dive-of` cycle check; published→draft relations allowed only as `upcoming`; `pages[].entry` files exist; `audio/script.json` and `data/cost-models.json` pass their schemas where present; chapter ids unique; staleness (recompute each artifact's `inputHash` the same way the pipeline does, and error when it differs from `generated.lock.json`); `linkedin-card.png` < 5 MB; publish gate (§11); `social/linkedin.json` validated but its `status` is non-blocking.
  - **Evolution rules** (where `data/evolution.json` exists): `EvolutionSchema` (E1–E6: unique ids, contiguous levels from 0, stage 0 `baseline`, trigger for level > 0, non-empty `remove[]` on `replace`, exit criteria on all but the last stage) and `TopologySchema`, then `checkEvolutionRefs()` (E7 `costTierId` ∈ `cost-models.json`; E8 decision node ids ∈ `topology.json`; E9 `figures[].visual` WebPs exist; E10 **no node in a stage before the stage whose `decision.add` introduces it**). Import `checkEvolutionRefs` from `src/lib/articles/evolution.ts`; never reimplement it here (P24).
  - Layout sync: `--sp-container` and `--sp-measure` in `src/styles/global.css` equal `spConfig.layout.containerPx`/`measureCh`; `rg 'sp-breakout' src/` is empty.
  - Output: grouped errors with `path:field`, exit 1 on any error.
  - Accept: introduce each failure (temporarily, in a scratch copy) and confirm the message; the clean repo passes.
- [x] **5.2 `scripts/validate-dist.mjs`** *(Strong)*
  - Crawl `dist/**/*.html` (parse with `node-html-parser` or `linkedom` as a dev dependency). Checks: every internal `href`/`src`/`srcset` resolves to a file (`/x/` → `x/index.html`); `#fragment` targets exist on the target page (decode URI components); duplicate `id`s per page; `relations[].targetSection` and `chapters.json` `targetSectionId` exist on their target pages; each page has exactly one canonical and it has no query string; `noindex` present on every draft/prototype page; no published page has a draft/prototype URL in an `href`, `src`, `srcset` or `<link>`/`<meta>` URL attribute (the unlinked "Coming Soon" card may show the draft title as text, so title text is never a failure); draft URLs (`/<slug>/` form, never bare slug text) absent from the `<loc>` values in `sitemap-*.xml`, the `<link>`/`<guid>` values in `rss.xml`, the URL fields in `graph-index.*.json` and the URL lines in `llms.txt` (parse each format, do not grep free text); `pagefind/` contains no draft URLs (search its `fragment` files or run a Node Pagefind query for the draft title); no `print-export` file path under `dist/` and no `print-export` value in any `href`/`src`/`srcset` attribute (parsed DOM attributes only, never free-text search); each PDF opens, contains the article title and Lab heading, and lacks the Print Notice text.
  - Accept: the clean build passes; a deliberately broken `#anchor` in a scratch branch fails.
- [x] **5.3 Playwright config + QA helper** *(Sonnet)*
  - Files: `playwright.config.ts`, `tests/e2e/helpers/qa-audit.ts`.
  - Config: `testDir: '.'`, `testMatch: ['tests/e2e/**/*.spec.ts', 'src/articles/*/tests/*.e2e.ts']`, `webServer: { command: 'npx astro preview --port 4322', url: 'http://localhost:4322/', reuseExistingServer: !process.env.CI }`, `use.baseURL`, projects `desktop-chromium` (1280×800) and `mobile-chromium` (Pixel 7), `reporter: process.env.CI ? 'github' : 'list'`.
  - `qa-audit.ts`: `attachErrorCollectors(page)` (console error, pageerror, requestfailed, image `naturalWidth === 0`); `measureCls(page)` (a `PerformanceObserver` `layout-shift` without `hadRecentInput`, injected via `addInitScript`); `measureLcp(page)` (warn-only when `CI`); `assertSeo(page, { canonical, noindex })`; `pressKey(page, key)` helpers; `withPrintMedia(page)`.
- [x] **5.4 `theme.spec.ts` + `command-palette.spec.ts`** *(Sonnet)*
  - Port preview-guide assertions #3–#9 and #18 to the real site, plus: Pagefind returns a body-only phrase from the flagship and zero results for the draft title.
- [x] **5.5 `graph-navigation.spec.ts` + `drafts-prototypes-llms.spec.ts`** *(Sonnet)*
  - Assertions #10, #11, #16 and #17, plus: entering from `/series/edge-and-traffic-architecture/` link → `?ctx` variant active, CLS < 0.05, canonical clean; Connections panel lists the backlinks; the prototype pages have `noindex` and the banner; the draft page has `noindex`; the "Coming Soon" card has no `href`; `/llms.txt` contains no draft; Copy AI Prompt with clipboard denied → fallback dialog.
- [x] **5.6 `audio-and-pdf.spec.ts`** *(Sonnet)*
  - Assertions #14 and #15 on the real site, plus cross-tab persistence (one `<audio>` element, `currentTime` monotonic across navigation and browser Back), Jump to Section scrolling to `#id` on the target tab, `GET /<slug>/<slug>.pdf` → 200 `application/pdf`.
- [x] **5.7 `layout-and-evolution.spec.ts`** *(Sonnet)*
  - File: `tests/e2e/layout-and-evolution.spec.ts`. Port master Testing scenario 6 (the v2 throwaway checks from `/tmp/sp-pw`) to the real site; run on both projects, Light and Dark.
  - **Container edges:** at 1280×800, `getBoundingClientRect()` `left`/`right` of top bar inner row, context bar, article header, Quick Read, Evolution Ladder, every `#stage-l<n>`, Connections panel, footer and audio bar inner row are equal within ±1px (§6.1).
  - **Overflow:** at 390px, `scrollWidth <= clientWidth` on the flagship index, lab, homepage and `/explore/`.
  - **Toggle CLS:** for each stage with an interactive figure, click Image → Interactive → Image; summed `layout-shift` value (without `hadRecentInput`) = 0; the topology chunk is requested only after the first toggle.
  - **`⌘K` "bloom":** Sections group lists the L3 stage (`L3 · Bloom-filter miss guard` once 6.8 content lands); Enter lands on `#stage-l3` (in view; active level in `stepper`).
  - **Variant-specific (only the shipped variant; `test.skip` the rest by reading `spConfig.layout.stageVariant`):** `stepper` — `ArrowRight`/`ArrowLeft` and `j`/`k` change the active level, `/#stage-l2` activates L2 on load, all `#stage-l<n>` exist in the DOM; `scrolly` — with `page.emulateMedia({ reducedMotion: 'reduce' })` scrolling to each stage swaps the pinned figure with no running CSS transition/animation, and with JS disabled every stage figure is visible in flow; `split` — at 899px the figure renders below the bullets.
  - Accept: green locally on a clean build; each assertion fails when its feature is deliberately broken in a scratch branch.

**Verify (Stage 5):**

```bash
npm run validate && npx astro check && npm run build && npm run validate:dist
npx playwright install chromium && npm run test:e2e
```

**Definition of done:** all green locally; each validator demonstrably fails on an injected defect.

**Pitfalls:** P18 (LCP warn-only in CI). Playwright `webServer` needs an existing `dist/`, so always build first.

---

### Stage 6 — Evolution-first flagship article + draft stub + hardened CI

**Goal:** the approved previews (v1 shell + v2 evolution body) become a published, accurate, evolution-first Design X article in two series, with audio, PDF, per-stage visuals and E2E; the draft stub proves the unlisted tier; CI is hardened.

**Prerequisites:** Stage 5 DONE. Owner preview feedback is captured (`docs/preview-guide.md` §5 checklist and the v2 variant pick).

**Execution order:** 6.1 → **6.8** → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7. (6.8 is the research-backed evolution data the prose and lab render; numbering kept stable.)

- [x] **6.1 Verified cost model** *(Strong + web research, adversarial review)*
  - **Done 2026-11-23:** V1–V12 researched from primary sources (findings drove L0/L3/L4/L5 redesigns: a 10M-key 1 % FP Bloom filter ≈ 12 MB cannot live in KVS (1 KB value, 5 MB store) or a CloudFront Function (10 KB code, 2 MB memory), so it runs in the regional service). Quotas re-confirmed independently against `cloudfront-limits.html`. V12 dropped. Tier ids `l0`…`l5`; volumes are labelled modelling assumptions; 25 sources listed in the article's Sources section.
  - File: `data/cost-models.json`. Tiers are **one per level** (ids e.g. `l0` … `l5`) so each stage's `costTierId` resolves (E7); `monthlyRequestsM` per tier follows that level's requirement chips.
  - Replace every preview number with values from the official AWS pricing pages (CloudFront, CloudFront Functions, CloudFront KeyValueStore, ECS Fargate, ElastiCache, DynamoDB on-demand, Kinesis Data Streams/Firehose, S3, Route 53) for `us-east-1`. Set `pricingAsOf` to the research date and list each URL in `sources`. Any number that cannot be sourced is either removed or kept with `assumption` text beginning `ASSUMPTION:`.
  - The preview's **ownership FTE 0.05 / 0.25 / 0.5 at $18k/month** and **"~2–3× faster first drafts"** are unverified. Either source them or present them as owner assumptions in the UI.
  - Enterprise discount range (preview: 25–40 %) is an assumption range, not a fact. Label it so.
  - **Claims to verify against official AWS (and vendor) docs before publishing.** All are unverified in this doc; record each URL in `sources` (costs) or as an inline citation (limits). Do not copy numbers from the preview.

    | # | Claim used by | What to verify |
    | :--- | :--- | :--- |
    | V1 | L2 exit criteria | CloudFront KeyValueStore: maximum total store size, maximum key size, maximum value size, and how many rules that allows for typical vanity paths |
    | V2 | L2 | KVS association limits (KVS per function, functions per KVS, per account), and that KVS is readable from CloudFront Functions only (not Lambda@Edge) |
    | V3 | L2 | KVS update propagation time to edge locations and read latency claims, if stated |
    | V4 | L2 cost band | CloudFront Functions per-invocation price, KVS read and update/API pricing, CloudFront request and data-transfer pricing |
    | V5 | L0, build-vs-buy | Whether CloudFront (or the chosen CDN/web server) has native redirect rules without code; Cloudflare Bulk Redirects / Workers KV limits if cited as the alternative |
    | V6 | L3 | DynamoDB on-demand read/write pricing, item size limit, and the latency wording used (e.g. "single-digit ms"); ElastiCache pricing if Redis is the option shown |
    | V7 | L3 | Bloom-filter false-positive rate vs bits per key and hash count (cite the standard formula from a primary or textbook source); the "rejects ~99% of misses" bullet only holds at ~1% FP and must say so |
    | V8 | L3 | Where the Bloom filter lives at the edge (KVS value size vs filter size for 10M+ keys) — ties to V1; if it does not fit, the design text must change |
    | V9 | L4 | Firehose, S3 and Athena pricing (per GB ingested, stored, scanned); CloudFront real-time or standard log delivery options and pricing |
    | V10 | L5 | DynamoDB global tables (or the chosen multi-region store) pricing and replication semantics; Route 53 health checks / latency routing pricing |
    | V11 | Build-vs-buy rows | Bitly / Rebrandly-style SaaS plan limits and prices (vendor pages, dated) |
    | V12 | Lab | Ownership FTE (0.05 / 0.25 / 0.5 × $18k/month) and "~2–3× faster first drafts" — owner assumptions unless sourced |
- [x] **6.2 Flagship prose** *(Strong)*
  - Files: `article.json` (full), `pages/index.mdx`.
  - Quick Read (TL;DR + 3–5 takeaways); sections keep the preview ids `why-vanity-urls`, `bloom-filter-guard`, `ai-era-economics`, `cutover-runbook`. Cover the AI-era delivery lens (cheap deterministic rule compilers and shadow-replay verifiers vs. the real bottlenecks: DNS cutover, SEO sign-off, cross-team ownership) and include `<ArticleRef slug="bloom-filter-building-block" />` (Coming Soon). Every AWS quota or latency figure cites an official doc URL. Voice: Principal Engineer register, no filler.
  - **Amended 2026-11-23 (evolution-first; supersedes the section-id sentence above):** `index.mdx` = Quick Read → `<EvolutionLadder />` → `<EvolutionStage />` blocks L0…L5 rendered from `data/evolution.json` (ids `evolution-ladder`, `stage-l0` … `stage-l5`). Content is key-point bullets next to figures; prose paragraphs are the exception (master "Visual-first explanation"). The v1 ids are retired; their content moves **inside the relevant stages**: AI-era lens (rule compilers, shadow-replay verifiers) at L5 (and L1 for the admin-UI/backfill tooling if it reads naturally); org/cutover notes (DNS cutover, SEO sign-off, cross-team ownership) at the stage that triggers them (L2 edge move, L5 replacement). `<ArticleRef slug="bloom-filter-building-block" />` sits **in L3**. Each claim from the 6.1 table carries its citation.
- [x] **6.3 Interactive lab** *(Sonnet)*
  - Files: `pages/interactive-lab.mdx` (sections `topology-simulator`, `cost-economics`), `components/RedirectorLab.tsx` (composes the three primitives with `data/cost-models.json` + `diagrams/architecture.diagram.json`), `diagrams/{architecture.diagram.json,request-flow.mmd}`.
  - **Amended 2026-11-23:** `RedirectorLab` reads `data/evolution.json` + `data/topology.json` + `data/cost-models.json` (no second source of truth, master FR 10): level picker (`ScaleVariantSwitcher`) → `SystemTopology` `lab` mode → `CostModelCalculator` for that level's `costTierId`. `architecture.diagram.json` is optional (only if a non-evolution overview diagram is kept); `request-flow.mmd` stays if used. Mount as `<RedirectorLab client:visible />`.
- [x] **6.4 Media generation (owner machine)** *(Sonnet runs the commands)*
  - Author `audio/script.json` (5 chapters mirroring the preview CHAPTERS, with `targetPage`/`targetSectionId`, plus a lexicon for `DynamoDB`, `P99`, `ElastiCache`, `Base62`, `TTL`). Set `features.audio` and `features.pdf` to `true`.
  - **Amended 2026-11-23:** chapters follow the evolution (e.g. ladder overview, L0–L1, L2, L3, L4, L5; the count is the author's call) and target `targetSectionId: "stage-l<n>"` / `"evolution-ladder"`; `targetVisualId` may point at a stage figure id. Extend the lexicon with `KeyValueStore`, `Firehose`, `Athena` as needed.
  - Run `npm run visuals`, `npm run audio` and `npm run pdf`. Commit the binaries plus `generated.lock.json` only when the owner asks.
- [x] **6.5 Social, notes, logs, article E2E** *(Sonnet)*
  - Files: `social/linkedin.md` (≤ 1,300 chars, human-first hook, no hashtags spam), `social/linkedin.json` (`status: "drafted"`), `llms-notes.md`, `logs/session-001.md` (preview feedback + decisions, **including the v2 variant pick and its rationale**), `tests/article.e2e.ts` (Evolution Ladder links `#stage-l0`…`#stage-l5`, each stage's Image ⇄ Interactive diff, level picker, cloud toggle, failure injection, cost calculator values per level derived from `cost-models.json`, not hard-coded).
- [x] **6.6 Draft stub** *(Haiku/Sonnet)*
  - `bloom-filter-building-block/`: `article.json` (`phase: "discussing"`, `archetype: "building-block"`, no `primarySeries`, not in `series.json`), `pages/index.mdx` (outline), `social/linkedin.{md,json}`, `logs/session-001.md`, `llms-notes.md`.
- [x] **6.7 Hardened CI** *(Sonnet)*
  - File: `.github/workflows/deploy.yml`. Target build job steps:
    ```yaml
    - uses: actions/checkout@v6
    - uses: actions/setup-node@v7
      with: { node-version: 24, cache: npm }
    - run: npm ci
    - run: npm run validate
    - run: npx astro check
    - run: npm run build
    - run: npm run validate:dist
    - id: pw
      run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"
    - uses: actions/cache@v4
      with:
        path: ~/.cache/ms-playwright
        key: pw-${{ runner.os }}-${{ steps.pw.outputs.version }}
    - run: npx playwright install --with-deps chromium
    - run: npm run test:e2e
      env: { CI: 'true' }
    - uses: actions/upload-pages-artifact@v5
      with: { path: ./dist }
    ```
    Keep the existing `concurrency`, `permissions` and `deploy` job unchanged. Confirm action major versions against what the repo already uses.

- [x] **6.8 Evolution + topology data** *(Strong + web research, adversarial review)* — run after 6.1
  - Files: `data/evolution.json` (6 levels L0–L5), `data/topology.json`; reference v2's inline evolution data (§9.2) as the starting draft, not as a source of facts.
  - Ladder content (verbatim from master Preview 6; verify every factual claim via the 6.1 table):

    | Level | Mode | Trigger (scenario) | Design at this level | Deliberately deferred | Move up when |
    | :--- | :--- | :--- | :--- | :--- | :--- |
    | L0 | baseline | Launch: one marketing site, ~200 vanity URLs | Static redirect map in CDN / web-server config, edited via PR | DB, admin UI, analytics | Non-engineers need self-service; redeploys per link become friction |
    | L1 | extend | Business: marketing wants links without a deploy | DB of record + in-memory HashMap in a small service, admin UI, cache refresh on write | Edge, Bloom filter, tracking | p95 from far regions hurts; rules > what one process should hold |
    | L2 | extend | Scale: launch in 3 regions, APAC p95 too slow | Push the map to edge KV (e.g., CloudFront KeyValueStore / Cloudflare KV); origin off the hot path | Bloom filter, tracking | Rule count exceeds edge KV limits (assumption: verify KVS size limits) or miss traffic hits origin |
    | L3 | replace (store) | Incident: bot path-scans cause a 404 storm; 10M+ user-generated rules | Edge Bloom filter as a negative cache + KV store lookup (DynamoDB / Redis); in-memory HashMap retired | Tracking | Growth asks for attribution |
    | L4 | extend | Feature request: growth team wants click attribution | Async event pipeline (edge logs / Firehose → S3 → Athena); the redirect path never waits on tracking | Pattern rules, tenancy | Brands need pattern/regex rules, per-tenant isolation, or SLAs |
    | L5 | replace (matcher) | Business: 40 tenant brands, pattern rules, per-tenant SLAs | Ordered rule engine (exact hash → prefix trie → compiled regex with precedence + conflict detection), tenant isolation, multi-region active-active | — | — |

  - Mapping to the schema: "Mode" → `mode` (`replace (store)` / `replace (matcher)` are `replace`; put the qualifier in `title`); "Deliberately deferred" → `decision.defer[{ item, until }]`; "Move up when" → `exitCriteria`; L3 `decision.remove` includes the in-memory HashMap node; L5 `decision.remove` includes the L3 exact-match lookup node it replaces (author's call, but non-empty, E5). L3 title must contain "Bloom" (5.7 `⌘K` check; master scenario 6 uses `L3 · Bloom-filter miss guard`). Every level carries a build-vs-buy verdict (CDN-native redirects vs. Bitly/Rebrandly-style SaaS vs. build) and a `costTierId`.
  - `topology.json`: all nodes across L0–L5 with fixed positions; E10 must pass (no node before the stage that adds it).
  - Accept: `npm run validate` passes E1–E10; `article-reviewer`-style adversarial pass confirms each stage has a concrete trigger, a deferred list, exit criteria and no premature component (P26).

**Verify (Stage 6):**

```bash
npm run validate && npx astro check && npm run build && npm run validate:dist && npm run test:e2e
```

Then run the `article-qa` style manual pass: desktop and mobile, Light and Dark, keyboard only, plus the container-edge and stage-toggle checks (§6.1, 5.7).

**Definition of done:** publish gate (§11) passes; all of §10 is green; V1–V12 (6.1) are sourced or labelled `ASSUMPTION:`; owner approves the live preview before merge to `main`.

**Pitfalls:** do not ship illustrative cost numbers as facts; keep `prototypes/v1.html` and `prototypes/v2.html` untouched (iterate via `v3.html`); verify V1–V12 before `phase: "published"`.

---

### Stage 7 — Junie rules, skills, subagents + `validate-junie`

> **Reshaped by owner request (2026-11-23): one shared instruction set for Junie *and* Claude Code.** Real content lives in `ai-guidelines/` (README router, architecture, voice-and-quality, interactive-ux, archetypes-and-standards, commands, `workflows/*` = skill bodies, `roles/*` = agent bodies, `setup/local-audio.md`). Junie reads root `AGENTS.md` (verified: https://junie.jetbrains.com/docs/guidelines-and-memory.html; `.junie/AGENTS.md` would shadow it, `.junie/guidelines.md` is deprecated); `.junie/skills/*/SKILL.md` and `.junie/agents/*.md` are thin wrappers. Claude Code: `CLAUDE.md` imports `@AGENTS.md` + `@ai-guidelines/README.md` (https://code.claude.com/docs/en/memory); `.claude/skills` and `.claude/agents` are matching wrappers. `.junie/rules/` and `.junie/config.json` are not used (config optional per Junie docs). `scripts/validate-junie.mjs` checks both trees, twin parity, links and banned filler; `scripts/setup-audio.sh` provisions the local MLX/Kokoro audio toolchain (ran clean: −16.4 LUFS smoke).

**Goal:** codify the proven workflow so future articles are produced consistently by Junie.

**Prerequisites:** Stage 6 DONE (rules must describe what actually works).

- [x] **7.1 `AGENTS.md`, `.junie/config.json`, rules** *(Sonnet)*
  - Rewrite `AGENTS.md`: repo overview, dev-server rule (`astro dev --background`), commands table (§8), architecture map (§5), visibility tiers (§3), and a router to the skills.
  - `.junie/config.json`: **assumption**. Confirm the schema in the Junie CLI docs before writing it; if no config is required, skip and note this here.
  - `.junie/rules/architecture.md` (single folder, `sp-*`, graph and visibility invariants, P-list), `voice-and-quality.md` (Principal Engineer voice, citation gate, banned filler words), `interactive-ux.md` (de-clutter, palette order, WCAG 2.1.4, audio persistence, print guard, CWV budgets, **uniform container §6.1**, chosen stage variant and its keyboard/reduced-motion rules), `archetypes-and-pe-standards.md` (4 archetypes, AI-era economics, org/cost bottlenecks, Generic ↔ AWS mapping, **evolution-first editorial thesis and visual-first bullets + figures**).
  - **"Right-size each level" rule** in `archetypes-and-pe-standards.md` (master Step 7): every stage needs a concrete trigger, a deferred list, exit criteria and a build-vs-buy verdict; no component may appear before the level whose trigger justifies it; mark `replace` when a design is swapped rather than extended. Point at E1–E10 (§4.2.1) as the mechanical enforcement.
- [x] **7.2 Skills `article` + `article-prototype`** *(Sonnet)*
  - `article/SKILL.md`: state machine `idea → discussing → prototyping → building → review → published`, with the exit criteria per phase and templates (`article.json` per archetype, `prototypes/v1.html` skeleton guidance, `audio/script.json`, `architecture.diagram.json`, `cost-models.json`, `linkedin.{md,json}`, `llms-notes.md`, `article.e2e.ts`, **`evolution.json` + `topology.json`**).
  - The `discussing` phase **walks the evolution level by level** with the owner: for each level, the trigger (kind + scenario), the minimum design, what is deliberately deferred (and until when), and the exit criteria; then build-vs-buy and cost band. The phase exits when the ladder table (as in 6.8) is agreed.
  - `article-prototype/SKILL.md`: standalone HTML rules (inline everything, `noindex`, `sp-` tokens, hash routes, smoke recipe from `docs/preview-guide.md` §6). When the layout is undecided, build **multi-variant prototypes with a `?layout=` switcher** (plus a key and a `⌘K` command) on identical content, as `v2.html` does; record the pick in `logs/` and `spConfig.layout.stageVariant`. Uniform container rules (§6.1) apply to prototypes too.
- [x] **7.3 Skills `article-media`, `article-social`, `article-qa`** *(Sonnet)*
  - Media: when and how to run `visuals`/`audio`/`pdf`, lock hashes, size budgets, **per-stage WebPs** (`diagrams/stage-l<n>-{light,dark}.webp`) and the Ladder LinkedIn card. Social: LinkedIn copy rules, `linkedin.json` lifecycle. QA: real Chromium checklist (keyboard, cross-tab audio, print, CWV, SEO/AEO, leaks) **plus container-edge alignment (±1px at 1280px, no overflow at 390px) and every stage's Image ⇄ Interactive toggle (CLS 0, diff markers, failure injection)**.
- [x] **7.4 Subagents + validator + CI** *(Sonnet, Strong final review)*
  - `.junie/agents/article-researcher.md` (read-only + web, primary sources only), `article-builder.md` (MDX/React/media/graph implementation), `article-reviewer.md` (adversarial fact-check, anti-slop, AI-era pragmatism, QA audit, **"right-size each level" checklist: trigger, deferred list, exit criteria, build-vs-buy per stage; no premature component**). Frontmatter format: confirm against the Junie docs.
  - `scripts/validate-junie.mjs`: every `SKILL.md` and agent file has the required frontmatter (`name`, `description`) and referenced paths exist. Add an optional live discovery smoke test behind `--live` (Junie CLI command: **assumption**, confirm before use).
  - Add `- run: npm run validate:junie` after `npm run validate` in `deploy.yml`.

**Verify (Stage 7):** `npm run validate:junie && npm run validate`.

**Definition of done:** a fresh session can run the `article` skill for a new slug and reach `prototyping` without reading this doc.

---

## 9. Reuse from the Preview

### 9.1 v1 (`prototypes/v1.html`)

Prototype anchors (line numbers at time of writing; the file is frozen, but confirm with `rg`):

| Preview feature | Anchor in `v1.html` | Production target (stage) |
| :--- | :--- | :--- |
| Pre-paint prefs + `ctx` resolution | lines ~8–62 (`STORAGE_KEY`, `VALID_SERIES`, `NAV_SESSION_KEY`) | `BaseLayout.astro` inline script (S2), with memberships injected per page |
| `--sp-*` tokens, light/dark/high contrast | top `<style>` `:root`, `[data-sp-scheme="dark"]`, `[data-sp-contrast="high"]` | `src/styles/global.css` (S2) |
| CSS series variants | lines ~546–549 (`html[data-sp-nav-series=…] [data-sp-series-variant=…]`) | `ArticleLayout.astro` generated `<style>` (S3) |
| Print guard + notice | lines ~1620–1700 (`.sp-print-notice`, `@media print`) | `global.css` + `PrintNotice.astro` (S2) |
| Hash router | ~3071–3090 | Not ported (real routes) |
| Series switcher + clamp | `setSeriesContext` ~3120, `clampSeriesMenu` ~4553 | `ArticleLayout.astro` script (S3); add the `resize` re-clamp |
| Topology render + inspector | ~3380–3560 (`renderTopology`, `[data-node-id]`) | `SystemTopology.tsx` (S3) |
| Cost model | `computeCosts`/`renderCostModel` ~3563–3650 | `CostModelCalculator.tsx` + `cost-models.json` (S3/S6) |
| Audio chapters + mock clock | `CHAPTERS` ~3655, `audioState` ~3672 | `AudioPlayer.tsx` (S3) |
| Palette data + rendering | `COMMAND_ITEMS` ~3913, group `order` ~4057, `scheduleFullText` ~4034 | `CommandPalette.tsx` (S2) |
| Explore nodes/edges/styles | `EXPLORE_NODES`/`EXPLORE_EDGES`/`EDGE_STYLE` ~4160–4195 | `ExploreGraph.tsx` (S3) |
| Keyboard dispatcher | `document.addEventListener('keydown'…` ~4383–4491; `isEditableTarget` ~4351 | `keyboard/dispatcher.ts` (S2); extend editable checks per P14 |
| Copy AI Prompt fallback | `openAiPrompt` ~4293 | `CopyAiPrompt.tsx` (S4) |

Behavioural facts to preserve:

| Topic | Fact |
| :--- | :--- |
| Palette | Group order Series → Articles & Tabs → Sections → Full-Text Matches → Commands; `>` mode shows only Commands; full-text needs ≥ 2 chars and shows "…" while pending; commands match on `match ?? title`. |
| Dispatcher | Order: Esc → mod+K → open-dialog handling (Tab trap, ↑/↓/↵ in palette) → ignore meta/ctrl/alt → ignore editable targets → WCAG gate → `g` chord (900 ms) → single keys. `isComposing` is ignored at the top. |
| Breadcrumb | Resolution `?ctx=series:<slug>` → `sessionStorage` → `primarySeries`; an invalid `ctx` falls back to primary **without** consulting the session. |
| Explore edge direction | `relations[]` semantics: the **source article points to what it depends on**. E.g. `url-redirection → cdn-cache-invalidation` (`prerequisite`) means URL Redirection requires CDN Cache Invalidation first; `experimentation-platform → url-redirection` (`prerequisite`). |
| Explore edge styles | `member`: `--sp-status-healthy`, solid. `prerequisite`: `--sp-accent`, solid. `uses-building-block`: `--sp-status-fallback`, dash `5 3`. `related`: `--sp-ink-muted`, dash `1 4`. |
| Topology semantics | Healthy `#10B981`, Degraded/Slow `#F59E0B`, Failed `#EF4444`, Fallback `#8B5CF6`. |
| Lab tiers | `tier1` "HashMap (<100K)", `tier2` "Bloom + Redis (10M+)", `tier3` "Global Multi-Region"; cloud `generic` / `aws`; tracking toggle adds the async click pipeline. **Superseded for production (2026-11-23):** the lab uses the L0–L5 level picker over `evolution.json` (3.6); tracking is L4. Keep the cloud toggle. |
| Cost assumptions (unverified) | Per-1M multipliers in `computeCosts`, enterprise 25–40 %, SaaS range, ownership FTE `{ tier1: 0.05, tier2: 0.25, tier3: 0.5 }` × `$18,000/month`, "~2–3× faster first drafts". **Must** be verified against AWS pricing pages and `pricingAsOf` set before publishing (S6.1). |
| Audio | 5 chapters with `tab` + `section` targets; Auto-Follow default OFF. Production chapters target `stage-l<n>` (6.4). |
| Layout | v1 uses a centred `--sp-measure` column plus `--sp-breakout: 1140px`. **Do not port**; production follows §6.1. |

### 9.2 v2 (`prototypes/v2.html`) — reference for the evolution body

v2 reuses the v1 shell (theme, `⌘K`, breadcrumbs, audio bar, print guard, Explore) and replaces the article body. It was still being written when this section was drafted, so **no line numbers are cited**. Locate each feature with `rg -n` on the ids/classes below (expected names from the master plan; if v2 uses different names, search for the visible label and record the real anchors here).

| v2 feature | Locate with | Production target (stage) |
| :--- | :--- | :--- |
| Uniform container tokens | `rg -n -e '--sp-container' -e '--sp-measure' prototypes/v2.html` | `global.css` `.sp-container` / `.sp-measure` (2.4, §6.1) |
| Evolution Ladder overview | `rg -n -i 'ladder' prototypes/v2.html` | `EvolutionLadder.astro` (3.9) |
| Stage blocks (trigger card, requirement chips, key points, decision add/change/remove/defer, build-vs-buy, cost band, exit criteria) | `rg -n 'stage-l[0-9]' prototypes/v2.html` | `EvolutionStage.astro` (3.9) |
| Inline evolution data (shape matches `EvolutionSchema`) | `rg -n -i -e 'stages' -e 'evolution' prototypes/v2.html` | starting draft for `data/evolution.json` + `topology.json` (6.8); facts still need V1–V12 |
| ExplainerFigure `[ Image \| Interactive ]` toggle + fixed-aspect frame | `rg -n -i -e 'interactive' -e 'aspect-ratio' prototypes/v2.html` | `ExplainerFigure.astro` + `FigureModeToggle.tsx` (3.10) |
| Multi-figure gallery (`‹ ›`, `Fig n.m`) | `rg -n -e 'Fig ' -e '‹' prototypes/v2.html` | `ExplainerFigure` gallery (3.10) |
| Diff markers (added highlighted, removed struck through) | `rg -n -i -e 'added' -e 'removed' -e 'diff' prototypes/v2.html` | `SystemTopology` `diff` mode (3.6) |
| Four layout variants `split` / `scrolly` / `stacked` / `stepper` | `rg -n -e 'split' -e 'scrolly' -e 'stacked' -e 'stepper' prototypes/v2.html` | **Only the picked one** in `EvolutionStage` (3.9); per-variant notes there |
| Layout switcher (`?layout=`, `v` key, `⌘K` "Layout → …") | `rg -n -e 'layout=' -e 'Layout →' prototypes/v2.html` | Not ported (prototype-only) |
| Scrolly IntersectionObserver + reduced-motion swap | `rg -n -e 'IntersectionObserver' -e 'prefers-reduced-motion' prototypes/v2.html` | `scrolly` variant script (3.9, P25) |
| Stepper rail, `←`/`→` and `j`/`k`, hash activation | `rg -n -e 'ArrowRight' -e 'hashchange' prototypes/v2.html` | `stepper` variant script via dispatcher (3.9, P23) |
| Level-picker lab | `rg -n -i -e 'level' -e 'radiogroup' prototypes/v2.html` | `ScaleVariantSwitcher` as level picker + `RedirectorLab` (3.6, 6.3) |
| Stage sections in `⌘K` Sections group | `rg -n -i 'sections' prototypes/v2.html` | graph-index stage sections (3.11) |
| Series menu re-clamp on `resize` (v1 nit fixed) | `rg -n 'clampSeriesMenu' prototypes/v2.html` | `ArticleLayout.astro` switcher script (3.3) |

Paths above are relative to `src/articles/design-url-redirection-service/`.

---

## 10. Global Verification and Quality Gates

The project is "done" when all of these hold on a clean checkout:

- [ ] `npm ci && npm run validate && npm run validate:junie && npx astro check && npm run build && npm run validate:dist && npm run test:e2e` passes locally and in CI.
- [ ] CLS < 0.05 on every tested page (hard gate); LCP < 2,500 ms and INP ≤ 200 ms on a cold-mobile lab run locally (warn-only in CI).
- [ ] Zero console/page/network/image errors across desktop and mobile, Light and Dark.
- [ ] Zero draft/prototype leaks (HTML hrefs, sitemap, RSS, Pagefind, graph-index, `/llms.txt`).
- [ ] No `print-export` in `dist/`; the PDF contains real content and no Print Notice.
- [ ] Keyboard-only walkthrough: palette, shortcuts, WCAG toggle, switcher, tabs, lab, audio, dialogs (focus restore).
- [ ] Re-running `npm run visuals|audio|pdf` leaves `git status` clean.
- [ ] `graph-index` < 25 KB gzipped; first palette open < 200 ms.
- [ ] Uniform container: equal left/right edges (±1px) at 1280px across shell, article and stages; no horizontal overflow at 390px (5.7).
- [ ] Evolution rules E1–E10 pass for every article with `data/evolution.json`; every Image ⇄ Interactive toggle has CLS delta 0 and hydrates the topology only on intent.

---

## 11. Publish-Gate Checklist (per article, enforced by `validate.mjs`)

- [ ] `phase: "published"`, `publishedAt`, `updatedAt`
- [ ] `quickRead` (TL;DR + 2–6 takeaways)
- [ ] `thumbnailAlt` + `social/thumbnail-light.webp`, `social/thumbnail-dark.webp`, `social/thumbnail.png`
- [ ] `llms-notes.md`
- [ ] If `features.audio`: `audio/episode.mp3`, `audio/chapters.json`, a fresh lock entry
- [ ] If `features.pdf`: `exports/<slug>.pdf`, a fresh lock entry
- [ ] `tests/article.e2e.ts`
- [ ] `primarySeries` valid when in ≥ 1 series
- [ ] All cost figures sourced (`pricingAsOf`, `sources`) or explicitly labelled `ASSUMPTION:`
- [ ] `design-x` archetype: `data/evolution.json` + `data/topology.json` present and passing E1–E10, every stage figure WebP present (E9 as error), and the cost model has a tier per `costTierId` (derived from master FR 10; enforce in `validate.mjs` 5.1)
- [ ] LinkedIn `status`: **non-blocking** (prose fixes must never be blocked by social state)

---

## 12. Open Questions / Deferred (v2)

| Item | Status |
| :--- | :--- |
| Raw-mic narration mastering with timed cue sheets | Deferred to v2 |
| Move MP3/PDF to Cloudflare R2 or GitHub Releases via `media.baseUrl`/`audio.baseUrl` | Revisit after ~10–15 articles |
| Bulk migration of older articles from `origin/check` | Out of scope |
| Automated LinkedIn/Medium posting | Out of scope (manual, tracked in `linkedin.json`) |
| MCP server | Out of scope (git-native Junie skills only) |
| `1`/`2` tab keys in `sp.config.ts` | Pending owner confirmation from preview review |
| Exact `mlx-audio` Kokoro API and pinned versions | Verify in S4.2 |
| `prerenderConflictBehavior` availability in Astro 7 | **Verified S2.1:** it exists as a top-level key (`node_modules/astro/dist/types/public/config.d.ts:524-543`, `@version 6.0`, `'error' \| 'warn' \| 'ignore'`, default `'warn'`). Set to `'error'`. |
| Junie `config.json` / agent frontmatter / CLI discovery command | Verify in S7 |
| Real series sizes ("1/4", "2/3" in preview are illustrative) | Decide when more articles exist |
| `spConfig.layout.stageVariant` (split / scrolly / stacked / stepper) | **Resolved 2026-11-23:** `hybrid` (stacked base, split ≥1200px, Expand dialog). See §4.1. |
| Zod 4 `.superRefine` on `z.strictObject` (EvolutionSchema) | **Verified S2.2:** works and keeps `ZodObject`/`.shape` (zod 4.6.7). See the §4.2.1 note. |
| MDX `getHeadings()` vs component-rendered stage H2s | Verify in S3.11 |
| CloudFront KeyValueStore limits/pricing and other V1–V12 claims | Verify in S6.1 before publishing |
| `TopologySchema` shape (§4.2.2) | Recommendation; confirm against v2's inline data in S3.8 |
| Evolution-first for Building Block / Business Story archetypes | Optional per master FR 10 ("where useful"); decide per article |

---

## 13. Multi-Model Review Outcomes (summary)

| Finding | Resolution adopted |
| :--- | :--- |
| `src/pages/_print/…` is skipped by Astro; `page.pdf()` triggers the print guard | Dev-only `injectRoute('/print-export/[slug]')` behind `SP_PDF_RENDER=1` + `PrintLayout.astro` (`data-sp-export="pdf"`); one PDF URL `/<slug>/<slug>.pdf`; never in `dist/` |
| `pages[].mode: 'react'` hydration via `import.meta.glob` → `NoMatchingImport` | All pages are `.mdx`; full-React pages statically import and mount their island |
| Astro 7 Sätteri vs Expressive Code; missing CI deps | Probe first in S2.1; add `@astrojs/markdown-remark` only if needed; `@astrojs/check`, TS ^5.8, `@types/react*`, `@astrojs/rss`, `mermaid`, cached Chromium |
| Flagship linking to a draft leaks; Pagefind denylist is fragile | Three visibility tiers; "Coming Soon" unlinked card; `data-pagefind-body` **allowlist** on published `<main>` |
| Audio stops on tab switch; MP3 timestamp drift; single-pass loudnorm pumping | `<ClientRouter />` + `transition:persist`; WAV-first sample-accurate chapters; two-pass `loudnorm`; `{ text, spoken? }` + lexicon + transcript |
| Keyboard/cmdk bugs (`?`/`>` blocked by modifier checks, hidden body-only hits, no WCAG off-switch, stray `d` download key) | Single dispatcher, Shift allowed, WCAG 2.1.4 toggle, no bare `d`, `shouldFilter={false}`, separate structural vs full-text groups |
| Theme mismatch (`<picture media>`, Tailwind dark variant, Expressive Code) | Everything keyed on `data-sp-scheme`; `@custom-variant dark`; `themeCssSelector`; CSS-switched `ThemedVisual` |
| Series order duplicated in two places | `series.json` is the single source; `article.json` holds only `primarySeries` |
| Collapsing tab canonicals; hydration/CLS from client breadcrumb mutation; unvalidated session context | Per-page canonical without `?ctx`; Astro-rendered variants toggled by CSS; strict membership validation |
| IndexedDB cache vs GitHub Pages deletes and Safari ITP | Default hashed URL + memory + HTTP ETag; `sp-v8-idb` opt-in with fallback |
| Heavy graph runtime on reading pages; speculative scope | Static Connections panel; `/explore/` = matrix + build-time SVG; ship 3 flagship widgets and 5 skills first, generalize on the second consumer |
| Evolution creep; scrollytelling cost (master Risks, 2026-11-23) | E10 in `validate.mjs` + `article-reviewer` checklist (P26); scrolly only if picked, with fixed-aspect frame, reduced-motion swap and static fallback (P25) |

---

## 14. Master-Plan Sync Notes (2026-11-23)

Inconsistencies found while syncing this doc with `.junie/plans/interactive-articles-platform.md`, and how each was resolved here. The master plan was **not** edited in this pass.

| # | Inconsistency | Resolution in this doc |
| :--- | :--- | :--- |
| S1 | Numbering: master "Steps" 1–7 vs. doc "Stages" 1–7; master File Structure says `v2.html` is "Added in Stage 2" (meaning master Step 2) | Explicit mapping table in §1; v2 is **Stage 1b** |
| S2 | Master Step 6 bundles validators/E2E **and** the flagship | Split across doc Stages 5 and 6 (unchanged); noted in the mapping table |
| S3 | The variant pick was described as blocking "Stage 4 (evolution components)", but the components are built in master **Step 4** = doc **Stage 3** (Key Decision #8: "before the knowledge-graph and interactive-primitives step") | Blocking row placed before doc Stage 3 (sub-tasks 3.9–3.11); Stage 2 may start without it |
| S4 | §7 fixtures and 6.2 kept the v1 section ids (`why-vanity-urls`, `bloom-filter-guard`, `ai-era-economics`, `cutover-runbook`); the evolution-first body uses `stage-l<n>` and puts AI-era and cutover notes inside stages | v1 ids retired for the index page (amendments in §7 and 6.2); lab ids unchanged; audio chapters target `stage-l<n>` (6.4) |
| S5 | `ScaleVariantSwitcher` tiers `tier1/2/3` (doc 3.6, §9 facts) vs. master "level picker over `evolution.json`" | 3.6 rewritten; §9.1 fact marked superseded; cost tiers become one per level (6.1) |
| S6 | Master lists `SystemTopologySchema` (for `diagrams/*.diagram.json`) and also `data/topology.json` with per-stage scoping, but defines no topology schema | Recommended `TopologySchema` (§4.2.2) with cumulative add − remove active sets; `SystemTopologySchema` kept as an alias; `architecture.diagram.json` optional for evolution articles |
| S7 | Master's `EvolutionSchema` comment lists 5 superRefine rules; the required rule set includes cross-file checks (cost tiers, topology ids, visual files, node-before-add) that Zod cannot see | E1–E6 in `superRefine`, E7–E10 in `checkEvolutionRefs()` shared by registry and `validate.mjs` (§4.2.1, P24) |
| S8 | E9 (stage visuals exist) would fail fixtures before Stage 4 renders any WebP | Warning before `generated.lock.json` exists or before publish; error after |
| S9 | Global `j`/`k` (next/prev section) vs. `stepper` level keys | One dispatcher owns both (P23) |
| S10 | v2's `v` layout key and `?layout=` switcher have no place in production `shortcuts` | Prototype-only; not ported (§4.1 note, §9.2) |
| S11 | Master Preview 4 heading still says "1140px Breakout Canvas"; the uniform container drops `--sp-breakout` | Followed Key Decision #8 / FR 11: no breakout; 1140px is the container for everything (§6.1) |
| S12 | Stage 2 copied tokens from v1, which predates the uniform container | Colour tokens from v1, layout tokens from v2 (Stage 2 prerequisites) |
| S13 | Master FR 10 says Design X articles "ship" `evolution.json` but the publish gate did not require it | Added a `design-x` line to §11 (derived requirement; enforce in 5.1) |
| S14 | v2.html, at the time of this sync, still contained v1's `--sp-breakout` tokens (another agent was mid-build) | §9.2 cites v2 by feature only; re-check anchors with `rg -n` before Stage 3 |
