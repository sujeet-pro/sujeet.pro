# Package Reference

Canonical package reference map for the tooling that powers `sujeet.pro`.

Use the installed package docs as the source of truth. This local file tells repo-local skills what to read and highlights the current integration points in this repo.

<!-- Last synced: 2026-04-13 -->
<!-- @pagesmith/core: node_modules/@pagesmith/core -->
<!-- @pagesmith/site: node_modules/@pagesmith/site -->
<!-- diagramkit: node_modules/diagramkit -->

## @pagesmith/core

Read these files when the task touches markdown behavior, frontmatter, collections, rendering, or Pagesmith-specific constraints:

| File                                                                | Why it matters                                        |
| ------------------------------------------------------------------- | ----------------------------------------------------- |
| `node_modules/@pagesmith/core/REFERENCE.md`                         | Full API reference and current runtime behavior       |
| `node_modules/@pagesmith/core/ai-guidelines/usage.md`               | Agent-facing integration guidance and prompt patterns |
| `node_modules/@pagesmith/core/ai-guidelines/core-guidelines.md`     | Setup, integration, and project-doc pointers          |
| `node_modules/@pagesmith/core/ai-guidelines/markdown-guidelines.md` | Canonical markdown feature reference                  |
| `node_modules/@pagesmith/core/ai-guidelines/recipes.md`             | Task recipes for common Pagesmith work                |
| `node_modules/@pagesmith/core/ai-guidelines/errors.md`              | Error catalog for validation and pipeline issues      |
| `node_modules/@pagesmith/core/ai-guidelines/migration.md`           | Upgrade workflow and compatibility checks             |
| `node_modules/@pagesmith/core/ai-guidelines/changelog-notes.md`     | Version-specific behavior changes                     |

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

Rules for this repo:

- Do not invent Pagesmith behavior. Read the installed docs first.
- Do not reintroduce `@pagesmith/docs`, `pagesmith.config.json5`, or the `pagesmith` CLI.
- Keep collection and config validation in `schemas/frontmatter.ts`, `schemas/content-data.ts`, `schemas/site.ts`, and `schemas/diagramkit.ts`.
- Treat `ai-guidelines/markdown.md` as the local supplement, not a replacement for the upstream file.
- Treat project content as legacy unless the user explicitly asks to work on it.
- When editing content, update companion metadata (`content/articles/meta.json5`, `content/blogs/meta.json5`, `content/home.json5`, `content/redirects.json5`) in the same change when needed.

## @pagesmith/site

Read these files when the task touches Vite SSG, JSX rendering, runtime JS, CSS bundles, or the site shell:

| File                                                            | Why it matters                                       |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| `node_modules/@pagesmith/site/REFERENCE.md`                     | Full site toolkit reference and SSG/runtime contract |
| `node_modules/@pagesmith/site/ai-guidelines/setup-site.md`      | Canonical bootstrap and retrofit workflow            |
| `node_modules/@pagesmith/site/ai-guidelines/usage.md`           | Agent-facing usage patterns and package split rules  |
| `node_modules/@pagesmith/site/ai-guidelines/site-guidelines.md` | Package responsibilities and non-negotiable rules    |
| `node_modules/@pagesmith/site/ai-guidelines/recipes.md`         | Targeted recipes for Vite SSG and runtime adoption   |
| `node_modules/@pagesmith/site/ai-guidelines/migration.md`       | Upgrade workflow and compatibility checks            |

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

Read these files when the task touches diagrams:

| File                                                         | Why it matters                     |
| ------------------------------------------------------------ | ---------------------------------- |
| `node_modules/diagramkit/ai-guidelines/usage.md`             | Primary entry point                |
| `node_modules/diagramkit/ai-guidelines/diagram-authoring.md` | Diagram authoring guidance         |
| `node_modules/diagramkit/ai-guidelines/llms.txt`             | Quick command and option reference |
| `node_modules/diagramkit/ai-guidelines/llms-full.txt`        | Full CLI and authoring reference   |

### Current repo integration

- `diagramkit.config.json5` is validated by `schemas/diagramkit.ts` and loaded via `lib/diagramkit-config.ts`.
- `scripts/diagrams.ts` validates the repo-local config and then delegates to the official `diagramkit render` CLI so the repo keeps the full diagramkit flag surface.
- Repo defaults are `sameFolder: true`, `defaultFormats: ["svg"]`, `defaultTheme: "both"`, and manifest-backed incremental rendering.
- Source files live in sibling `diagrams/` folders next to the content entry, and rendered `-light.svg` / `-dark.svg` files are written into that same folder.

Primary commands:

```bash
npm run diagrams
npm run diagrams:force
npm run diagrams:watch
```

Rules:

- Keep source files in `./diagrams/` next to the content entry.
- Prefer SVG unless the destination explicitly needs raster output.
- Let `diagramkit` generate the themed outputs.
- Do not hand-author final SVGs without a source diagram.
- If you change repo-wide diagram behavior, update both `diagramkit.config.json5` and `schemas/diagramkit.ts`.

## When refreshing AI docs

When updating repo guidance or skill wrappers:

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
   - `scripts/postbuild.ts`
4. Update `ai-guidelines/` first.
5. Then update `AGENTS.md`, `CLAUDE.md`, `.claude/skills/`, `.cursor/skills/`, `.agents/`, and `.cursor/rules/`.
6. Keep wrapper files thin and point them back into `ai-guidelines/`.
7. Preserve repo-specific editorial rules instead of copying upstream text blindly.
