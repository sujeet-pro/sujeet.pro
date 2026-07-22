# Package Reference

Canonical package reference map for the tooling that powers `sujeet.pro`.

Use the installed package docs as the source of truth. This local file tells repo-local skills what to read and highlights the current integration points in this repo.

The live installed versions are whatever `node_modules/<pkg>/package.json`
reports (`@pagesmith/core`, `@pagesmith/site`, `diagramkit`). Read those files
for exact versions rather than trusting a hardcoded banner here — the range in
the root `package.json` only pins the accepted floor.

## @pagesmith/core

Read these files when the task touches markdown behavior, frontmatter, collections, rendering, or Pagesmith-specific constraints. The package no longer ships a top-level `ai-guidelines/` folder — every guideline lives inside the matching skill's `references/` subfolder.

| File                                                                                         | Why it matters                                                                                                         |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `node_modules/@pagesmith/core/REFERENCE.md`                                                  | Full API reference and current runtime behavior                                                                        |
| `node_modules/@pagesmith/core/skills/pagesmith-core-setup/SKILL.md`                          | Bootstrap / retrofit playbook                                                                                          |
| `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/setup-core.md`          | Long-form setup + retrofit prompts                                                                                     |
| `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/usage.md`               | Agent-facing rules and prompt patterns                                                                                 |
| `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md` | Canonical markdown feature reference (GFM, alerts, math, smart typography, code-block meta, themed-image pair merging) |
| `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/recipes.md`             | Step-by-step recipes                                                                                                   |
| `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/errors.md`              | Error catalogue for validation and pipeline issues                                                                     |
| `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/migration.md`           | Upgrade workflow and compatibility checks                                                                              |
| `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/changelog-notes.md`     | Version-specific behavior changes                                                                                      |
| `node_modules/@pagesmith/core/skills/pagesmith-core-add-collection/SKILL.md`                 | Add a typed collection                                                                                                 |
| `node_modules/@pagesmith/core/skills/pagesmith-core-add-loader/SKILL.md`                     | Add a custom file-format loader                                                                                        |
| `node_modules/@pagesmith/core/skills/pagesmith-core-customize-markdown/SKILL.md`             | Add remark / rehype plugins or change Shiki themes                                                                     |
| `node_modules/@pagesmith/core/skills/pagesmith-core-write-validator/SKILL.md`                | Author project-specific content validators                                                                             |
| `node_modules/@pagesmith/core/llms.txt`, `node_modules/@pagesmith/core/llms-full.txt`        | Compact and full AI context indexes                                                                                    |

### Current repo integration

This repo uses `@pagesmith/core` + `@pagesmith/site` directly, not `@pagesmith/docs`.

Current integration points:

- `site.config.json5` is the site-level config. It is validated by `schemas/site.ts` and loaded through `lib/site-config.ts`.
- `content.config.ts` defines the `homePage`, `articleIndex`, `blogIndex`, `articles`, `blogs`, `rootMeta`, `articleMeta`, `blogMeta`, `homeData`, and `redirects` collections.
- `content.config.ts` also owns the repo-local Shiki aliases such as `redis`, `promql`, `dns`, and `asciidoc`.
- `vite.config.ts` keeps `pagesmithContent` on `@pagesmith/core/vite`.
- `src/entry-server.tsx` consumes `virtual:content/<collection>` payloads and maps them into `theme/layouts/*`.
- `theme/lib/content.ts` merges frontmatter with `content/meta.json5`, section `meta.json5`, `content/home.json5`, and `content/redirects.json5` to build listings, sidebars, breadcrumbs, series navigation, and featured content.
- `scripts/postbuild.ts` is now thin: it flattens `404/index.html` → `404.html` and feeds repo-derived routes/entries into the upstream `generateSitemap` / `generateFeed` serializers (from `@pagesmith/site/ssg-utils`). It no longer hand-rolls XML.
- `scripts/validate.ts` validates site config, diagramkit config, content collections, and cross-file references.
- `scripts/validate-pagesmith.ts` composes `@pagesmith/site` validators with the project cross-ref checks.
- `scripts/validate-dist.ts` now delegates the bulk of dist integrity to `validateBuildOutput` (`@pagesmith/site/build-validator`) with `checkSitemap` + `checkBundledAssets`, keeping only repo-specific document-shape and Pagefind-directory checks.

