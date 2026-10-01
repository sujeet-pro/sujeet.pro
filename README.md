# sujeet.pro

Personal engineering blog and portfolio. Built with the `profile` mode of [@pagesmith/presets](https://github.com/sujeet-pro/pagesmith), [@pagesmith/site](https://github.com/sujeet-pro/pagesmith) for the site shell/runtime, and [diagramkit](https://github.com/sujeet-pro/diagramkit) for diagram generation.

The normal application surface is content, data, assets, diagrams, and `pagesmith.config.json5`; it does not need an app-owned route dispatcher, content index, or theme.

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
npm run dev            # Build and serve the profile preset on port 3000
npm run build          # Render diagrams and build the profile preset
npm run preview        # Serve built output on port 4000
npm run validate       # Validate the profile index and cross-file references
npm run check-orphans  # Find unreferenced assets in content/
vp check               # Format + lint + type-check
vp check --fix         # Auto-fix formatting and lint issues
vp test                # Unit tests
npm run test:e2e       # Playwright end-to-end tests
```

## Core Config Surfaces

- `pagesmith.config.json5` — profile preset, paths, origin, base path, theme, search, analytics, and ports
- `diagramkit.config.json5` — diagram rendering defaults and manifest behavior
- `schemas/` — Zod schemas for the compatibility config and diagramkit config
- `content/meta.json5` — top-level nav and footer chrome
- `content/articles/meta.json5` — article listing behavior, ordering, and series definitions
- `content/blogs/meta.json5` — blog listing behavior and ordering
- `content/home.json5` — homepage hero and featured content
- `content/redirects.json5` — vanity URLs and legacy path redirects

## Content Structure

```text
pagesmith.config.json5
diagramkit.config.json5
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
src/
  theme.css
scripts/
  diagrams.ts
  validate.ts
```

Article and blog entries use folder-based markdown. Companion metadata lives in the JSON5 files above, and content changes should update those companions when needed.

## Build And Render Flow

1. `scripts/diagrams.ts` renders changed Diagramkit sources and writes themed assets beside their content.
2. `pagesmith-presets profile build` resolves `pagesmith.config.json5`, loads the content/data roots once, builds the cached profile index, and renders static routes.
3. The profile preset emits the document shell, CSS, standalone runtime, Pagefind index, sitemap, RSS/Atom feeds, redirects, and GitHub Pages-compatible `404.html` output.
4. `scripts/validate.ts` validates the profile model, Diagramkit config, and cross-file integrity.

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

| Tool                                                          | Purpose                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| [Vite+](https://viteplus.dev/)                                | `vp check`, `vp test`, `vp staged`, dependency/runtime management     |
| [Node.js 24](https://nodejs.org/)                             | Runtime                                                               |
| [tsx](https://tsx.is/)                                        | TypeScript script runner                                              |
| [@pagesmith/presets](https://github.com/sujeet-pro/pagesmith) | Profile preset, cached content index, routes, layouts, feeds, and CLI |
| [@pagesmith/core](https://github.com/sujeet-pro/pagesmith)    | Content layer, markdown pipeline, schemas, and loaders                |
| [@pagesmith/site](https://github.com/sujeet-pro/pagesmith)    | JSX runtime, site CSS/runtime bundles, and Vite SSG helpers           |
| [diagramkit](https://github.com/sujeet-pro/diagramkit)        | Diagram rendering for Mermaid, Excalidraw, Draw.io, and Graphviz      |
| [Playwright](https://playwright.dev/)                         | Browser automation for tests and diagram rendering                    |

## CI/CD

Lint, validate, build, and deploy to GitHub Pages run via `.github/workflows/ci.yml`.

## AI Agent Support

This repo provides project guidance and local skills for Junie:

- `ai-guidelines/README.md` — canonical entrypoint for content and docs work
- `ai-guidelines/` — shared content authoring guidelines and workflows
- `AGENTS.md` — canonical project context
- `.junie/` — Junie project configuration and skills
