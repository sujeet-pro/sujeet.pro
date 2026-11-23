# Architecture rules

Static, keyboard-first Astro 7 site of interactive articles, deployed to GitHub Pages. No backend, DB, CMS, auth or MCP server. Heavy generation (visuals, audio, PDF) runs locally; CI never runs it. Contracts live in `docs/implementation-plan.md` §4; this file is the working summary.

## Stack (pinned; do not revisit without owner sign-off)

| Area | Choice |
| :--- | :--- |
| Framework | Astro `^7.4.13`, MDX (`@astrojs/mdx`), React 19 islands, Zod 4 via `astro/zod` |
| Styling | Tailwind v4 (`@tailwindcss/vite`) + `--sp-*` CSS tokens in `src/styles/global.css` |
| Code blocks | `astro-expressive-code`, theme bound to `data-sp-scheme` |
| Search | `cmdk@1.1.1` (exact) + build-time structural index + Pagefind |
| Dialogs / tabs / tooltips | Radix (`@radix-ui/react-dialog`, `-tabs`, `-tooltip`) |
| TypeScript | `^5.8` (repo has 5.9.x). **Never accept TS 7** — Astro 7 rejects it (P20) |
| Node | CI Node 24; `engines >=22.23.4`. Plain-Node scripts import `.ts` via native type stripping |
| Tests | `@playwright/test` (Chromium) |

## Repo map (what exists)

```text
AGENTS.md / CLAUDE.md          agent entry points (CLAUDE.md imports AGENTS.md)
ai-guidelines/                 shared agent instructions (this folder)
.junie/ .claude/               thin skill/agent wrappers; .junie/plans/ = master plans (do not edit casually)
sp.config.ts                   single typed config (features, shortcuts, audio, pdf, layout, qaBudgets)
astro.config.mjs               site, integrations, sitemap filter (drops drafts + /prototype/)
scripts/                       render-audio.mjs, audio/synthesize_mlx.py, setup-audio.sh, validate-junie.mjs
src/
  articles/<slug>/             ONE folder per article (see below)
  series/series.json           series membership + order (single source)
  components/                  CommandPalette, ShortcutsModal, ThemeControls, ExploreGraph, DraftDiscovery
  components/ui/               QuickRead, Callout, ArticleCard, ArticleRef(+Card), ConnectionsPanel, PrintNotice, ThemedVisual
  components/evolution/        EvolutionLadder, EvolutionStage, ExplainerFigure, FigureModeToggle
  components/interactive/      SystemTopology, ScaleVariantSwitcher, CostModelCalculator, labStore
  layouts/                     BaseLayout (pre-paint prefs, ClientRouter, WIP banner), ArticleLayout
  lib/articles/                schema.ts (Zod), registry.ts, evolution.ts (activeSet, stageDiff, checkEvolutionRefs)
  lib/graph/                   build-graph.ts, labels.ts, types.ts
  lib/keyboard/dispatcher.ts   THE keydown listener
  lib/prefs.ts, lib/media.ts, lib/cache/idb-cache.ts, lib/integrations/article-assets.ts
  pages/                       index, 404, explore, [...slug], [slug]/prototype/[...variant], series/[series],
                               drafts-index.json.ts, graph-index.[hash].json.ts
```

Planned but not yet present (check `docs/implementation-plan.md` §1/§5 before assuming): `scripts/{validate,validate-dist,render-visuals,render-pdf}.mjs`, `playwright.config.ts`, `tests/e2e/`, `PrintLayout.astro`, `llms.txt` / RSS routes, `AudioPlayer.tsx`, `CopyAiPrompt.tsx`.

## Single-folder article rule

Everything for an article lives in `src/articles/<slug>/` and the folder name equals `article.json` `slug`:

| Path | Purpose |
| :--- | :--- |
| `article.json` | Manifest (`ArticleManifestSchema`): `archetype`, `phase`, `primarySeries`, `quickRead`, `features`, `pages[]`, `relations[]` |
| `pages/*.mdx` | Every page is MDX. Full-React pages are 4-line MDX wrappers that statically import and mount the island (P4) |
| `components/*.tsx` | Article-specific islands (e.g. `RedirectorLab.tsx`) |
| `data/evolution.json`, `data/topology.json`, `data/cost-models.json` | Evolution body, topology nodes, sourced cost tiers |
| `diagrams/` | Specs + rendered `<name>-{light,dark}.webp`, per-stage `stage-l<n>-{light,dark}.webp` |
| `prototypes/vN.html` | Standalone previews. **v1 and v2 are frozen** — never edit; iterate via `v3.html` |
| `audio/script.json` → `audio/episode.mp3`, `audio/chapters.json` | Podcast companion (`script.json` and `audio/.cache/` are local-only) |
| `exports/<slug>.pdf`, `social/*`, `logs/*.md`, `llms-notes.md`, `tests/article.e2e.ts`, `generated.lock.json` | PDF, social, decisions log, LLM notes, E2E, staleness hashes |

`status` is **derived**, never stored: `phase === 'published' ? 'published' : 'draft'`.

## Visibility tiers and leak rules

| Tier | What | Appears in | Must never appear in |
| :--- | :--- | :--- | :--- |
| `published` | `phase === 'published'` | Homepage, series hubs, `/explore/`, sitemap, RSS, Pagefind, `graph-index.<hash>.json`, `/llms.txt`, `/<slug>/llms-full.txt` | — |
| `unlisted` | Drafts (any other phase) + `prototypes/vN.html` | Direct URL only, `noindex, nofollow`; listed only by `/drafts-index.json` (fetched client-side on `/?drafts=true`) | Any `href` in published HTML, sitemap, RSS, Pagefind, `graph-index`, `/llms.txt`, OG/JSON-LD of other pages |
| `local-only` | `/print-export/<slug>/`, `audio/.cache/`, `audio/script.json`, `diagrams/.cache.json`, raw `prototypes/` | Developer machine | Anything under `dist/` |