Lazy-image loading is now handled upstream in the `@pagesmith/core` markdown pipeline (`markdown.images.lazyLoading` default `true`, `eagerCount` default `1`: the LCP hero gets `fetchpriority="high"`, the rest get `loading="lazy" decoding="async"`). Do not re-implement lazy attributes in the repo.

Rules for this repo:

- Do not invent Pagesmith behavior. Read the installed docs first.
- Do not reintroduce `@pagesmith/docs`, `pagesmith.config.json5`, or the `pagesmith-docs` CLI.
- Keep collection and config validation in `schemas/frontmatter.ts`, `schemas/content-data.ts`, `schemas/site.ts`, and `schemas/diagramkit.ts`.
- Treat `ai-guidelines/markdown.md` as the local supplement, not a replacement for the upstream file.
- When editing content, update companion metadata (`content/articles/meta.json5`, `content/blogs/meta.json5`, `content/home.json5`, `content/redirects.json5`) in the same change when needed.

## @pagesmith/site

Read these files when the task touches Vite SSG, JSX rendering, runtime JS, CSS bundles, or the site shell. As with core, every guideline now lives inside the matching skill folder.

| File                                                                                     | Why it matters                                                    |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `node_modules/@pagesmith/site/REFERENCE.md`                                              | Full site toolkit reference and SSG / runtime contract            |
| `node_modules/@pagesmith/site/skills/pagesmith-site-setup/SKILL.md`                      | Bootstrap a custom (non-docs-preset) Pagesmith site               |
| `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/setup-site.md`      | Canonical bootstrap + retrofit workflow                           |
| `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/usage.md`           | Agent-facing usage patterns and package-split rules               |
| `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/site-guidelines.md` | Package responsibilities and non-negotiables                      |
| `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/recipes.md`         | Targeted recipes for Vite SSG and runtime adoption                |
| `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/migration.md`       | Upgrade workflow and compatibility checks                         |
| `node_modules/@pagesmith/site/skills/pagesmith-site-customize-theme/SKILL.md`            | Swap CSS bundles, runtime JS, layouts, or components              |
| `node_modules/@pagesmith/site/skills/pagesmith-site-use-preset/SKILL.md`                 | Consume a preset (e.g. `@pagesmith/docs`) — not used by this repo |
| `node_modules/@pagesmith/site/llms.txt`, `node_modules/@pagesmith/site/llms-full.txt`    | AI context indexes                                                |

The published validators this repo composes via `scripts/validate-pagesmith.ts`:

- `validateContent` (frontmatter schema, links, alt text, themed-image pairs)
- `validateBuildOutput` (`@pagesmith/site/build-validator`)
- `loadContentSchemaMap`, `formatContentValidationReport`
- `normalizeBasePath`, `withBasePath`

`validateBuildOutput` now covers what `scripts/validate-dist.ts` used to hand-roll. Notable options this repo uses: `requiredFiles` (file presence), `checkBundledAssets` (entry CSS/JS discovery + on-disk resolution), and `checkSitemap` (sitemap ↔ HTML cross-check). It also validates internal links/srcset, `assets/` content-hash naming (`requireAssetHash`, default on), and SVG well-formedness by default. Optional `requireThemeVariants` / `requireRasterModernFormats` are available but not enabled here. It does **not** check HTML document shape (DOCTYPE/`<html>`/`<head>`/`<body>`) — that stays repo-local in `validate-dist.ts`.

SSG serialization helpers now live in `@pagesmith/site/ssg-utils`: `generateSitemap(routes, config)` and `generateFeed(entries, config)`. `generateSitemap` canonicalizes the home route to the bare origin (no trailing slash) and emits no trailing newline; `generateFeed` filters to valid publish dates, sorts newest-first, and caps at `limit` (default 50). `postbuild.ts` supplies routes/entries; it does not build XML.

Structured data (JSON-LD) is emitted upstream by `SiteDocument` (schema.org `Article`/`BlogPosting`/`WebSite`, gated by `seo.jsonLd`, default `true`), with standalone builders `buildArticleStructuredData`, `buildWebsiteStructuredData`, and `serializeJsonLd` exported from the package root.

The `pagesmith-site validate` CLI also exists; this repo bypasses it because there is no `pagesmith.config.*` file (Vite is wired directly).

