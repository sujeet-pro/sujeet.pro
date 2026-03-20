# Pagesmith

Custom Bun-based static site generator for sujeet.pro.

## Quick Commands

```bash
bun run build              # Render diagrams + build site
bun run dev                # Dev server with hot reload (port 3000)
bun run diagrams           # Render only changed diagrams (manifest cached)
bun run diagrams --force   # Force re-render all diagrams
bun run validate           # Check all content frontmatter
bun run check-orphans      # Find unreferenced assets
```

## Content Structure

```
content/
  site.json5               # Site-wide config (nav, social, build settings)
  redirects.json5           # Vanity URLs + old→new content redirects
  README.md                 # Homepage (layout: Home)
  articles/
    meta.json5              # Series definitions, layout config
    README.md               # Articles listing page (layout: Listing)
    <article-slug>/         # Flat! No category/topic nesting
      README.md             # Article content
      diagrams/             # .mermaid and .excalidraw source files
      assets/               # Images
  blogs/
    meta.json5
    README.md
    <blog-slug>/README.md
  projects/
    meta.json5
    <project-slug>/README.md
```

All articles live flat under `content/articles/`. Related articles are grouped by **series** defined in `meta.json5`. Series is purely a logical grouping — no filesystem nesting.

## Frontmatter Schema

Required for all content items (articles, blogs, projects):

```yaml
---
title: "Article Title"
description: "One-line description for meta tags and listing cards"
lastUpdatedOn: 2026-03-20
publishedDate: 2026-03-15
tags: [distributed-systems, cap-theorem]    # Required, at least one
draft: true                                  # Optional
---
```

Do NOT set `layout` or `category` in frontmatter — layouts are resolved from `meta.json5`.

**Title and description are NOT rendered on the content page.** They are only used for SEO meta tags, RSS feed, and listing cards. The article's own markdown content provides its own `<h1>` title. Do not duplicate the title or description in the layout — the markdown handles it.

## Series

A **series** is a named group of related articles that belong together. Defined in `content/articles/meta.json5`. Each series has: `slug`, `displayName`, `shortName`, `description`, and an ordered list of `articles` (by slug). Articles within a series get prev/next navigation.

## Diagrams

Diagrams live in `<article>/diagrams/` as `.mermaid` or `.excalidraw` source files. The build renders them to `<name>.light.svg` and `<name>.dark.svg`. Reference in markdown:

```html
<figure>
<img class="only-light" src="./diagrams/name.light.svg" alt="..." />
<img class="only-dark" src="./diagrams/name.dark.svg" alt="..." />
<figcaption>...</figcaption>
</figure>
```

**When generating content, do NOT generate SVG directly — write `.mermaid` or `.excalidraw` source files and run `bun run diagrams`.**

Diagram rendering uses manifest-based caching (`diagrams/manifest.json`, gitignored). Only changed files are re-rendered.

## Build Pipeline

1. Load config from `content/site.json5` + `meta.json5` files (JSON5)
2. Collect all `README.md` files, process markdown (unified + remark + rehype + shiki)
3. Resolve layouts from `meta.json5` (Listing for type pages, Article/Blog/Project for items)
4. Build series data and tag index
5. Render layouts (custom JSX runtime, no React)
6. Generate tag pages, redirect pages, vanity URL pages
7. Copy assets, bundle CSS, hash all assets, generate sitemap

## Adding New Content

1. Create `content/articles/<slug>/README.md` with proper frontmatter
2. Add the slug to the appropriate series in `content/articles/meta.json5`
3. Add diagrams in `<slug>/diagrams/` as `.mermaid` or `.excalidraw` files
4. Run `bun run build` to verify

## Target Audience

Staff/Principal/Senior engineers, IT management (Director/VP), interview prep candidates. Content should be technically deep, well-structured, and suitable as a reference.

## Tech Stack

- **Build runtime:** Bun
- **Browser runtime:** TypeScript in `runtime/`, bundled via `Bun.build()` → `dist/assets/main.js`
- **Markdown:** unified + remark + rehype + shiki (dual theme)
- **Diagrams:** mermaid-isomorphic + Playwright (excalidraw)
- **Layouts:** Custom JSX runtime (no React) — TSX files in `layouts/`
- **Config:** JSON5 for all config files
- **CSS:** 6 files bundled in order, light/dark via CSS variables + `data-theme` attribute
- **Fonts:** Open Sans (variable weight) + JetBrains Mono
- **Assets:** All assets in `dist/assets/` (flat, SHA-256 content hashed), HTML ref rewriting
- **Theme:** Auto (prefers-color-scheme) / Light / Dark — persisted in localStorage
- **SEO:** OpenGraph, Twitter Cards, canonical URLs, favicons, GA4, manifest.json
- **Formatting:** dprint (TypeScript, JSON, CSS)
- **Linting:** oxlint

## Responsive Layout (MDN-inspired)

- **Desktop (>=1200px):** 3 columns — left sidebar (series nav), content, right sidebar (TOC)
- **Tablet (800-1199px):** 2 columns — content + TOC. Left sidebar becomes hamburger overlay.
- **Mobile (<800px):** 1 column — content only. TOC becomes collapsible `<details>` above content.
- Blog/project listing pages: no sidebars, just centered content
- Blog/project content pages: content + TOC (2-col), no left sidebar

## Runtime JavaScript (`runtime/`)

- `theme.ts` — Theme switcher (auto/light/dark cycle), localStorage persistence, `data-theme` on `<html>`
- `sidebar.ts` — Mobile sidebar toggle, overlay, ESC key, viewport resize reset
- `toc-highlight.ts` — TOC section highlight sync with scroll
- `copy-code.ts` — Copy-to-clipboard for code blocks
- `main.ts` — Entry point, imports all

## Architecture: Library vs App

The codebase separates **library** (SSG engine, `src/`) from **app** (site-specific, root-level):

- `src/` — Extractable SSG engine: build pipeline, markdown, CSS, diagrams, asset hashing, generators, JSX runtime
- `schemas/` — App-level Zod schemas (frontmatter, config, layout-props, redirects, page-data, meta)
- `runtime/` — Browser JS (app-specific)
- `layouts/` — TSX layout components (app-specific)
- `styles/` — CSS source (app-specific)
- `pagesmith.config.ts` — Typed entry config

Engine-internal schemas (Heading, BuildOptions, GlobalIndex, etc.) stay in `src/schemas/`.

## Dist Output

All hashed assets go to `dist/assets/` (flat). Public files (favicons, robots.txt) go to dist root unhashed.

```
dist/
  assets/           # CSS, JS, fonts, images, diagrams (all hashed)
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