- `<ArticleRef slug="…">` to a draft renders an **unlinked** "Coming Soon" card: title + archetype, no `href`, no slug in attributes.
- Only published `<main>` carries `data-pagefind-body` (allowlist). Draft and prototype pages never do.
- Leak checks match URL forms (`/<slug>/`, `href`/`src` attributes), never free text — prose may legitimately mention a slug.

## Graph invariants

- `series.json` is the **only** source of series order; `article.json` holds only `primarySeries` (must be one of its memberships; required iff in ≥ 1 series).
- Relation kinds: `prerequisite`, `builds-on`, `deep-dive-of`, `uses-building-block`, `related`. No cycles over `prerequisite` / `deep-dive-of`. A published → draft relation is allowed only as an "upcoming" reference: it renders as the unlinked Coming Soon card, never a link (plan §8 5.1).
- The structural index (`graph-index.<hash>.json`) contains **published articles only**; keep it < 25 KB gzipped.
- Breadcrumbs, series switcher and Prev/Next are **Astro markup, not React** (P10): pre-render every membership variant and toggle with CSS on `html[data-sp-nav-series]`.

## Namespacing

`sp-` everywhere: storage keys `sp-v8-prefs`, `sp-v8-nav-series`, `sp-v8-idb`; attributes `data-sp-scheme`, `data-sp-scheme-pref`, `data-sp-contrast`, `data-sp-text`, `data-sp-nav-series`, `data-sp-export`; CSS custom properties `--sp-*`; CSS classes `sp-*`; config `sp.config.ts`. New globals, events (`sp:prefs-changed`) and classes follow the same prefix.

## Owner rules that are easy to break

- **Prototypes v1/v2 are frozen.** Never edit `prototypes/v1.html` or `v2.html`; copy to `v3.html` to iterate.
- **The site-wide WIP banner stays** (`.sp-wip-banner` in `BaseLayout.astro`) until the owner removes it. Do not remove or hide it.
- **One keyboard dispatcher** (`src/lib/keyboard/dispatcher.ts`) owns `keydown`. Islands subscribe with `on(action, handler)`; never add another global `keydown` listener (P14, P23).
- **Radix dialogs** with explicit opener focus restore (P15). Do not hand-roll dialogs.
- **No React for breadcrumbs** / series switcher / Prev/Next (P10).
- Do not edit `docs/implementation-plan.md` or `.junie/plans/*` except to tick checkboxes / record decisions the owner asked for.

## Pitfalls (full text: `docs/implementation-plan.md` §6)

| # | Short form |
| :--- | :--- |
| P1 | Astro 7 uses Sätteri for Markdown; Expressive Code works without `markdown-remark` (verified S2.1) |
| P2 | PDF route is a dev-only `injectRoute('/print-export/[slug]')` behind `SP_PDF_RENDER=1`; never in `dist/` |
| P3 | Prototype route = `[...variant].astro` + `<Fragment set:html>` (works) |
| P4 | Islands hydrate only when statically imported in MDX; never `import.meta.glob` + `client:*` |
| P5 | Pagefind absent in dev: `import(/* @vite-ignore */ '/pagefind/pagefind.js')` in try/catch |
| P6 | `cmdk` `shouldFilter={false}`; fixed group order Series → Articles & Tabs → Sections → Full-Text Matches → Commands; stale-query guard |
| P7 | `ThemedVisual` renders both images and toggles by `data-sp-scheme`, not `<picture media>` |
| P8 | Tailwind `@custom-variant dark` on `data-sp-scheme`; `@source not` prototypes |
| P9 | Expressive Code `themeCssSelector` on `data-sp-scheme`, `useDarkModeMediaQuery: false` |
| P10 | Multi-series breadcrumbs pre-rendered in Astro + CSS toggle; canonical never has `?ctx=` |
| P11 | `ClientRouter` wipes `<html>` attrs: re-apply prefs on `astro:after-swap` |
| P12 | Hashed graph URL + memory + HTTP cache; IDB opt-in only |
| P13 | Plain-Node scripts: erasable TS only in `sp.config.ts` / `schema.ts` / `evolution.ts`; `.ts` extensions on imports; no `@/` aliases |
| P14 | Dispatcher ignores composing, editable targets, `.react-flow`, modifiers (except `mod+k`); allows Shift; WCAG 2.1.4 gate; `g` chord 900 ms |
| P15 | Dialog focus trap, Esc restores opener focus, blur before hide |
| P16 | Floating menus clamp to viewport on open **and** resize |
| P17 | Each command has its own `match` string |
| P18 | CI hard-gates CLS < 0.05 and errors; LCP/INP warn-only in CI |
| P19 | `generated.lock.json` input hashes prevent rewriting unchanged binaries; 64 kbps mono |
| P20 | TypeScript 5.x only |
| P21 | LAME priming (~46 ms) is acceptable; do not hand-correct chapters |
| P22 | `loudnorm` pass 2 always `-ar 24000` |
| P23 | `j`/`k` belong to the dispatcher, including stage navigation |
| P24 | Cross-file evolution rules E7–E10 live in `checkEvolutionRefs()`, not Zod |
| P25 | `scrolly` not shipped; if ever built: fixed-aspect frame, reduced-motion swap, static fallback |
| P26 | Evolution creep: E10 + reviewer checklist |
| P27 | Image ⇄ Interactive toggle: fixed-aspect frame (CLS 0); topology hydrates only on intent; no `@xyflow/react` in stage figures |
