# `sujeet.pro` v8 Implementation Runbook (Stages 2–7)

> **Purpose**: Deterministic, contract-locked execution runbook engineered so lower-tier coding models (**Haiku / Neon-low**, **Sonnet / Mid-tier**) and **Frontier** models can execute Stages 2–7 sequentially without inventing schemas, hitting step-order circularities, or drifting across files.
>
> **Current Status**: Stage 1 (`T1.1`) is complete — `src/articles/design-url-redirection-service/prototypes/v1.html` is built and verified via the repeatable zero-dependency Chromium harness (`node tests/prototype/verify-v1.mjs`, `0` console errors). **Do not start Stage 2 until `GATE-1` is explicitly approved.**

---

## Mandatory Hard Stop: `GATE-1` (Human Visual Sign-Off)

Before running **`T2.1`**, the maintainer must review `src/articles/design-url-redirection-service/prototypes/v1.html` in a real browser (`open src/articles/design-url-redirection-service/prototypes/v1.html`) and sign off on:

- [ ] **Visual tokens & typography**: `--sp-*` Light/Dark/High-Contrast palettes, `68ch` reading measure, `1140px` lab breakout, `56px` sticky top bar, and reading text-size scaling.
- [ ] **Multi-series breadcrumb UX**: `Home › Series › [System Design ▾] › URL Redirection Service` + `Also in:` chip + CSS-toggled series-scoped Prev/Next cards.
- [ ] **Unified `⌘K` / `/` / `>` & `?` shortcuts**: Zero-flicker group ordering (Series → Articles & Tabs → Sections → Commands → Full-Text Matches at bottom) and WCAG 2.1.4 single-key disable switch.
- [ ] **Design X Interactive Lab**: Scale Tier switcher (`Tier 1/2/3`), `Generic ↔ AWS` toggle, click-to-fail/slowdown inspector with fallback edge visualization, and AWS On-Demand List vs. Realistic Negotiated Enterprise Range calculator.
- [ ] **Sticky Companion Audio Player & Print Guard**: Bottom player layout, Transcript drawer, cross-tab "Jump to Section", and `@media print` single-page Print Notice (`Cmd+P`).

**Token-Freeze Rule**: Once `GATE-1` is approved (either on `v1.html` or after iterating `v2.html`), the `:root` / `[data-sp-scheme="dark"]` / `[data-sp-contrast="high"]` CSS variables from the approved prototype become the **frozen visual source of truth** copied verbatim into `src/styles/global.css` in `T2.4`.

---

## Prototype-Only (`v1.html`) vs. Production (Stages 2–7) Matrix

Lower-tier models must **never** port prototype mocks into production code. Use this table as a hard boundary:

| Capability | Prototype (`prototypes/v1.html` — Simulated) | Production (Stages 2–7 — Real Implementation) |
| :--- | :--- | :--- |
| **Navigation & Views** | Single HTML file toggling `#view-article` / `#view-home` / `#view-explore` via JS | Static Astro 7 routes (`/`, `/[...slug]/`, `/series/[series]/`, `/explore/`, `/404/`) with `<ClientRouter />` |
| **Command Palette Search** | Hardcoded `STRUCTURAL_ITEMS` + `SIMULATED_PAGEFIND_DOCS` array | `cmdk@1.1.1` (`shouldFilter={false}`) querying build-emitted `/graph-index.<hash>.json` + lazy `import(/* @vite-ignore */ '/pagefind/pagefind.js')` over `data-pagefind-body` allowlist |
| **Companion Podcast Audio** | `setInterval` timer advancing simulated `audioState.currentSec` | Real `<audio preload="none">` inside `transition:persist="sp-audio-player"` playing locally synthesized `mlx-audio` Kokoro-82M `episode.mp3` + sample-accurate `chapters.json` + Media Session API |
| **Static Diagrams & Thumbnails** | Inline `<svg class="sp-visual-light/dark">` inside `v1.html` | Committed Playwright+Sharp `.webp` visuals rendered by `ThemedVisual.astro` (CSS-switched on `data-sp-scheme`), `800×450` thumbnails, and `1200×628` LinkedIn PNGs |
| **Interactive Lab Data** | Inline JS `TOPOLOGY_DATA` & `computeCosts()` formulas | Static JSON under `src/articles/<slug>/diagrams/*.diagram.json` + `data/cost-models.json` validated by Zod 4 & loaded via `useArticleData.ts` |
| **Branded PDF & QR** | Modal preview + inline SVG QR motif inside `.sp-print-notice` | Dev-only `injectRoute('/print-export/[slug]')` (`SP_PDF_RENDER=1`) using `PrintLayout.astro` (`data-sp-export="pdf"`) + Playwright `page.pdf()` + `qrcode` package emitting `/<slug>/<slug>.pdf` |
| **Draft Discovery (`?drafts=true`)** | Hardcoded `<aside id="draftsTray">` toggled in DOM | Client-side `DraftDiscovery.tsx` fetching `/drafts-index.json` only when `?drafts=true`; zero draft URLs in any static public HTML |
| **Prototype Hosting** | Opened directly via `file://` | Served via `src/pages/[slug]/prototype/[...file].ts` emitting literal `index.html` and `vN/index.html` files, injecting `<meta name="robots" content="noindex, nofollow">` (never copied raw by `article-assets.ts`) |

---

## Resolving Step-Order Circularity (Fixture-First Strategy)

The high-level 7-stage plan has circular dependencies if executed naively (Stage 2 needs articles to test routing/Pagefind; Stage 4 needs diagram/audio inputs to test media pipelines; Stage 5 needs real articles to run validators/Playwright).

This runbook eliminates every circular dependency using **minimal schema-valid fixtures introduced in `T2.3`** plus a clear **two-tier gate**:
1. **`T2.3`** creates `src/series/series.json` plus minimal fixture stubs for `design-url-redirection-service` (published manifest with temporary `features.pdf: false`, 2 tabs, tiny placeholder `architecture.diagram.json`, `cost-models.json`, `audio/script.json`, deterministic zero-ffmpeg 1.04-second silent fixture `audio/episode.mp3` + `audio/chapters.json`, `sharp`-generated `800×450` placeholder thumbnails, and empty `generated.lock.json`) and `bloom-filter-building-block` (unlisted draft).
2. **Temporary Fixture Gate (Stages 2–5, `T2.3`–`T5.4`)**: During platform construction, `design-url-redirection-service` satisfies `ArticleManifestSchema` (manifest-level fields `publishedAt`, `quickRead`, `thumbnailAlt`), while optional/generated files (`social/linkedin-card.png`, `exports/<slug>.pdf`, non-empty `generated.lock.json`, `tests/article.e2e.ts`) are populated progressively by `T5.1`–`T5.3` and `T6.1`. Every subsystem (routing, Pagefind, Knowledge Graph, `Cmd+K`, persistent cross-tab audio, visuals/audio/PDF pipelines, `llms.txt`) is objectively verified against those fixtures.
3. **Strict Publish Gate (Stage 6, `T6.1`–`T6.3`)**: **`T6.1`** replaces placeholder prose, interactive topology/cost data, and podcast script with the full Principal Engineer flagship article, flips `features.pdf: true`, scaffolds `tests/article.e2e.ts`, and regenerates all hash-locked production media; **`T6.2`** then activates the strict pre/post-build validators (`validate.mjs` & `validate-dist.mjs`) enforcing all filesystem assets, lock hashes, and zero leaks; **`T6.3`** completes the Playwright E2E suite.
4. **Stage 7 (`T7.1`–`T7.2`)** authors Junie rules/skills/subagents + `validate-junie.mjs` **before** editing `.github/workflows/deploy.yml` **once** (no double CI edits).

