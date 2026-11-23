# sujeet.pro — agent instructions

Static, keyboard-first Astro 7 site of interactive system-design articles, deployed to GitHub Pages (`https://sujeet.pro`). Each article lives in one folder with a Summary, an evolution-first body (L0…Ln stages with figures), an interactive lab, optional podcast audio and PDF, and `llms.txt` endpoints. No backend, DB, CMS or auth.

This file is read by **Junie** (root `AGENTS.md`) and by **Claude Code** (imported from `CLAUDE.md`). Detailed rules live in [`ai-guidelines/`](ai-guidelines/README.md) — the single source of truth for both tools. Never put rules in the `.junie/` or `.claude/` wrappers.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Commands

| Command | What | Status |
| :--- | :--- | :--- |
| `astro dev --background` | Dev server (never foreground in an agent session) | ready |
| `npx astro check` | Types + `.astro` diagnostics | ready |
| `npm run build` | `astro build && npx pagefind --site dist` | ready |
| `npm run validate:junie` | Validates `ai-guidelines/` + `.junie/` + `.claude/` wiring (runs in CI) | ready |
| `npm run audio -- --slug <slug>` | Local MLX Kokoro podcast render (Apple Silicon; setup: `bash scripts/setup-audio.sh`) | ready |
| `npm run validate` / `validate:dist` / `test:e2e` / `visuals` / `pdf` | Validators, E2E, media | not built yet (see `docs/implementation-plan.md` §1) |

Full table and verify chains: [ai-guidelines/commands.md](ai-guidelines/commands.md).

## Architecture map

```text
sp.config.ts              typed config: features, shortcuts, audio, pdf, layout (hybrid), qaBudgets
src/articles/<slug>/      ONE folder per article: article.json, pages/*.mdx, components/, data/{evolution,topology,cost-models}.json,
                          diagrams/, prototypes/vN.html, audio/, exports/, social/, logs/, llms-notes.md, tests/
src/series/series.json    series membership + order (single source)
src/components/           palette, shortcuts, theme, explore graph; ui/, evolution/, interactive/
src/layouts/              BaseLayout (pre-paint prefs, ClientRouter, WIP banner), ArticleLayout
src/lib/                  articles/{schema,registry,evolution}.ts, graph/, keyboard/dispatcher.ts, prefs.ts, media.ts
src/pages/                index, 404, explore, [...slug], [slug]/prototype/[...variant], series/[series], drafts-index, graph-index
scripts/                  render-audio.mjs, audio/synthesize_mlx.py, setup-audio.sh, validate-junie.mjs
docs/                     implementation-plan.md (canonical plan), preview-guide.md
```

Details: [ai-guidelines/architecture.md](ai-guidelines/architecture.md).

## Visibility tiers

| Tier | What | Rule |
| :--- | :--- | :--- |
| `published` | `phase === 'published'` | Listed everywhere: home, series, `/explore/`, sitemap, RSS, Pagefind, graph index, `/llms.txt` |
| `unlisted` | Drafts (any other phase) + `prototypes/vN.html` | Direct URL only, `noindex, nofollow`; only `/drafts-index.json` (`/?drafts=true`) lists them. Never an `href` in published HTML, sitemap, RSS, Pagefind, graph index or `llms.txt` |
| `local-only` | `/print-export/`, `audio/.cache/`, `audio/script.json`, `diagrams/.cache.json`, raw `prototypes/` files | Never under `dist/` |

## Hard rules (summary — details in ai-guidelines)

- **Accuracy first.** Cite official sources for every quota, limit, latency and price; label anything unverifiable `ASSUMPTION:`. Never invent links, numbers or CLI flags.
- **Voice:** senior-engineer register, but UI copy never names the audience (the Quick Read label is `Summary`). Banned: `in conclusion`, `it's worth noting`, `robust`, `seamless`, `leverage`, `delve`.
- **Evolution-first, right-sized:** every stage has a concrete trigger, a deferred list, exit criteria, a build-vs-buy verdict and a cost band; no component before the level that justifies it (E1–E10).
- **Prototypes v1/v2 are frozen** — iterate via `v3.html`.
- **Site-wide WIP banner stays** until the owner removes it.
- **`sp-` namespacing** for classes, attributes, storage keys, CSS variables and events.
- **One keyboard dispatcher** (`src/lib/keyboard/dispatcher.ts`) owns `keydown`; never add another listener.
- **Radix dialogs** with opener focus restore; **no React for breadcrumbs** / series navigation.
- **TypeScript 5.x only** (Astro 7 rejects TS 7). Media pipelines never run in CI.
- **Git:** commit only when the owner asks; conventional commits; never push to `main` without explicit approval.

## Router: skills and agents

Read [ai-guidelines/README.md](ai-guidelines/README.md) first for any article work.

| Task | Skill / agent | Instructions |
| :--- | :--- | :--- |
| Start or advance an article (`idea → … → published`) | skill `article` | [ai-guidelines/workflows/article.md](ai-guidelines/workflows/article.md) |
| Build a standalone prototype `vN.html` | skill `article-prototype` | [ai-guidelines/workflows/article-prototype.md](ai-guidelines/workflows/article-prototype.md) |
| Visuals, audio, PDF, lock hashes | skill `article-media` | [ai-guidelines/workflows/article-media.md](ai-guidelines/workflows/article-media.md) |
| LinkedIn copy, `linkedin.json`, `llms-notes.md` | skill `article-social` | [ai-guidelines/workflows/article-social.md](ai-guidelines/workflows/article-social.md) |
| Real-browser QA pass | skill `article-qa` | [ai-guidelines/workflows/article-qa.md](ai-guidelines/workflows/article-qa.md) |
| Fact-finding with primary sources (read-only) | agent `article-researcher` | [ai-guidelines/roles/article-researcher.md](ai-guidelines/roles/article-researcher.md) |
| Implement article content and code | agent `article-builder` | [ai-guidelines/roles/article-builder.md](ai-guidelines/roles/article-builder.md) |
| Adversarial review before publish | agent `article-reviewer` | [ai-guidelines/roles/article-reviewer.md](ai-guidelines/roles/article-reviewer.md) |
| Set up local audio generation | — | [ai-guidelines/setup/local-audio.md](ai-guidelines/setup/local-audio.md) |

Wrappers: Junie `.junie/skills/<name>/SKILL.md`, `.junie/agents/<name>.md`; Claude Code `.claude/skills/<name>/SKILL.md`, `.claude/agents/<name>.md`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