### Upstream skill stubs (`skills install`)

Both packages ship versioned-pointer skill stubs installable via their bundled CLIs:

```bash
npx pagesmith skills install      # pagesmith-core-* + pagesmith-site-* stubs
npx diagramkit skills install     # diagramkit-* stubs
# --check verifies stubs are up to date (CI drift guard, browser-free)
```

These write `.agents/skills/<name>/SKILL.md` pointer stubs plus `.claude/` and `.cursor/` mirrors, and are **distinct from the repo's own `prj-*` skills** (the installers never touch `prj-*`). The stubs point at the installed package body and auto-upgrade on reinstall.

> Caveat (current branch): while `@pagesmith/site` and `diagramkit` are consumed through `npm link`, the installers emit pointers that resolve **outside the repo** into the sibling working copies (`../pagesmith/...`, `../diagramkit/...`). Those would dangle in a fresh clone / CI. Defer committing the generated stubs (and wiring `--check` into CI) until the packages are published and installed normally under `node_modules/` — see the upgrade report's open questions.

### Current repo integration

- `vite.config.ts` wires `pagesmithSsg` and `sharedAssetsPlugin` from `@pagesmith/site/vite` while keeping `pagesmithContent` on `@pagesmith/core/vite`.
- `index.html` declares the Vite-managed `src/theme.css` and `src/client.ts` entry points used by the site plugin to discover built CSS and JS assets.
- `src/theme.css` imports the shipped standalone Pagesmith site CSS bundles. `public/site-theme.css` remains the repo-local visual override layer.
- `src/client.ts` loads `@pagesmith/site/runtime/standalone` and only keeps the repo-specific browser enhancements that the package does not yet ship.
- `theme/components/Html.tsx` consumes the SSG-provided `cssPath` and `jsPath` instead of hardcoding runtime asset filenames.

Rules for this repo:

- Keep collections, schemas, markdown rendering, and `pagesmithContent` on `@pagesmith/core`.
- Keep Vite SSG, the JSX runtime, shared CSS bundles, and shared browser runtime modules on `@pagesmith/site`.
- Do not replace the repo's Vite command set with `pagesmith-site` unless the project adopts a preset-defined workflow.

## diagramkit

Read these files when the task touches diagrams. `diagramkit` keeps the top-level `ai-guidelines/` folder and adds full per-engine skills under `skills/`.

| File                                                            | Why it matters                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `node_modules/diagramkit/REFERENCE.md`                          | Version-pinned CLI / API contract — read before any `diagramkit` command |
| `node_modules/diagramkit/ai-guidelines/usage.md`                | Agent setup prompts and CLI quick reference                              |
| `node_modules/diagramkit/ai-guidelines/diagram-authoring.md`    | Per-engine authoring details (palettes, theming, embedding)              |
| `node_modules/diagramkit/llms.txt`                              | Compact CLI reference                                                    |
| `node_modules/diagramkit/llms-full.txt`                         | Full CLI + API reference (matches `diagramkit --agent-help`)             |
| `node_modules/diagramkit/skills/diagramkit-setup/SKILL.md`      | Bootstrap diagramkit in a repo                                           |
| `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md`       | Engine routing for new diagram requests                                  |
| `node_modules/diagramkit/skills/diagramkit-mermaid/SKILL.md`    | Mermaid authoring + Review Mode                                          |
| `node_modules/diagramkit/skills/diagramkit-excalidraw/SKILL.md` | Excalidraw authoring + Review Mode                                       |
| `node_modules/diagramkit/skills/diagramkit-draw-io/SKILL.md`    | Draw.io authoring + Review Mode                                          |
| `node_modules/diagramkit/skills/diagramkit-graphviz/SKILL.md`   | Graphviz authoring + Review Mode                                         |
| `node_modules/diagramkit/skills/diagramkit-review/SKILL.md`     | Cross-engine validation + WCAG 2.2 AA contrast audit                     |

### Current repo integration