---

## Frozen Cross-Module Contracts (Do Not Alter Without Updating `T2.2`)

Every task card below must match these exact symbol names, JSON keys, DOM attributes, and URLs verbatim.

### 1. DOM Attributes & Storage Keys (`sp.config.ts`)
- `localStorage["sp-v8-prefs"]` (`UserPrefsSchema`):
  ```ts
  { scheme: 'auto' | 'light' | 'dark', contrast: 'default' | 'high', textSize: 'default' | 'large', singleKeyShortcuts: boolean }
  ```
- `sessionStorage["sp-v8-nav-series"]`: validated series slug string (e.g., `"system-design"`).
- Root `<html>` attributes set pre-paint (before React hydration):
  - `data-sp-scheme="light" | "dark"` (resolved scheme; Tailwind `@custom-variant dark` and Expressive Code `themeCssSelector` bind to this)
  - `data-sp-scheme-pref="auto" | "light" | "dark"`
  - `data-sp-contrast="default" | "high"`
  - `data-sp-text="default" | "large"`
  - `data-sp-nav-series="<active-series-slug>"` (multi-series articles only)
  - `data-sp-export="pdf"` (present ONLY on `PrintLayout.astro` so `@media print` guard rules scope to `:root:not([data-sp-export="pdf"])`)
