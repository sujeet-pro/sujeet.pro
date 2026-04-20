# sujeet.pro — Agent Guide

Personal engineering blog and portfolio at sujeet.pro. Built directly on `@pagesmith/core`, `@pagesmith/site`, and `diagramkit`.

This repo should stay on a core-native setup. Do not reintroduce `@pagesmith/docs`.

## Quick Start

```bash
vp install
npm run dev
npm run build
npm run validate           # config + collections + cross-file refs
npm run validate:full      # @pagesmith/site content + build validators + project cross-refs
npm run validate:diagrams  # diagramkit validate (SVG structure + WCAG 2.2 AA)
npm run validate:dist      # repo-local dist integrity
npm run validate:all       # validate + validate:diagrams + validate:full
vp check
vp test
npm run test:e2e
```

`scripts/validate-pagesmith.ts` (run by `npm run validate:full` and friends) is
the canonical end-to-end validator. It composes the published validators from
`@pagesmith/site` (`validateContent`, `validateBuildOutput`,
`loadContentSchemaMap`, `formatContentValidationReport`) with the v5-specific
cross-reference checks for `meta.json5` series → article slugs,
`home.json5` featured slugs, and `redirects.json5` targets. Diagram audits go
through the `diagramkit validate` CLI (`npm run validate:diagrams`). Prefer
extending those scripts over forking validation logic into yet another place.

## Read First

Start with `ai-guidelines/README.md`.

Canonical guidance lives in `ai-guidelines/`:

- `ai-guidelines/README.md` — task routing, repo-aware content model, validation commands
- `ai-guidelines/content-structure.md` — content types, frontmatter, companion metadata, citations
- `ai-guidelines/markdown.md` — local markdown rules layered on Pagesmith
- `ai-guidelines/diagrams.md` — diagram authoring and rendering rules
- `ai-guidelines/packages.md` — upstream Pagesmith and diagramkit references plus repo integration notes
- `ai-guidelines/workflows/article-workflow.md` — article create/update/review workflow
- `ai-guidelines/workflows/blog-workflow.md` — blog create/update/review workflow
- `ai-guidelines/workflows/update-docs.md` — AI doc and wrapper refresh workflow

## Repo-local Skills

Canonical skill bodies live in `.agents/skills/<name>/SKILL.md`. The
`.claude/skills/<name>/SKILL.md` and `.cursor/skills/<name>/SKILL.md` files
are thin pointers to the canonical body — never edit them directly.

| Skill          | Use for                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `prj-doc`      | Route an unclear task to the right project skill.                                                                                        |
| `prj-article`  | Create / update / review articles under `content/articles/`.                                                                             |
| `prj-blog`     | Create / update / review blogs under `content/blogs/`.                                                                                   |
| `prj-content`  | Author or revise the prose / markdown body of an existing entry (markdown features, frontmatter, code blocks, themed images, citations). |
| `prj-diagrams` | Author, render, embed, and audit diagrams (delegates to `diagramkit-*` skills).                                                          |
| `prj-validate` | Run the full validation suite (content, diagrams, build, dist).                                                                          |
| `prj-sync`     | Refresh `ai-guidelines/`, root docs, rules, and wrapper files after a package upgrade or convention change.                              |

## Architecture

- `site.config.json5` is the site-level config for origin, base path, theme, search, analytics, edit links, and server ports.
- `diagramkit.config.json5` is the diagram rendering config. It is validated by `schemas/diagramkit.ts`.
- `content.config.ts` defines the `@pagesmith/core` collections and markdown behavior.
- `vite.config.ts` keeps `pagesmithContent(...)` on `@pagesmith/core/vite` and wires `sharedAssetsPlugin()` plus `...pagesmithSsg(...)` from `@pagesmith/site/vite`.
- `schemas/` contains Zod schemas for site config, frontmatter, content metadata, and diagramkit config.
- `content/` holds markdown plus companion JSON5 metadata: root nav/footer, section metadata, homepage curation, and redirects.
- `index.html`, `src/theme.css`, and `src/client.ts` define the Vite-managed CSS and browser runtime entry points for the site layer.
- `src/entry-server.tsx` is the SSG entry that renders `virtual:content/*` payloads through `theme/layouts/*`.
- `theme/lib/content.ts` composes listings, series navigation, breadcrumbs, prev/next links, homepage featured content, and redirects from the markdown-plus-metadata model.
- `scripts/postbuild.ts` writes repo-specific post-build artifacts such as `sitemap.xml` and `rss.xml`.
- `scripts/validate.ts` validates config, content schemas, and cross-file references.
- `scripts/validate-pagesmith.ts` composes `@pagesmith/site` validators with the project cross-ref checks.
- `scripts/validate-dist.ts` walks the built `dist/` for required files, link integrity, and base-path correctness.

## Code Flow

1. `content.config.ts` defines collections for pages, entries, and JSON5 metadata.
2. `vite.config.ts` keeps `pagesmithContent(...)` on `@pagesmith/core/vite` and wires `sharedAssetsPlugin()` plus `...pagesmithSsg(...)` from `@pagesmith/site/vite`.
3. `index.html`, `src/theme.css`, and `src/client.ts` define the Vite-managed CSS and browser runtime entry points for the site layer.
4. `src/entry-server.tsx` imports the serialized virtual modules and renders routes.
5. `theme/layouts/*` and `theme/components/*` render the final HTML shell.
6. `scripts/postbuild.ts` adds sitemap/RSS artifacts after `vite build`.

## Content Rules

- Articles live at `content/articles/<slug>/README.md`.
- Blogs live at `content/blogs/<slug>/README.md`.
- Projects are legacy. Do not create new project content unless explicitly asked.
- Article and blog frontmatter must include `title`, `description`, `publishedDate`, `lastUpdatedOn`, and `tags`.
- Do not set `layout` or `category` in article or blog frontmatter.
- The visible page title comes from the markdown `# H1`.
- Content edits are metadata-aware: when a slug, series membership, homepage feature, or canonical path changes, update the coordinating `meta.json5`, `home.json5`, and `redirects.json5` files in the same change.

## Diagrams

- Write `.mermaid`, `.excalidraw`, `.drawio`, `.dot`, or `.gv` sources in the entry's `diagrams/` folder.
- Run `npm run diagrams` to render themed outputs.
- The repo uses `sameFolder: true`, so source files and generated `-light.svg` / `-dark.svg` outputs live together.
- Never hand-author final SVGs without a source file.

Preferred embed pattern (consecutive light/dark markdown images are auto-merged by Pagesmith):

```md
![Description](./diagrams/name-light.svg)
![Description](./diagrams/name-dark.svg)
```

## Package References

The installed package surfaces are the only source of truth — read these from
the locally installed `node_modules/` rather than from training data or
external docs.

`@pagesmith/core`:

- `node_modules/@pagesmith/core/REFERENCE.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/SKILL.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/setup-core.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/usage.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/recipes.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/errors.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/migration.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-add-collection/SKILL.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-add-loader/SKILL.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-customize-markdown/SKILL.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-write-validator/SKILL.md`
- `node_modules/@pagesmith/core/llms.txt`, `node_modules/@pagesmith/core/llms-full.txt`

`@pagesmith/site`:

- `node_modules/@pagesmith/site/REFERENCE.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/SKILL.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/setup-site.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/usage.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/site-guidelines.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/recipes.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/migration.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-customize-theme/SKILL.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-use-preset/SKILL.md`
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
