# sujeet.pro

Personal engineering blog and portfolio. Built with [@pagesmith/core](https://github.com/nicholasgriffintn/pagesmith) for the content layer, [@pagesmith/site](https://github.com/nicholasgriffintn/pagesmith) for the site shell and Vite SSG/runtime, and [diagramkit](https://github.com/nicholasgriffintn/diagramkit) for diagram generation.

This repo uses `@pagesmith/core` + `@pagesmith/site` directly. It should not depend on `@pagesmith/docs`.

## Prerequisites

- [Node.js 24](https://nodejs.org/) (LTS)
- [Vite+](https://viteplus.dev/) for `vp` commands
- [Playwright Chromium](https://playwright.dev/) for E2E tests and diagram rendering

## Setup

```bash
git clone <repo-url>
cd sujeet.pro
vp install
vp config
npx playwright install chromium
```

## Daily DX

```bash
npm run dev            # Vite dev server on port 3000
npm run build          # Render diagrams, run Vite SSG, and postbuild assets
npm run preview        # Preview built output on port 4000
npm run validate       # Validate config, collections, and cross-file references
npm run check-orphans  # Find unreferenced assets in content/
vp check               # Format + lint + type-check
vp check --fix         # Auto-fix formatting and lint issues
vp test                # Unit tests
npm run test:e2e       # Playwright end-to-end tests
```

## Core Config Surfaces

- `site.config.json5` — site-level config for origin, base path, theme, search, analytics, edit links, and ports
- `diagramkit.config.json5` — diagram rendering defaults and manifest behavior
- `content.config.ts` — `@pagesmith/core` collections plus markdown configuration
- `schemas/` — Zod schemas for site config, frontmatter, content metadata, and diagramkit config
- `content/meta.json5` — top-level nav and footer chrome
- `content/articles/meta.json5` — article listing behavior, ordering, and series definitions
- `content/blogs/meta.json5` — blog listing behavior and ordering
- `content/home.json5` — homepage hero and featured content
- `content/redirects.json5` — vanity URLs and legacy path redirects

## Content Structure

```text
site.config.json5
diagramkit.config.json5
content.config.ts
content/
  README.md
  meta.json5
  home.json5
  redirects.json5
  articles/
    README.md
    meta.json5
    <slug>/
      README.md
      diagrams/
      assets/
  blogs/
    README.md
    meta.json5
    <slug>/
      README.md
      diagrams/
      assets/
  projects/            # Legacy content, do not expand unless explicitly asked
theme/
  components/
  layouts/
  lib/content.ts
src/
  client.ts
  entry-server.tsx
  theme.css
scripts/
  diagrams.ts
  postbuild.ts
  validate.ts
```

Article and blog entries use folder-based markdown. Companion metadata lives in the JSON5 files above, and content changes should update those companions when needed.

## Build And Render Flow

1. `content.config.ts` defines the Pagesmith collections and markdown behavior.
2. `vite.config.ts` keeps `pagesmithContent(...)` on `@pagesmith/core/vite` and wires `sharedAssetsPlugin()` plus `...pagesmithSsg(...)` from `@pagesmith/site/vite`.
3. `index.html`, `src/theme.css`, and `src/client.ts` define the Vite-managed CSS and browser runtime entry points for the site layer.
4. `src/entry-server.tsx` imports `virtual:content/<collection>` payloads and renders them through `theme/layouts/*`.
5. `theme/lib/content.ts` combines entry frontmatter with section metadata, homepage data, and redirects to build navigation, listings, breadcrumbs, prev/next links, and featured content.
6. `scripts/postbuild.ts` writes `sitemap.xml` and `rss.xml` after the Vite + Pagesmith site build.
7. `scripts/validate.ts` validates site config, diagramkit config, collections, and cross-file integrity.

## Diagrams

Write `.mermaid`, `.excalidraw`, `.drawio`, `.dot`, or `.gv` source files in the entry's `diagrams/` folder, then render:

```bash
npm run diagrams
npm run diagrams:force
npm run diagrams:watch
```

This repo uses `diagramkit` with `sameFolder: true`, so source files and generated `-light.svg` / `-dark.svg` outputs live side by side.

See [ai-guidelines/diagrams.md](ai-guidelines/diagrams.md) for authoring details.

## Content Rules

- Articles and blogs require frontmatter with `title`, `description`, `publishedDate`, `lastUpdatedOn`, and `tags`
- Do not set `layout` or `category` in article or blog frontmatter
- The visible page title comes from the markdown `# H1`, not the frontmatter `title`
- If a slug, series membership, homepage feature, or canonical path changes, update the coordinating `meta.json5`, `home.json5`, and `redirects.json5` files in the same change

See [ai-guidelines/content-structure.md](ai-guidelines/content-structure.md) for the full content model.

## Toolchain

| Tool                                                              | Purpose                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Vite+](https://viteplus.dev/)                                    | `vp check`, `vp test`, `vp staged`, dependency/runtime management         |
| [Node.js 24](https://nodejs.org/)                                 | Runtime                                                                   |
| [tsx](https://tsx.is/)                                            | TypeScript script runner                                                  |
| [@pagesmith/core](https://github.com/nicholasgriffintn/pagesmith) | Content layer, markdown pipeline, schemas/loaders, and `pagesmithContent` |
| [@pagesmith/site](https://github.com/nicholasgriffintn/pagesmith) | JSX runtime, site CSS/runtime bundles, and Vite SSG helpers               |
| [diagramkit](https://github.com/nicholasgriffintn/diagramkit)     | Diagram rendering for Mermaid, Excalidraw, Draw.io, and Graphviz          |
| [Playwright](https://playwright.dev/)                             | Browser automation for tests and diagram rendering                        |

## CI/CD

Deploys to GitHub Pages via `.github/workflows/gh-pages.yml`.

## AI Agent Support

This repo provides AI guidance and project-local skills for Claude Code, Cursor, and other agents:

- `ai-guidelines/README.md` — canonical entrypoint for content and docs work
- `ai-guidelines/` — shared content authoring guidelines and workflows
- `CLAUDE.md` — Claude Code project context
- `AGENTS.md` — Cursor / Codex project context
- `.claude/skills/` — Claude Code skills
- `.cursor/skills/` — Cursor project skills
- `.cursor/rules/` — Cursor rules that point back to `ai-guidelines/`
- `.agents/` — neutral markdown entrypoints for other agent runtimes