- Zero-CLS multi-series CSS selector contract:
  - Breadcrumb label spans and Prev/Next containers carry `data-sp-series-variant="<series-slug>"`.
  - Default CSS hides `[data-sp-series-variant]`; per-series inline `<style>` in `ArticleLayout.astro` (generated from the article's membership slugs) shows only `html[data-sp-nav-series="<slug>"] [data-sp-series-variant="<slug>"]`.
- Embedded graph index meta tag in `<head>`:
  - `<meta name="sp-graph-url" content="/graph-index.<8-char-sha256>.json" />`

### 2. Core Data Schemas (`src/lib/articles/schema.ts` — Zod 4 `z.strictObject`)
- **`ArticleManifestSchema`**, **`SeriesEntrySchema`**, **`CostModelSchema`**, **`AudioScriptSchema`**: Exact fields defined in `<user_plan>` Data Models (using `z.iso.date()`, `z.url()`, `RESERVED_SLUGS`, derived `status = phase === 'published' ? 'published' : 'draft'`, publish-only `superRefine`).
- **`AudioChaptersOutputSchema`** (`audio/chapters.json` — produced by `T5.2`, consumed by `T4.2` & `T6.2`):
  ```ts
  z.strictObject({
    schemaVersion: z.literal(1),
    title: z.string().min(1),
    voice: z.string().min(1),
    model: z.string().min(1),
    durationSec: z.number().nonnegative(),
    sampleRateHz: z.number().int().positive(),
    chapters: z.array(z.strictObject({
      id: z.string().regex(/^[a-z0-9-]+$/),
      title: z.string().min(1),
      startSec: z.number().nonnegative(),
      endSec: z.number().nonnegative(),
      targetPage: z.string().regex(/^[a-z0-9-]+$/).optional(),
      targetSectionId: z.string().min(1).optional(),
      targetVisualId: z.string().min(1).optional(),
      transcript: z.array(z.string().min(1)).min(1),
    })).min(1),
  })
  ```
- **`SystemTopologySchema`** (`diagrams/*.diagram.json` — produced by content, consumed by `T4.1` & `T5.1`):
  ```ts
  z.strictObject({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    tiers: z.array(z.strictObject({
      id: z.string().min(1),
      label: z.string().min(1),
      summary: z.string().min(1),
      viewBox: z.tuple([z.number().positive(), z.number().positive()]),
      nodes: z.array(z.strictObject({
        id: z.string().min(1),
        x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(),
        genericLabel: z.string().min(1),
        awsLabel: z.string().min(1),
        role: z.string().min(1),
        baseLatencyMs: z.number().nonnegative(),
        quotaNote: z.string().min(1),
        optionalFeature: z.string().optional(),
        blast: z.strictObject({
          healthy: z.array(z.string().min(1)).min(1),
          degraded: z.array(z.string().min(1)).min(1),
          failed: z.array(z.string().min(1)).min(1),
        }),
      })).min(1),
      edges: z.array(z.strictObject({
        from: z.string().min(1),
        to: z.string().min(1),
        label: z.string().min(1),
        optionalFeature: z.string().optional(),
        fallbackWhen: z.strictObject({ node: z.string().min(1), state: z.enum(['degraded', 'failed']) }).optional(),
      })),
    })).min(1),
  })
  ```
- **`GeneratedLockSchema`** (`generated.lock.json` — updated by `T5.1`/`T5.2`/`T5.3`, verified by `T6.2`):
  ```ts
  z.strictObject({
    schemaVersion: z.literal(1),
    artifacts: z.record(z.string(), z.strictObject({
      pipeline: z.enum(['visuals', 'audio', 'pdf']),
      inputHash: z.string().regex(/^[a-f0-9]{64}$/),
      outputHash: z.string().regex(/^[a-f0-9]{64}$/),
      toolVersion: z.string().min(1),
      generatedAt: z.iso.datetime(),
    })),
  })
  ```
- **`LinkedInMetadataSchema`** (`social/linkedin.json`):
  ```ts
  z.strictObject({
    status: z.enum(['not-started', 'drafted', 'scheduled', 'published']),
    postUrl: z.url().optional(),
    postUrn: z.string().optional(),
    syncedArticleVersion: z.number().int().positive(),
    cardPath: z.literal('social/linkedin-card.png'),
    revisions: z.array(z.strictObject({ date: z.iso.date(), note: z.string().min(1) })).default([]),
  })
  ```
- **`DraftsIndexSchema`** (`dist/drafts-index.json`):
  ```ts
  z.strictObject({
    generatedAt: z.iso.datetime(),
    drafts: z.array(z.strictObject({ slug: z.string(), title: z.string(), archetype: z.string(), phase: z.string(), url: z.string() })),
    prototypes: z.array(z.strictObject({ slug: z.string(), version: z.number().int().positive(), latest: z.boolean(), url: z.string() })),
  })
  ```
- **`GraphIndex`** (`dist/graph-index.<hash>.json` — produced by `T3.1`, consumed by `T3.3` & `T3.4`):
  - Contains `schemaVersion: 1`, `graphHash`, `series[]`, `articles[]` (with MDX-AST-extracted H2/H3 `sections[]` matching Astro's `github-slugger` IDs — **NOT** post-HTML DOM scraping, eliminating any `<meta name="sp-graph-url">` circularity), `edges[]`, and deterministic layered SVG layout:
    `svgLayout: { width: number, height: number, nodes: Array<{ id: string, kind: 'series' | 'article' | 'block', slug: string, label: string, seriesSlugs: string[], x: number, y: number, w: number, h: number, url?: string }> }`.
  - **Backlinks source**: Derived deterministically from `article.json` `relations[]` (`targetSlug`, `targetPage`, `targetSection`, `kind`, `reason`) at build time. `<ArticleRef />` inside `.mdx` is validated in `T6.2` to ensure every referenced slug either exists in `relations[]` or is a valid known slug.
- **Prototype Route Contract (`src/pages/[slug]/prototype/[...file].ts`)**:
  - **Critical Astro behavior**: Static `.ts` endpoints write output to the literal pathname, ignoring `trailingSlash: 'always'` and `build.format: 'directory'`. Using `[...variant].ts` with `variant: 'v1'` or `undefined` would emit extensionless `dist/<slug>/prototype/v1` and collide with the `prototype/` directory.
  - Therefore, the endpoint **MUST** live at `src/pages/[slug]/prototype/[...file].ts` with `export const prerender = true` and `getStaticPaths()` returning explicit HTML file paths for every article with `prototypes/vN.html` (numeric sort `v10 > v2`):
    - Latest version: `{ params: { slug, file: 'index.html' }, props: { slug, version: latestN, htmlPath: latestPath } }` → emits `dist/<slug>/prototype/index.html` (served at `/<slug>/prototype/`).
    - Each version `vN.html`: `{ params: { slug, file: \`v${n}/index.html\` }, props: { slug, version: n, htmlPath } }` → emits `dist/<slug>/prototype/vN/index.html` (served at `/<slug>/prototype/vN/`).
  - `GET` reads raw `htmlPath`, injects `<meta name="robots" content="noindex, nofollow" />` inside `<head>` if absent, strips any `data-pagefind-body` attribute, and returns `new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })` — never nesting `<!doctype html>` inside an `.astro` wrapper and producing zero file/directory collisions.

---

## Stage 2: Toolchain, Frozen Contracts & Walking Skeleton

> **Prerequisite**: `GATE-1` signed off.

### Card `T2.1` — Toolchain Install & Astro 7 Sätteri Probe
- **Model Tier**: `Sonnet / Mid-tier`
- **Depends On**: `GATE-1`
- **Allowed Files**: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `astro.config.mjs`, `src/pages/probe-mdx.mdx` *(temporary probe file — must be deleted before exiting `T2.1`)*
- **Do Not Touch**: `src/articles/design-url-redirection-service/prototypes/v1.html`, `.github/workflows/deploy.yml`, `.junie/*`
- **Inputs / Outputs**:
  - Install dependencies: `@astrojs/mdx`, `@astrojs/react`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@astrojs/check`, `typescript@^5.8` (Astro 7 rejects TS 7), `@tailwindcss/vite`, `tailwindcss`, `astro-expressive-code`, `@astrojs/sitemap`, `@astrojs/rss`, `lucide-react`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-dialog`, `cmdk@1.1.1`, `recharts`, `@xyflow/react`, `mermaid`, `pagefind`, `sharp`, `qrcode`, `@types/qrcode`, `github-slugger`, `pdf-parse`, `@playwright/test`.
  - Probe `astro-expressive-code` on Astro 7 default Sätteri Markdown processor using temporary `src/pages/probe-mdx.mdx` with a fenced code block; if incompatible, install `@astrojs/markdown-remark` once and configure it in `astro.config.mjs`. Record the result in a comment in `astro.config.mjs`, then delete `src/pages/probe-mdx.mdx`.
  - Configure `astro.config.mjs`: `site: 'https://sujeet.pro'`, `trailingSlash: 'always'`, `build: { format: 'directory' }`, `prerenderConflictBehavior: 'error'`, Expressive Code `themeCssSelector: (theme) => \`[data-sp-scheme="${theme.type}"]\``, and basic `@astrojs/sitemap()` registration (deferring the registry-backed draft/prototype `filter` callback to `T2.3` once `registry.ts` exists).
  - Configure `tsconfig.json` with React JSX and `@/*` path alias (`./src/*`).
  - Update `.gitignore` to ignore `src/articles/*/audio/.cache/`, `src/articles/*/diagrams/.cache.json`, `playwright-report/`, `test-results/`.
  - Pre-wire all npm scripts in `package.json` so downstream parallel cards never collide on `package.json`: `"build": "astro build && npx pagefind --site dist"`, `"check": "astro check"`, `"visuals": "node scripts/render-visuals.mjs"`, `"audio": "node scripts/render-audio.mjs"`, `"pdf": "node scripts/render-pdf.mjs"`, `"validate": "node scripts/validate.mjs"`, `"validate:dist": "node scripts/validate-dist.mjs"`, `"validate:junie": "node scripts/validate-junie.mjs"`, `"test:e2e": "playwright test"`.
- **Exit Gate** (timeout 120s):
  - `npx astro check && npm run build` exits `0`.
  - Confirm `dist/pagefind/pagefind.js` exists and `src/pages/probe-mdx.mdx` has been removed.

### Card `T2.2` — Contract Freeze (`sp.config.ts` & All Zod 4 Schemas)
- **Model Tier**: `Frontier` or `Sonnet / Mid-tier`
- **Depends On**: `T2.1`
- **Allowed Files**: `sp.config.ts`, `src/lib/articles/schema.ts`
- **Do Not Touch**: `astro.config.mjs`, `src/pages/*`
- **Inputs / Outputs**:
  - Create `sp.config.ts` matching the exact Frozen Contract (`sp-v8-prefs`, `sp-v8-nav-series`, `sp-v8-idb`, canonical `shortcuts`, `theme`, `media.baseUrl`, `audio` with `mlx-community/Kokoro-82M-bf16` & `am_michael`, `pdf`, `qaBudgets`, `indexedDbCache: false`).
  - Create `src/lib/articles/schema.ts` exporting every Frozen Contract schema (`RESERVED_SLUGS`, `SeriesEntrySchema`, `ArticleRelationSchema`, `ArticleManifestSchema` with publish-only `superRefine` & `deriveStatus()`, `CostModelSchema`, `SystemTopologySchema`, `AudioScriptSchema`, `AudioChaptersOutputSchema`, `GeneratedLockSchema`, `LinkedInMetadataSchema`, `DraftsIndexSchema`, `UserPrefsSchema`, and `GraphIndex` TS interfaces).
- **Exit Gate** (timeout 60s):
  - `npx astro check` exits `0`.
  - Inline `node` smoke script importing compiled/TS schema confirms valid fixtures pass and invalid fixtures (reserved slug `'explore'`, invalid date, `phase: 'published'` missing `quickRead`) throw Zod errors.

### Card `T2.3` — Registry, Asset Integration & Minimal 2-Article Fixtures
- **Model Tier**: `Haiku / Neon-low`
- **Depends On**: `T2.2`
- **Allowed Files**: `src/lib/articles/registry.ts`, `src/lib/integrations/article-assets.ts`, `astro.config.mjs` (wire `articleAssetsIntegration()` + registry-backed sitemap `filter`), `src/series/series.json`, minimal fixtures under `src/articles/design-url-redirection-service/{article.json,generated.lock.json,pages/index.mdx,pages/interactive-lab.mdx,data/cost-models.json,diagrams/architecture.diagram.json,audio/script.json,audio/chapters.json,audio/episode.mp3,social/linkedin.md,social/linkedin.json,social/thumbnail-light.webp,social/thumbnail-dark.webp,social/thumbnail.png,llms-notes.md,logs/session-001.md}` and `src/articles/bloom-filter-building-block/{article.json,pages/index.mdx,social/linkedin.md,social/linkedin.json,llms-notes.md,logs/session-001.md}`
- **Do Not Touch**: `src/articles/design-url-redirection-service/prototypes/v1.html`, `sp.config.ts`, `src/lib/articles/schema.ts`
- **Inputs / Outputs**:
  - `registry.ts`: Node-safe loader reading `src/articles/*/article.json`, `src/series/series.json`, and discovering `prototypes/vN.html` sorted numerically (`v10 > v2`).
  - `article-assets.ts`: Astro integration with explicit file allowlist (`data/*.json`, `diagrams/*.webp`, `social/{linkedin-card.png,thumbnail*.{webp,png}}`, `audio/{episode.mp3,chapters.json}`, `exports/<slug>.pdf` → `/<slug>/<slug>.pdf`); supports HTTP `Range` requests for `.mp3` in `astro dev`; **never** copies `script.json`, `.cache/`, or raw `prototypes/`; conditionally calls `injectRoute({ pattern: '/print-export/[slug]', entrypoint: 'src/internal-routes/print-export.astro' })` **only** when `process.env.SP_PDF_RENDER === '1'`.
  - `astro.config.mjs`: Wire `articleAssetsIntegration()` and add the `@astrojs/sitemap` `filter` callback excluding draft article slugs (from `registry.ts`), `/prototype/`, and `/print-export/`.
  - **Minimal fixtures & temporary Phase 2–5 gate**:
    - `design-url-redirection-service`: `phase: "published"`, member of `system-design` (`primarySeries`) and `edge-and-traffic-architecture`, `features: { audio: true, pdf: false }` (flipped to `pdf: true` in `T5.3`/`T6.1` once `exports/design-url-redirection-service.pdf` is generated), valid `publishedAt`/`quickRead`/`thumbnailAlt`, empty `generated.lock.json` (`{ "schemaVersion": 1, "artifacts": {} }`), and valid `audio/chapters.json`. *Note: This fixture intentionally satisfies only the manifest-level temporary gate for Stages 2–5 (`ArticleManifestSchema`), not the strict filesystem/hash-lock publish gate enforced in `T6.2`.*
    - **Deterministic zero-`ffmpeg` fixture `audio/episode.mp3`** (verified to decode in Chromium `<audio>` as `duration: 1.04s, error: null`, `4,160` bytes): generate via inline Node using 40 silent MPEG-1 Layer III frames (`32 kbps`, `44.1 kHz`, mono, `104` bytes/frame):
      ```js
      const buf = Buffer.alloc(104 * 40, 0);
      for (let i = 0; i < 40; i++) buf.set([0xff, 0xfb, 0x10, 0xc4], i * 104);
      fs.writeFileSync('src/articles/design-url-redirection-service/audio/episode.mp3', buf);
      ```
    - **Deterministic placeholder thumbnails**: generate `800×450` `social/thumbnail-light.webp`, `social/thumbnail-dark.webp`, and `social/thumbnail.png` via already-installed `sharp({ create: { width: 800, height: 450, channels: 4, background: ... } })`.
    - `bloom-filter-building-block`: `phase: "discussing"`, `archetype: "building-block"`.
- **Exit Gate** (timeout 60s):
  - `npx astro check` exits `0`.
  - `node` verification prints `published=1 draft=1 series=2 prototypes=[v1] mp3Bytes=4160`.

### Card `T2.4` — Reading Shell, CSS Tokens, Unified Routing & Prototype Endpoint
- **Model Tier**: `Sonnet / Mid-tier`
- **Depends On**: `T2.3`
- **Allowed Files**: `src/styles/global.css`, `src/layouts/BaseLayout.astro`, `src/layouts/ArticleLayout.astro`, `src/components/ThemeControls.tsx`, `src/components/ui/PrintNotice.astro`, `src/components/ui/QuickRead.astro`, `src/pages/404.astro`, `src/pages/[...slug].astro`, `src/pages/[slug]/prototype/[...file].ts`
- **Do Not Touch**: `src/lib/articles/schema.ts`, `src/articles/*/prototypes/v1.html`
- **Inputs / Outputs**:
  - Port frozen `--sp-*` tokens from `v1.html` into `src/styles/global.css` with Tailwind v4 `@import "tailwindcss";`, `@custom-variant dark (&:where([data-sp-scheme="dark"], [data-sp-scheme="dark"] *));`, `@source not "../articles/*/prototypes";`, and `@media print` guard scoped to `:root:not([data-sp-export="pdf"])`.
  - `BaseLayout.astro`: `<ClientRouter />`, 56px top bar, pre-paint inline bootstrap script (synced on `astro:page-load`), per-page `<link rel="canonical">` stripping `?ctx=`, `data-pagefind-body` allowlist strictly on published `<main>` (omitted for drafts/404/prototypes), conditional `PrintNotice.astro`.
  - `[...slug].astro`: Unified static router for article root & sub-pages (`pages/*.mdx` rendered statically); emits `<meta name="robots" content="noindex, nofollow" />` for draft articles.
  - `[slug]/prototype/[...file].ts`: Emits literal `file: 'index.html'` (latest by numeric version sort) and `file: 'vN/index.html'` for each `prototypes/vN.html`, injecting `<meta name="robots" content="noindex, nofollow" />` and stripping `data-pagefind-body` with zero file/directory collision.
- **Exit Gate** (timeout 90s):
  - `npx astro check && npm run build` exits `0`.
  - Assert `dist/design-url-redirection-service/index.html` contains `data-pagefind-body`; `dist/bloom-filter-building-block/index.html` contains `noindex, nofollow` and lacks `data-pagefind-body`; **both** `dist/design-url-redirection-service/prototype/index.html` and `dist/design-url-redirection-service/prototype/v1/index.html` exist, contain `noindex, nofollow`, and lack `data-pagefind-body`.

> **Stage 2 Review Checkpoint**: Verify `npx astro preview` renders the fixture article, draft URL, and prototype URL cleanly in Light & Dark modes before starting Stage 3.

---

## Stage 3: Knowledge Graph, Multi-Series Context, `Cmd+K` & `/explore/`

### Card `T3.1` — Knowledge Graph Compiler & Hashed Index Emission
- **Model Tier**: `Sonnet / Mid-tier`
- **Depends On**: `T2.4`
- **Allowed Files**: `src/lib/graph/build-graph.ts`, `src/lib/integrations/article-assets.ts` (emit `graph-index.<hash>.json` on build/dev), `src/layouts/BaseLayout.astro` (inject `<meta name="sp-graph-url">`)
- **Do Not Touch**: `src/lib/articles/schema.ts`, `src/articles/*`
- **Inputs / Outputs**:
  - Extract H2/H3 headings deterministically from published `.mdx` files using `github-slugger` (exact parity with Astro heading IDs).
  - Compile series memberships from `src/series/series.json`, validate `primarySeries`, compile outgoing `relations[]` + reverse `referencedBy` backlinks (including source tab), detect cycles in `prerequisite`/`deep-dive-of`, compute deterministic layered SVG coordinates (`svgLayout`), and emit `dist/graph-index.<8-char-sha256>.json` (<25 KB gzipped) containing **published content only**.
- **Exit Gate** (timeout 90s):
  - `npx astro check && npm run build` exits `0`.
  - Verify `dist/graph-index.*.json` exists, `<meta name="sp-graph-url">` in `dist/design-url-redirection-service/index.html` matches the emitted filename, and `bloom-filter-building-block` is absent from `graph-index.*.json`.

### Card `T3.2a` — Zero-CLS Multi-Series Breadcrumbs, Connections & Draft-Safe `<ArticleRef>`
- **Model Tier**: `Sonnet / Mid-tier` *(high-risk hydration/CLS/context validation logic — never delegate to Haiku)*
- **Depends On**: `T3.1`
- **Allowed Files**: `src/layouts/ArticleLayout.astro`, `src/components/ui/{ConnectionsPanel.astro,ArticleRef.astro,ArticleRefCard.tsx}`
- **Do Not Touch**: `src/lib/graph/build-graph.ts`, `src/layouts/BaseLayout.astro`, `sp.config.ts`
- **Inputs / Outputs**:
  - Zero-CLS pre-rendered multi-series breadcrumb switcher + series-scoped Prev/Next variants toggled purely via `html[data-sp-nav-series]` CSS (`[data-sp-series-variant="<slug>"]`) outside React SSR + pre-paint script (synced idempotently on `astro:page-load`) strictly validating `?ctx=series:<slug>` and `sessionStorage["sp-v8-nav-series"]` against actual memberships with safe fallback to `primarySeries`.
  - `ConnectionsPanel.astro`: Zero-JS static `Part of Series`, `Uses Building Blocks`, `Referenced By` backlinks, and Prev/Next.
  - `ArticleRef.astro` / `ArticleRefCard.tsx`: Links published targets; renders an **unlinked "Coming Soon" card** (zero `href`) for draft targets.
- **Exit Gate** (timeout 90s):
  - `npx astro check && npm run build` exits `0`.
  - Verify `dist/design-url-redirection-service/index.html` pre-renders both series variants (`data-sp-series-variant="system-design"` and `data-sp-series-variant="edge-and-traffic-architecture"`) with zero `href` to `/bloom-filter-building-block/`.

### Card `T3.2b` — Homepage, Series Hub & Unlisted Draft Discovery
- **Model Tier**: `Haiku / Neon-low`
- **Depends On**: `T3.1`
- **Allowed Files**: `src/components/ui/ArticleCard.astro`, `src/components/DraftDiscovery.tsx`, `src/pages/index.astro`, `src/pages/series/[series].astro`, `src/pages/drafts-index.json.ts`
- **Do Not Touch**: `src/layouts/ArticleLayout.astro`, `src/layouts/BaseLayout.astro`, `src/lib/graph/build-graph.ts`, `sp.config.ts`
- **Inputs / Outputs**:
  - `ArticleCard.astro`, `index.astro`, and `series/[series].astro` rendering published articles and series packages only (with `?ctx=series:<slug>` links from series hubs).
  - `drafts-index.json.ts` (conforming to `DraftsIndexSchema`, emitting `/<slug>/prototype/` for latest and `/<slug>/prototype/vN/` for explicit versions) and `DraftDiscovery.tsx` (fetches `/drafts-index.json` client-side **only** when `?drafts=true`).
- **Exit Gate** (timeout 90s):
  - `npx astro check && npm run build` exits `0`.
  - Assert `dist/index.html` contains zero occurrences of `bloom-filter-building-block` while `dist/drafts-index.json` lists both `bloom-filter-building-block` and `design-url-redirection-service` prototype URLs (`/design-url-redirection-service/prototype/` and `/design-url-redirection-service/prototype/v1/`).

### Card `T3.3` — Keyboard Dispatcher, Unified `Cmd+K` Palette & Opt-In IDB Cache
- **Model Tier**: `Sonnet / Mid-tier`
- **Depends On**: `T3.1` *(owns `BaseLayout.astro` in Window 2 — serialized after `T3.1` and before `T5.4`)*
- **Allowed Files**: `src/lib/cache/idb-cache.ts`, `src/lib/keyboard/dispatcher.ts`, `src/components/CommandPalette.tsx`, `src/components/ShortcutsModal.tsx`, `src/layouts/BaseLayout.astro` (mount palette + modal)
- **Do Not Touch**: `src/lib/graph/build-graph.ts`, `src/layouts/ArticleLayout.astro`, `src/pages/drafts-index.json.ts`
- **Inputs / Outputs**:
  - `idb-cache.ts`: Default in-memory + HTTP `ETag`/`304` fetch of `<meta name="sp-graph-url">`; opt-in hash-keyed IndexedDB (`sp-v8-idb`) behind `spConfig.features.indexedDbCache` with atomic swap and automatic HTTP fallback on any error.
  - `dispatcher.ts`: Single global shortcut handler from `spConfig.shortcuts`, allowing Shift for `?`/`>`, strict focus isolation (`input`/`textarea`/`select`/sliders/ReactFlow/IME), suppressing all single-key shortcuts while any dialog is open (only `Escape` closes), `g h`/`g e` chords, and WCAG 2.1.4 `singleKeyShortcuts` off-switch.
  - `CommandPalette.tsx` (`cmdk@1.1.1` wrapped in `@radix-ui/react-dialog`) & `ShortcutsModal.tsx`: Focus modal immediately on open, enforce `Tab`/`Shift+Tab` focus trap, restore trigger focus on close, wire proper ARIA combobox/listbox semantics (`role="combobox"`, `aria-controls`, `aria-expanded`, `aria-activedescendant`, `role="listbox"`, `role="group"`, `role="option"`), `shouldFilter={false}`, synchronous top structural groups (`Series`, `Articles & Tabs`, `Sections`) + lazy `import(/* @vite-ignore */ '/pagefind/pagefind.js')` rendered strictly in bottom `Full-Text Matches` group deduplicated by `canonicalPathname + #fragment` with stale-query guard.
- **Exit Gate** (timeout 90s):
  - `npx astro check && npm run build` exits `0`.
  - Verify built bundle contains no static Pagefind import error and serves `Cmd+K` + `?` with focus trap, shortcut suppression, and zero console errors against `astro preview`.

### Card `T3.4` — `/explore/` Knowledge Graph Explorer
- **Model Tier**: `Haiku / Neon-low`
- **Depends On**: `T3.1`
- **Allowed Files**: `src/pages/explore.astro`, `src/components/ExploreGraph.tsx`
- **Do Not Touch**: `src/layouts/ArticleLayout.astro` (keep zero graph-library JS on reading pages!)
- **Inputs / Outputs**:
  - Filterable Series / Archetype / Building-Block explorer + interactive SVG graph consuming `svgLayout` from `/graph-index.<hash>.json` (click-to-preview & navigate with `?ctx=series:<slug>`).
- **Exit Gate** (timeout 90s):
  - `npx astro check && npm run build` exits `0`.
  - Confirm `dist/explore/index.html` exists and renders SVG graph nodes cleanly.

> **Stage 3 Review Checkpoint**: Confirm multi-series `?ctx=` switching, `Cmd+K` structural + Pagefind results, and `/explore/` SVG navigation work on `astro preview`.

---

## Stage 4: Interactive Primitives & Persistent Audio Player

### Card `T4.1` — Flagship Design X Interactive Widgets & UI Primitives
- **Model Tier**: `Sonnet / Mid-tier`
- **Depends On**: `T2.4`
- **Allowed Files**: `src/hooks/useArticleData.ts`, `src/components/interactive/{SystemTopology.tsx,ScaleVariantSwitcher.tsx,CostModelCalculator.tsx}`, `src/components/ui/{Callout.astro,StepFrame.tsx,ChartFrame.tsx}`
- **Do Not Touch**: `src/lib/articles/schema.ts`, `src/layouts/*`
- **Inputs / Outputs**:
  - Strongly typed props matching `SystemTopologySchema` and `CostModelSchema` (zero `any`).
  - `SystemTopology.tsx`: Scale tier switching, `Generic ↔ AWS` label toggle, click/keyboard node selection, fault injection (`healthy` / `degraded` / `failed`), active fallback edge rendering, blast-radius inspector, and optional feature toggle.
  - `CostModelCalculator.tsx`: `pricingAsOf`, sourced links, traffic volume slider, AWS On-Demand List vs. Enterprise Discount Range cards, itemized breakdown table.
- **Exit Gate** (timeout 60s):
  - `npx astro check` exits `0` with zero TypeScript errors.

### Card `T4.2` — Persistent Sticky Synced Audio Player
- **Model Tier**: `Sonnet / Mid-tier`
- **Depends On**: `T3.2a` *(serialized after `T3.2a` so `ArticleLayout.astro` has a single owner in every window)*
- **Allowed Files**: `src/components/AudioPlayer.tsx`, `src/layouts/ArticleLayout.astro` (mount with `transition:persist="sp-audio-player"`)
- **Do Not Touch**: `src/lib/articles/schema.ts`, `src/layouts/BaseLayout.astro`
- **Inputs / Outputs**:
  - Consumes `AudioChaptersOutputSchema` (`/slug/audio/chapters.json`) + `spConfig.audio.baseUrl` + `/slug/audio/episode.mp3` with `<audio preload="none">`.
  - Play/pause, scrub, ±15s skip, speed (`1×–2×`), chapters list, accessible **Transcript drawer**, Media Session API metadata, cross-tab **"Jump to Section"** (via Astro client navigation + smooth scroll without restarting audio), and opt-in **Auto-Follow** (default OFF, pauses on manual scroll, respects `prefers-reduced-motion`).
- **Exit Gate** (timeout 90s):
  - `npx astro check && npm run build` exits `0`.
  - Headless Chromium check against `astro preview` verifies starting playback on Overview and switching to Interactive Lab tab preserves the single persistent `<audio>` element without restarting playback.

---

## Stage 5: Local Media Pipelines & LLM / SEO Endpoints

### Card `T5.1` — Visuals, Thumbnails & LinkedIn Card Pipeline (`npm run visuals`)
- **Model Tier**: `Haiku / Neon-low` or `Sonnet`
- **Depends On**: `T2.3`
- **Allowed Files**: `src/components/ui/ThemedVisual.astro`, `scripts/render-visuals.mjs`
- **Do Not Touch**: `src/lib/articles/schema.ts`, `package.json` *(scripts pre-wired in `T2.1`)*
- **Inputs / Outputs**:
  - `ThemedVisual.astro`: Renders Light & Dark `.webp` images toggled purely via CSS `[data-sp-scheme="dark"]` (never OS-only `<picture media>`).
  - `scripts/render-visuals.mjs`: Uses Playwright + Sharp to render `diagrams/*.diagram.json` and `*.mmd` into `diagrams/<name>-{light,dark}.webp`, `social/thumbnail-{light,dark}.webp` + `social/thumbnail.png` (`800×450`), and `social/linkedin-card.png` (`1200×628`, verified `< 5 MB`). Writes SHA-256 input/output hashes to `generated.lock.json` and skips unchanged artifacts on re-run.
- **Exit Gate** (timeout 120s):
  - `npm run visuals -- design-url-redirection-service` exits `0`, emits Light/Dark `.webp`, `800×450` thumbnails, and `< 5 MB` LinkedIn PNG; immediate second run reports cache/lock skip.

### Card `T5.2` — Local MLX Kokoro-82M Companion Audio Pipeline (`npm run audio`)
- **Model Tier**: `Sonnet / Mid-tier`
- **Depends On**: `T2.3`
- **Host Prerequisites**: Apple Silicon macOS with `uv` (installed at `~/.local/share/mise/shims/uv`) and `ffmpeg` (**note: `ffmpeg` was not found on PATH during Step 1 — install via `brew install ffmpeg` before running this card**).
- **Allowed Files**: `scripts/audio/synthesize_mlx.py`, `scripts/render-audio.mjs`
- **Do Not Touch**: `src/lib/articles/schema.ts`, `package.json` *(scripts pre-wired in `T2.1`)*
- **Inputs / Outputs**:
  - `render-audio.mjs`: Runs explicit preflight check for `uv` and `ffmpeg` with clear remediation message if absent.
  - `synthesize_mlx.py`: Executed via `uv run --python 3.12` using `mlx-community/Kokoro-82M-bf16` (`am_michael` default from `sp.config.ts`), applies `lexicon` replacements, hashes each paragraph chunk by `(model, voice, langCode, speed, toolVersion, spokenText)` into `audio/.cache/`.
  - `render-audio.mjs`: Stitches uncompressed WAV chunks + `paragraphPauseMs`/`chapterPauseMs` silence to compute **exact sample-accurate** `startSec`/`endSec` chapter timestamps, runs **two-pass FFmpeg `loudnorm`** (`-16 LUFS`, `24 kHz`), encodes `64 kbps` mono `audio/episode.mp3`, writes `audio/chapters.json` (`AudioChaptersOutputSchema`), and updates `generated.lock.json`.
- **Exit Gate** (timeout 120s):
  - `npm run audio -- design-url-redirection-service` exits `0`; `audio/chapters.json` validates against `AudioChaptersOutputSchema`; re-running skips cached chunks.

### Card `T5.3` — Branded Watermarked PDF Export Pipeline (`npm run pdf`)
- **Model Tier**: `Sonnet / Mid-tier`
- **Depends On**: `T2.4`, `T5.1`
- **Allowed Files**: `src/layouts/PrintLayout.astro`, `src/internal-routes/print-export.astro`, `scripts/render-pdf.mjs`
- **Do Not Touch**: `src/pages/*` (print route MUST stay in `src/internal-routes/` via dev-only `injectRoute` so it never enters deployed `dist/`!), `package.json`
- **Inputs / Outputs**:
  - `PrintLayout.astro`: Sets `data-sp-export="pdf"` on `<html>`, disables `@media print` guard, renders running `sujeet.pro` header/footer, subtle diagonal `sujeet.pro` watermark (`opacity: 0.06`), Quick Read + all tabs' prose, static Light-mode `.webp` snapshots, and generated `qrcode` SVG linking back to live interactive lab.
  - `scripts/render-pdf.mjs`: Launches Astro dev on an ephemeral port with `SP_PDF_RENDER=1`, prints `/print-export/<slug>/` via Playwright `page.pdf()` (A4, deterministic metadata) to `src/articles/<slug>/exports/<slug>.pdf` (served at `/<slug>/<slug>.pdf`), updates `generated.lock.json`, and cleanly shuts down the dev server.
- **Exit Gate** (timeout 120s):
  - `npm run pdf -- design-url-redirection-service` exits `0`.
  - Parse `exports/design-url-redirection-service.pdf` with `pdf-parse`: assert text contains article title + `sujeet.pro` and does **NOT** contain `"Print Notice"`.
  - Run `npm run build` and verify `dist/print-export` does **NOT** exist.

### Card `T5.4` — LLM Endpoints, SEO/AEO, JSON-LD & RSS
- **Model Tier**: `Haiku / Neon-low`
- **Depends On**: `T3.3` *(serialized after `T3.3` so `BaseLayout.astro` has a single owner in every window)*
- **Allowed Files**: `src/lib/llms/synthesize.ts`, `src/pages/llms.txt.ts`, `src/pages/[slug]/llms-full.txt.ts`, `src/pages/rss.xml.ts`, `src/components/CopyAiPrompt.tsx`, `public/robots.txt`, `src/layouts/BaseLayout.astro` (OG + JSON-LD `TechArticle`, `BreadcrumbList`, `Person`)
- **Do Not Touch**: `src/lib/graph/build-graph.ts`, `src/layouts/ArticleLayout.astro`
- **Inputs / Outputs**:
  - `/llms.txt`: Global Agent Navigation Guide listing published articles, series, and graph structure only.
  - `/<slug>/llms-full.txt`: Compiled prose across all tabs + `llms-notes.md` + topology/cost summaries + GitHub `blob/main` log links.
  - `CopyAiPrompt.tsx`: 1-click clipboard copy with selectable `<textarea>` fallback if clipboard API is blocked.
  - `public/robots.txt`: Allows `/llms.txt`, sets `Disallow: /*.pdf` and `Disallow: /drafts-index.json`.
- **Exit Gate** (timeout 90s):
  - `npx astro check && npm run build` exits `0`.
  - Verify `dist/llms.txt`, `dist/design-url-redirection-service/llms-full.txt`, `dist/rss.xml`, and `dist/sitemap-index.xml` exist and contain **zero** references to `bloom-filter-building-block` or `/prototype/`.

> **Stage 5 Review Checkpoint**: Verify real visuals, real Kokoro-82M audio, real watermarked PDF, and `llms.txt` outputs on the fixture article before writing final flagship content.

---

## Stage 6: Flagship Content, Validators & Full Playwright Suite

### Card `T6.1` — Promote Flagship Multi-Series Design X Article & Draft Stub
- **Model Tier**: `Frontier` (editorial prose, AI-era pragmatism, podcast narration script) + `Haiku / Neon-low` (JSON datasets & component wiring)
- **Depends On**: `T4.1`, `T4.2`, `T5.1`, `T5.2`, `T5.3`, `T5.4`
- **Allowed Files**: `src/articles/design-url-redirection-service/**` (preserving `prototypes/v1.html`), `src/articles/bloom-filter-building-block/**`
- **Do Not Touch**: `src/articles/design-url-redirection-service/prototypes/v1.html`, `src/lib/*`, `scripts/*`
- **Inputs / Outputs**:
  - Full Principal Engineer prose in `pages/index.mdx` (Quick Read, vanity vs. shortener trade-offs, Bloom filter guard, `<ThemedVisual />`, unlinked `<ArticleRef slug="bloom-filter-building-block" />`, AI-era deterministic tooling vs. DNS/org bottlenecks) and `pages/interactive-lab.mdx` mounting `<RedirectorLab client:visible />`.
  - Complete `components/RedirectorLab.tsx`, sourced `data/cost-models.json`, `diagrams/architecture.diagram.json`, `diagrams/request-flow.mmd`, podcast-ordered `audio/script.json` with pronunciation `lexicon`, `social/linkedin.{md,json}`, `llms-notes.md`, `logs/session-001.md`, flip `features.pdf: true` in `article.json`, and scaffold colocated `src/articles/design-url-redirection-service/tests/article.e2e.ts` so `T6.2`'s strict publish gate passes with zero escape hatches.
  - Run `npm run visuals -- design-url-redirection-service`, `npm run audio -- design-url-redirection-service`, and `npm run pdf -- design-url-redirection-service` so all committed binaries and `generated.lock.json` are fresh.
- **Exit Gate** (timeout 120s):
  - `npx astro check && npm run build` exits `0`; `generated.lock.json` covers visuals, audio, and PDF artifacts.

### Card `T6.2` — Pre-Build & Post-Build Validators (`validate.mjs` & `validate-dist.mjs`)
- **Model Tier**: `Sonnet / Mid-tier`
- **Depends On**: `T6.1`
- **Allowed Files**: `scripts/validate.mjs`, `scripts/validate-dist.mjs`
- **Do Not Touch**: `src/articles/*`, `package.json`
- **Inputs / Outputs**:
  - `scripts/validate.mjs` (plain Node, zero `import.meta.glob`): Activates the **strict publish gate** — validates every manifest/series/cost/topology/audio/linkedin/lock JSON against Zod strict schemas, checks `RESERVED_SLUGS`, series membership/primarySeries consistency, graph cycles, published→draft ref rules, `generated.lock.json` staleness hashes, LinkedIn PNG `< 5 MB`, enabled audio/PDF artifacts, `llms-notes.md`, thumbnails, and colocated `tests/article.e2e.ts`.
  - `scripts/validate-dist.mjs`: Crawls `dist/` HTML checking every internal link, decoded target-page `#section` DOM ID (including `relations[]` and `audio/chapters.json` targets), unique IDs per page, `src`/`srcset` asset resolution, PDF text validity via `pdf-parse` (must contain article prose & `sujeet.pro`, must NOT contain Print Notice), absence of `dist/print-export/`, and zero draft/prototype leaks across public HTML, sitemap, RSS, `graph-index.*.json`, and `llms.txt`.
- **Exit Gate** (timeout 90s):
  - `npm run validate && npm run build && npm run validate:dist` exits `0`.
  - Negative test (temporarily breaking a `#section` target or adding a draft `href` in memory/copy) confirms validator exits non-zero.

### Card `T6.3` — Playwright E2E Suite & QA Audit Harness
- **Model Tier**: `Haiku / Neon-low` or `Sonnet`
- **Depends On**: `T6.2`
- **Allowed Files**: `playwright.config.ts`, `tests/e2e/helpers/qa-audit.ts`, `tests/e2e/{theme,command-palette,graph-navigation,audio-and-pdf,drafts-prototypes-llms}.spec.ts`, `src/articles/design-url-redirection-service/tests/article.e2e.ts`
- **Do Not Touch**: `src/lib/*`, `scripts/*`, `package.json`
- **Inputs / Outputs**:
  - `playwright.config.ts`: `list` reporter locally, `github` in CI; discovers both `tests/e2e/**/*.spec.ts` and `src/articles/*/tests/*.e2e.ts`; runs against `astro preview`.
  - `qa-audit.ts`: Reusable assertions for zero console/page/network/image errors, `CLS < 0.05` (hard gate), cold-mobile lab `LCP` / `INP` logging (warn-only in CI), per-page canonical/OG/JSON-LD, and `@media print` guard.
  - Covers every scenario in `<user_plan>` Testing (theme, `Cmd+K` body-only Pagefind hit + zero row jump + WCAG 2.1.4 off-switch, multi-series `?ctx=` + `/explore/`, persistent cross-tab audio + transcript + section jump, PDF HTTP 200 & Print Notice, `?drafts=true` & `noindex` leak checks, opt-in IDB fallback, and flagship Design X lab interactions).
- **Exit Gate** (timeout 120s):
  - `npm run test:e2e` exits `0` cleanly on desktop + mobile, Light + Dark.

> **Stage 6 Review Checkpoint**: Full site, media, validators, and E2E suite are green locally before codifying Junie workflows and CI.

---

## Stage 7: Junie Configuration & Single-Pass CI Hardening

### Card `T7.1` — Junie Rules, 5 Cohesive Skills, 3 Subagents & Discovery Validator
- **Model Tier**: `Frontier` or `Sonnet / Mid-tier`
- **Depends On**: `T6.3`
- **Allowed Files**: `AGENTS.md`, `.junie/config.json`, `.junie/rules/{architecture,voice-and-quality,interactive-ux,archetypes-and-pe-standards}.md`, `.junie/skills/{article,article-prototype,article-media,article-social,article-qa}/SKILL.md` (+ templates under `.junie/skills/article/`), `.junie/agents/{article-researcher,article-builder,article-reviewer}.md`, `scripts/validate-junie.mjs`
- **Do Not Touch**: `.junie/plans/*`, `src/*`, `package.json`
- **Inputs / Outputs**:
  - Ground every rule and template in the verified schemas, `sp-*` prefixes, Principal Engineer voice (`~/workspace/agents-devkit/plugins/adk/VOICE.md`), AI-era pragmatic engineering standards, and prototype-first authoring flow.
  - `scripts/validate-junie.mjs`: Validates YAML frontmatter, required skill/agent fields, internal path links, and absence of legacy v7 `@pagesmith`/`diagramkit` references.
- **Exit Gate** (timeout 60s):
  - `npm run validate:junie` exits `0`.
  - Live Junie CLI discovery smoke check confirms all 5 skills and 3 agents are discovered cleanly.

### Card `T7.2` — Hardened GitHub Pages CI Workflow (Single-Pass Edit)
- **Model Tier**: `Haiku / Neon-low`
- **Depends On**: `T7.1`
- **Allowed Files**: `.github/workflows/deploy.yml`
- **Do Not Touch**: `src/*`, `scripts/*`, `.junie/*`
- **Inputs / Outputs**:
  - Keep existing `concurrency: { group: pages, cancel-in-progress: false }` block intact.
  - Wire full verification sequence before `upload-pages-artifact`:
    1. `npm ci`
    2. `npm run validate`
    3. `npm run validate:junie`
    4. `npx astro check`
    5. `npm run build` (Astro + Pagefind)
    6. `npm run validate:dist`
    7. Cache Playwright Chromium binaries + `npx playwright install chromium` (cache miss) + `npm run test:e2e` (hard-gating correctness/CLS/leaks; LCP warn-only on shared runners).
- **Exit Gate** (timeout 180s):
  - Local dry run of the exact CI command sequence (`npm run validate && npm run validate:junie && npx astro check && npm run build && npm run validate:dist && npm run test:e2e`) exits `0`.

---

## Execution & Model Routing Quick Reference

| Model Tier | Assigned Cards | Share of Work |
| :--- | :--- | :--- |
| **Frontier** | `T1.1` *(done)*, `T2.2`, `T6.1` *(prose/script)*, `T7.1` | ~20% — Visual craft, frozen contracts, PE prose, Junie skills |
| **Sonnet / Mid-tier** | `T2.1`, `T2.4`, `T3.1`, `T3.2a`, `T3.3`, `T4.1`, `T4.2`, `T5.2`, `T5.3`, `T6.2` | ~50% — Stateful UI, zero-CLS multi-series breadcrumbs, AST/graph, Python/FFmpeg/Playwright pipelines, validators |
| **Haiku / Neon-low** | `T2.3`, `T3.2b`, `T3.4`, `T5.1`, `T5.4`, `T6.3`, `T7.2` | ~30% — Mechanical hub wiring, static endpoints, fixtures, E2E specs, CI YAML |

**Serialized Shared-File Chains (Single Owner per Window)**:
- `package.json`: `T2.1` only (all npm script entries pre-wired upfront).
- `astro.config.mjs`: `T2.1 → T2.3`.
- `src/lib/integrations/article-assets.ts`: `T2.3 → T3.1`.
- `src/layouts/BaseLayout.astro`: `T2.4 → T3.1 → T3.3 → T5.4`.
- `src/layouts/ArticleLayout.astro`: `T2.4 → T3.2a → T4.2`.

**Safe Parallelization Windows** (100% disjoint `Allowed Files`, verified against chains above):
- **Window 1 (after `T2.4`)**: `T3.1`, `T4.1`, `T5.1`, `T5.2`
- **Window 2 (after `T3.1`)**: `T3.2a`, `T3.2b`, `T3.3`, `T3.4`
- **Window 3 (after `T3.2a`, `T3.3`, `T5.1`)**: `T4.2`, `T5.3`, `T5.4`
- **Sequential tail**: `T6.1 → T6.2 → T6.3 → T7.1 → T7.2`
