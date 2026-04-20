# sujeet.pro

Personal engineering blog and portfolio, powered directly by `@pagesmith/core`, `@pagesmith/site`, and `diagramkit`.

This repo should stay on a core-native setup. Do not reintroduce `@pagesmith/docs`.

## Quick Commands

```bash
npm run dev               # Vite dev server (port 3000)
npm run build             # Render diagrams, run Vite SSG, and write postbuild assets
npm run preview           # Preview built output (port 4000)
npm run validate          # Validate config, collections, and cross-file references
npm run validate:content  # @pagesmith/site content validators only
npm run validate:full     # @pagesmith/site content + build validators + project cross-refs
npm run validate:diagrams # diagramkit validate (SVG structure + WCAG 2.2 AA)
npm run validate:dist     # Repo-local dist integrity (links, sitemap, base path)
npm run validate:all      # validate + validate:diagrams + validate:full
npm run check-orphans     # Find unreferenced assets
vp check                  # Format + lint + type-check
vp check --fix            # Auto-fix formatting and lint issues
vp test                   # Unit tests
npm run test:e2e          # E2E tests
npm run diagrams          # Render changed diagrams
npm run diagrams:force    # Re-render all diagrams
npm run diagrams:doctor   # diagramkit environment + config sanity check
```

## Read First

Read `ai-guidelines/README.md` first.

Canonical repo guidance lives in `ai-guidelines/`:

- `ai-guidelines/README.md`
- `ai-guidelines/content-structure.md`
- `ai-guidelines/markdown.md`
- `ai-guidelines/diagrams.md`
- `ai-guidelines/packages.md`
- `ai-guidelines/workflows/article-workflow.md`
- `ai-guidelines/workflows/blog-workflow.md`
- `ai-guidelines/workflows/update-docs.md`

## Skills

Canonical skill bodies live in `.agents/skills/<name>/SKILL.md`. The
`.claude/skills/<name>/SKILL.md` and `.cursor/skills/<name>/SKILL.md` files
are thin pointers to the canonical body — never edit them directly.

### /prj-doc

Route an unclear task to the right project skill (article, blog, content,
diagrams, validate, sync).

### /prj-article

Create, update, or review deep technical articles under `content/articles/`.

### /prj-blog

Create, update, or review technical blog posts under `content/blogs/`.

### /prj-content

Author or revise the prose / markdown body of an existing entry — frontmatter,
headings, code blocks, alerts, themed images, citations.

### /prj-diagrams

Author, render, embed, and audit diagrams. Delegates to the `diagramkit-*`
skills shipped under `node_modules/diagramkit/skills/`.

### /prj-validate

Run the full validation suite — content, diagrams, build output, dist
integrity, and project-specific cross-references.

### /prj-sync

Refresh `ai-guidelines/`, root docs, rules, and thin skill wrappers after a
package upgrade or a project convention change.

## Core Config Surfaces

- `site.config.json5` — site-level config for base path, search, theme, analytics, edit links, and ports
- `diagramkit.config.json5` — diagram rendering defaults and manifest behavior
- `content.config.ts` — `@pagesmith/core` collections and markdown settings
- `schemas/` — Zod schemas for site config, frontmatter, content metadata, and diagramkit config
- `content/meta.json5` — top-level nav and footer links
- `content/articles/meta.json5` — article listing behavior, manual order, and series definitions
- `content/blogs/meta.json5` — blog listing behavior and ordering
- `content/home.json5` — homepage hero and featured content
- `content/redirects.json5` — vanity URLs and legacy redirects

## Content Model

```text
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
  projects/            # Legacy only
```

All articles live flat under `content/articles/`. Related articles are grouped by series defined in `content/articles/meta.json5`.

## Frontmatter

Articles and blogs use this shape:

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

Rules:

- Do not set `layout` or `category` in article or blog frontmatter.
- `title` and `description` are for SEO, cards, and feeds.
- The visible page title still comes from the markdown `# H1`.
- If a slug, series membership, homepage feature, or canonical path changes, update the coordinating `meta.json5`, `home.json5`, and `redirects.json5` files in the same change.

## Diagrams

Source files live in the entry's `diagrams/` folder. Supported source formats are `.mermaid`, `.excalidraw`, `.drawio`, `.dot`, and `.gv`.

The repo uses `diagramkit` with `sameFolder: true`, so source files and generated `-light.svg` / `-dark.svg` outputs live side by side.

Preferred embed pattern (consecutive light/dark markdown images are auto-merged by Pagesmith):

```md
![Description](./diagrams/name-light.svg)
![Description](./diagrams/name-dark.svg)
```

Never generate SVGs by hand.

## Architecture And Code Flow

- `content.config.ts` defines the content collections and markdown behavior.
- `vite.config.ts` keeps `pagesmithContent(...)` on `@pagesmith/core/vite` and wires `sharedAssetsPlugin()` plus `...pagesmithSsg(...)` from `@pagesmith/site/vite`.
- `index.html`, `src/theme.css`, and `src/client.ts` define the Vite-managed CSS and browser runtime entry points for the site layer.
- `src/entry-server.tsx` imports `virtual:content/*` payloads and renders routes through `theme/layouts/*`.
- `theme/lib/content.ts` merges entry frontmatter with section metadata, homepage data, and redirects to build navigation, listings, breadcrumbs, series navigation, and featured content.
- `scripts/postbuild.ts` writes repo-specific post-build artifacts such as `sitemap.xml` and `rss.xml`.
- `scripts/validate.ts` validates config, content collections, and cross-file integrity.

## Toolchain

- `@pagesmith/core` — content layer, markdown pipeline, schemas/loaders, and `pagesmithContent`
- `@pagesmith/site` — JSX runtime, site CSS/runtime bundles, and Vite SSG helpers
- `diagramkit` — Mermaid, Excalidraw, Draw.io, and Graphviz rendering
- `tsx` — TypeScript script runner
- `Vite+` — `vp check`, `vp test`, commit hooks
- `Playwright` — diagram rendering runtime and E2E tests

## Package References

Always read these from the locally installed `node_modules/` — they are
version-pinned to what the project actually ships with.

`@pagesmith/core`:

- `node_modules/@pagesmith/core/REFERENCE.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/SKILL.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/usage.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/errors.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/migration.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-write-validator/SKILL.md`
- `node_modules/@pagesmith/core/llms.txt`, `node_modules/@pagesmith/core/llms-full.txt`

`@pagesmith/site`:

- `node_modules/@pagesmith/site/REFERENCE.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/SKILL.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/setup-site.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/usage.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/site-guidelines.md`
- `node_modules/@pagesmith/site/llms.txt`, `node_modules/@pagesmith/site/llms-full.txt`

`diagramkit`:

- `node_modules/diagramkit/REFERENCE.md`
- `node_modules/diagramkit/ai-guidelines/usage.md`
- `node_modules/diagramkit/ai-guidelines/diagram-authoring.md`
- `node_modules/diagramkit/llms.txt`, `node_modules/diagramkit/llms-full.txt`
- `node_modules/diagramkit/skills/diagramkit-setup/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-mermaid/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-excalidraw/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-draw-io/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-graphviz/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-review/SKILL.md`
