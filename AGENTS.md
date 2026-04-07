# sujeet.pro — Agent Guide

Personal engineering blog and portfolio at sujeet.pro. Built with @pagesmith/core (content layer + JSX) and diagramkit (diagram rendering).

## Quick Start

```bash
vp install
npm run dev            # Dev server on port 3000
npm run build          # Full production build
vp check               # Format + lint + type-check
vp test                # Unit tests
npm run test:e2e       # E2E tests
```

## Guidelines

All content authoring guidelines are in `ai-guidelines/`:

- `ai-guidelines/content-structure.md` — Content types, frontmatter per type, layout rules, citations
- `ai-guidelines/markdown.md` — Markdown features, code blocks, syntax
- `ai-guidelines/diagrams.md` — Diagram creation with diagramkit
- `ai-guidelines/packages.md` — @pagesmith/core and diagramkit API reference

**Read these before creating or editing content.**

## Architecture

- **Runtime**: Node.js 24 (LTS), managed by Vite+
- **Content**: Markdown in `content/` with YAML frontmatter
- **Engine**: `@pagesmith/core` — content collections, markdown pipeline, custom JSX runtime
- **Diagrams**: `diagramkit` — Mermaid/Excalidraw/Draw.io/Graphviz → SVG (light + dark)
- **Layouts**: TSX in `layouts/` — server-rendered HTML via JSX runtime (no React)
- **Schemas**: Zod in `schemas/` for config, frontmatter, layout props
- **Build**: Custom pipeline in `lib/` + `scripts/`, executed via `tsx`
- **Bundling**: `esbuild` for browser runtime JS
- **Toolchain**: Vite+ for `vp check` (Oxlint + Oxfmt), `vp test` (Vitest), `vp staged` (hooks)
- **CI/CD**: GitHub Pages via `.github/workflows/gh-pages.yml`

## Content Rules

- Articles: `content/articles/<slug>/README.md` — deep-dive, citations required
- Blogs: `content/blogs/<slug>/README.md` — shorter, personal
- Projects: `content/projects/<slug>/README.md` — technical descriptions
- All content needs frontmatter: title, description, publishedDate, lastUpdatedOn, tags
- Series defined in `content/articles/meta.json5`
- Do NOT set `layout` in frontmatter — resolved from `meta.json5`

## Diagrams

Write source files (`.mermaid`, `.excalidraw`, `.drawio`, `.dot`) in `<slug>/diagrams/`. Never generate SVG directly. Run `npm run diagrams` to render.

Reference with `<picture>` for dark mode:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./diagrams/name-dark.svg" />
  <img src="./diagrams/name-light.svg" alt="Description" />
</picture>
```

## Responsive Layout

- ≥ 140ch: 3 columns (left sidebar + content + right TOC)
- 110ch–140ch: 2 columns (content + TOC), left sidebar → hamburger overlay
- < 110ch: 1 column, TOC → accordion, left sidebar → hamburger overlay
- Home/listing/tag pages: no left sidebar

## Markdown

Full reference: `ai-guidelines/markdown.md`

Key features: GFM, GitHub Alerts, Math, Expressive Code blocks (title, showLineNumbers, mark, ins, del, collapse, wrap, frame), smart typography.

## Package References

- @pagesmith/core API: `node_modules/@pagesmith/core/REFERENCE.md`
- @pagesmith/core usage: `node_modules/@pagesmith/core/docs/agents/usage.md`
- diagramkit CLI/API: `node_modules/diagramkit/llms.txt`
- diagramkit full: `node_modules/diagramkit/llms-full.txt`
