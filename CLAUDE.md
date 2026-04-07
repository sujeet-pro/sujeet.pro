# sujeet.pro

Personal engineering blog and portfolio, powered by `@pagesmith/core` and `diagramkit`.

## Quick Commands

```bash
npm run build              # Render diagrams + build site
npm run dev                # Dev server with hot reload (port 3000)
npm run preview            # Serve production build (port 4000)
vp check                   # Format + lint + type-check (Oxfmt + Oxlint + tsgo)
vp check --fix             # Auto-fix formatting and lint issues
vp test                    # Unit tests (Vitest)
npm run test:e2e           # E2E tests (Playwright)
npm run diagrams           # Render diagrams using diagramkit
npm run diagrams:force     # Force re-render all diagrams
npm run validate           # Check all content frontmatter
npm run check-orphans      # Find unreferenced assets
```

## Content Structure

```
content/
  site.json5               # Site-wide config (nav, social, analytics)
  redirects.json5          # Vanity URLs + old→new content redirects
  README.md                # Homepage (layout: Home)
  articles/
    meta.json5             # Series definitions, layout config
    README.md              # Articles listing page (layout: Listing)
    <article-slug>/        # Flat! No category/topic nesting
      README.md            # Article content
      diagrams/            # .mermaid, .excalidraw, .drawio, .dot source files
      assets/              # Images
  blogs/
    meta.json5
    README.md
    <blog-slug>/README.md
  projects/
    meta.json5
    <project-slug>/README.md
```

All articles live flat under `content/articles/`. Related articles are grouped by **series** defined in `meta.json5`.

## Skills

### /sp-doc — Content Management

Unified skill for creating, reviewing, and updating content. Handles articles, blogs, and projects with deep research, citations, and diagram lifecycle management.

```
/sp-doc <path-or-topic> [--mode create|review|update] [--type article|blog|project]
```

- **Create**: Deep research → outline → write → diagrams → validate
- **Review**: Structure, depth, accuracy, citations, diagrams checklist
- **Update**: Edit content + add/update/delete diagrams automatically

### /sp-sync — Sync Package Guidelines

Updates AI guidelines when `@pagesmith/core` or `diagramkit` versions change.

```
/sp-sync                   # Sync all guidelines
/sp-sync --check           # Check if guidelines are outdated
```

## Guidelines

All content authoring guidelines live in `ai-guidelines/`:

| File                                 | Purpose                                             |
| ------------------------------------ | --------------------------------------------------- |
| `ai-guidelines/content-structure.md` | Content types, frontmatter, layout rules, citations |
| `ai-guidelines/markdown.md`          | Markdown features, code blocks, syntax reference    |
| `ai-guidelines/diagrams.md`          | Diagram authoring with diagramkit                   |
| `ai-guidelines/packages.md`          | @pagesmith/core and diagramkit API reference        |

**Read these before creating or editing content.**

## Frontmatter

Required for all content (articles, blogs, projects):

```yaml
---
title: "Article Title"
description: "One-line description for meta tags and listing cards"
publishedDate: 2026-03-15
lastUpdatedOn: 2026-03-20
tags: [distributed-systems, cap-theorem]
draft: true # Optional
---
```

Do NOT set `layout` or `category` — resolved from `meta.json5`.

Title and description are NOT rendered on the page — they are for SEO, RSS, and listing cards only.

## Series

Defined in `content/articles/meta.json5`. Each series has `slug`, `displayName`, `shortName`, `description`, and ordered `articles` list. Articles in a series get prev/next navigation.

## Diagrams

Source files in `<article>/diagrams/`. Rendered by `diagramkit` to light/dark SVG pairs.

**Supported:** `.mermaid`, `.excalidraw`, `.drawio`, `.dot`, `.gv`

Reference in markdown:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./diagrams/name-dark.svg" />
  <img src="./diagrams/name-light.svg" alt="Description" />
</picture>
```

**Never generate SVG directly** — write source files and run `npm run diagrams`.

See `ai-guidelines/diagrams.md` for full guidelines.

## Architecture

**Packages:**

- `@pagesmith/core` — Content layer, markdown pipeline, custom JSX runtime, CSS bundling
- `diagramkit` — Diagram rendering (Mermaid, Excalidraw, Draw.io, Graphviz → SVG)

**App-specific:**

- `schemas/` — Zod schemas (config, layout-props, page-data, meta)
- `lib/` — Build pipeline modules (config, collections, series, tags, assets, renderer)
- `scripts/` — Build scripts run via `tsx` (thin wrappers around `lib/`)
- `layouts/` — TSX layout components (`@pagesmith/core` JSX runtime)
- `runtime/` — Browser JS (theme, sidebar, TOC, copy code)
- `styles/` — CSS source
- `pagesmith.config.ts` — Content layer config (collections, markdown options)
- `vite.config.ts` — Toolchain config (lint, format, test, staged hooks)

## Toolchain

| Tool                                     | Purpose                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| [Vite+](https://viteplus.dev/)           | `vp check` (Oxlint + Oxfmt + tsgo), `vp test` (Vitest), `vp staged` (commit hooks) |
| [Node.js 24](https://nodejs.org/)        | Runtime (LTS) — managed by Vite+                                                   |
| [tsx](https://tsx.is/)                   | TypeScript script runner                                                           |
| [esbuild](https://esbuild.github.io/)    | Runtime JS bundling                                                                |
| [@pagesmith/core](https://pagesmith.dev) | Content layer, markdown, JSX runtime, CSS                                          |
| [diagramkit](https://diagramkit.dev)     | Diagram rendering CLI & library                                                    |
| [Playwright](https://playwright.dev)     | E2E testing                                                                        |

## Responsive Layout

- **Desktop (≥140ch):** 3 columns — left sidebar (series nav), content, right sidebar (TOC)
- **Tablet (110ch–140ch):** 2 columns — content + TOC. Left sidebar → hamburger overlay.
- **Mobile (<110ch):** 1 column. TOC → collapsible accordion above content.
- Home/listing/tag pages: no left sidebar

## Runtime JavaScript (`runtime/`)

- `theme.ts` — Theme switcher (auto/light/dark), localStorage, `data-theme`
- `sidebar.ts` — Mobile sidebar toggle, overlay, ESC key, viewport resize
- `toc-highlight.ts` — TOC section highlight sync with scroll
- `copy-code.ts` — Copy-to-clipboard for code blocks
- `main.ts` — Entry point

## Testing

- Unit: `vp test` (Vitest, `tests/unit/`)
- E2E: `npm run test:e2e` (Playwright, `tests/e2e/`)
- E2E covers: navigation, sidebar, TOC, responsive layout, theme switching

## Dist Output

```
dist/
  assets/           # CSS, JS, fonts, images, diagrams (all content-hashed)
  favicons/         # Favicon files (unhashed)
  robots.txt
  manifest.json
  browserconfig.xml
  sitemap.xml
  rss.xml
  agents.md
  index.html
  articles/<slug>/index.html
```

## Package References

- @pagesmith/core API: `node_modules/@pagesmith/core/REFERENCE.md`
- @pagesmith/core usage: `node_modules/@pagesmith/core/docs/agents/usage.md`
- Markdown guidelines: `../pagesmith/ai-guidelines/markdown-guidelines.md`
- diagramkit quick ref: `node_modules/diagramkit/llms.txt`
- diagramkit full ref: `node_modules/diagramkit/llms-full.txt`
