# Package Reference

Canonical package reference map for the tooling that powers `sujeet.pro`.

Use the installed package docs as the source of truth. This local file tells repo-local skills what to read and highlights the current integration points in this repo.

<!-- Last synced: 2026-04-20 -->
<!-- @pagesmith/core: node_modules/@pagesmith/core (^0.x — read REFERENCE.md for the live version) -->
<!-- @pagesmith/site: node_modules/@pagesmith/site (^0.9.8) -->
<!-- diagramkit: node_modules/diagramkit (^0.3.2) -->

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
- `scripts/postbuild.ts` writes repo-specific post-build artifacts such as `sitemap.xml` and `rss.xml`.
- `scripts/validate.ts` validates site config, diagramkit config, content collections, and cross-file references.
- `scripts/validate-pagesmith.ts` composes `@pagesmith/site` validators with the project cross-ref checks.

Rules for this repo:

- Do not invent Pagesmith behavior. Read the installed docs first.
- Do not reintroduce `@pagesmith/docs`, `pagesmith.config.json5`, or the `pagesmith-docs` CLI.
- Keep collection and config validation in `schemas/frontmatter.ts`, `schemas/content-data.ts`, `schemas/site.ts`, and `schemas/diagramkit.ts`.
- Treat `ai-guidelines/markdown.md` as the local supplement, not a replacement for the upstream file.
- Treat project content as legacy unless the user explicitly asks to work on it.
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

The `pagesmith-site validate` CLI also exists; this repo bypasses it because there is no `pagesmith.config.*` file (Vite is wired directly).

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
- `scripts/diagrams.ts` validates the repo-local config and then delegates to the official `diagramkit render` CLI so the repo keeps the full diagramkit flag surface.
- Repo defaults are `sameFolder: true`, `defaultFormats: ["svg"]`, `defaultTheme: "both"`, and manifest-backed incremental rendering.
- Source files live in sibling `diagrams/` folders next to the content entry, and rendered `-light.svg` / `-dark.svg` files are written into that same folder.

Primary commands:

```bash
npm run diagrams                 # render only changed sources
npm run diagrams:force           # ignore manifest cache
npm run diagrams:watch           # watch mode
npm run diagrams:doctor          # diagramkit doctor (env + config sanity)
npm run validate:diagrams        # diagramkit validate ./content --recursive
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