- `diagramkit.config.json5` is validated by `schemas/diagramkit.ts` and loaded via `lib/diagramkit-config.ts`.
- `scripts/diagrams.ts` validates the repo-local config and then delegates to the official `diagramkit render` CLI. With no explicit target it renders `. --scope-dir diagrams` (whole repo, restricted to `diagrams/` folders); an explicit target (e.g. the staged single-file hook) passes straight through. `--watch` / `--force` pass through in both modes.
- `scripts/validate-diagrams.ts` is a thin wrapper over `diagramkit validate . --recursive --scope-dir diagrams --fail-on <codes>`. `--scope-dir diagrams` replaces the old hand-rolled per-folder loop and skips hand-authored `assets/` SVGs. `--json` passes through (`validate:diagrams:json`).
- Fatal-code policy lives in `scripts/validate-diagrams.ts`: the ecosystem embed-safety set `CONTAINS_FOREIGN_OBJECT,CONTAINS_SCRIPT,EXTERNAL_RESOURCE` is always fatal; `LOW_CONTRAST_TEXT` is fatal behind the `FAIL_ON_LOW_CONTRAST` constant, now **on** (merge-blocking) because a fresh `validate:diagrams` returns 0. The audit drove it 84/72 → 24/16 → 8/6 → 0/0: the systematic sequence/xychart pairs and gantt/timeline black axis ticks were fixed upstream in the linked diagramkit (`RENDER_PIPELINE_VERSION` 2→3→4 — injected sequence/xychart theme colors, no-darken glyph fills, and near-black glyph-fill _lightening_); the tail was fixed per-source (dropbox mid-tone `classDef`s, slack `style`→`classDef`, gantt/timeline `themeVariables`, plus `critBkgColor #B43A3A` on all gantts so white in-bar text on crit bars is a real 5.82:1); and the final 8 were diagramkit _scanner_ background-resolution false-positives (gantt off-bar/flat-sibling, timeline sibling-subtree section blocks, ER multi-ancestor `.edgeLabel .label` CSS) now fixed in the scanner itself (`src/color/wcag.ts`, validation-only). See `ai-guidelines/diagrams.md` and the constant's comment in `scripts/validate-diagrams.ts`.
- Repo defaults are `sameFolder: true`, `defaultFormats: ["svg"]`, `defaultTheme: "both"`, and manifest-backed incremental rendering. Render manifests (`**/diagrams/manifest.json`) are now committed, so fresh clones with unchanged sources skip re-rendering (no Chromium needed).
- Source files live in sibling `diagrams/` folders next to the content entry, and rendered `-light.svg` / `-dark.svg` files are written into that same folder.

Primary commands:

```bash
npm run diagrams                 # render changed sources under diagrams/ folders (. --scope-dir diagrams)
npm run diagrams:force           # ignore manifest cache
npm run diagrams:watch           # watch mode
npm run diagrams:doctor          # diagramkit doctor (env + config sanity)
npm run validate:diagrams        # validate . --recursive --scope-dir diagrams --fail-on <policy>
npm run validate:diagrams:json   # JSON form for CI / programmatic post-processing
```

Rules:

- Keep source files in `./diagrams/` next to the content entry.
- Prefer SVG unless the destination explicitly needs raster output.
- Let `diagramkit` generate the themed outputs.
- Do not hand-author final SVGs without a source diagram.
- If you change repo-wide diagram behavior, update both `diagramkit.config.json5` and `schemas/diagramkit.ts`.

## When refreshing AI docs

When updating repo guidance or skill wrappers (this is exactly what `prj-sync` does):

1. Read the upstream `@pagesmith/core` and `@pagesmith/site` files listed above.
2. Read the diagramkit references listed above.
3. Read the local integration surfaces that define the current behavior:
   - `site.config.json5`
   - `vite.config.ts`
   - `index.html`
   - `src/theme.css`
   - `src/client.ts`
   - `diagramkit.config.json5`
   - `content.config.ts`
   - `schemas/`
   - `src/entry-server.tsx`
   - `theme/lib/content.ts`
   - `scripts/validate.ts`
   - `scripts/validate-pagesmith.ts`
   - `scripts/validate-dist.ts`
   - `scripts/postbuild.ts`
4. Update `ai-guidelines/` first.
5. Then update `AGENTS.md`, `CLAUDE.md`, `.claude/skills/`, `.cursor/skills/`, `.agents/skills/`, and `.cursor/rules/`.
6. Keep wrapper files thin and point them back into `.agents/skills/<name>/SKILL.md`.
7. Preserve repo-specific editorial rules instead of copying upstream text blindly.
