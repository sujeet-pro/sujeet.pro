---
name: prj-article
description: Create, update, or review deep technical articles in content/articles for sujeet.pro. Use when the user asks for an article, deep dive, series entry, or staff-level technical writing.
---

# prj-article — articles for sujeet.pro

Articles are deep, research-backed, diagram-heavy technical documents written for senior engineers (staff/principal). They live at `content/articles/<slug>/README.md` with sibling `diagrams/` and `assets/` folders.

## Read first

In order, then return here for the project-specific workflow:

1. `ai-guidelines/README.md`
2. `ai-guidelines/content-structure.md` — folder layout, required frontmatter, companion metadata, citation bar.
3. `ai-guidelines/markdown.md` — local markdown rules (allowed code-block meta, language aliases, themed-image pairs, validator expectations).
4. `ai-guidelines/diagrams.md` — when to draw, where the source files live, how to embed.
5. `ai-guidelines/packages.md` — current Pagesmith / diagramkit integration map.
6. `ai-guidelines/workflows/article-workflow.md` — step-by-step create/update/review workflow.

## Always cross-load these package skills

These are the version-pinned upstream skills you should read whenever you touch markdown features, the content layer, or diagrams:

- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md` — full markdown feature reference (GFM, GitHub alerts, math, smart typography, code-block meta, themed-image pair merging, footnotes, autolinks).
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/usage.md` — agent rules for the content layer.
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/errors.md` — error catalogue when validation fails.
- `node_modules/@pagesmith/core/REFERENCE.md` — `ContentLayer`, `defineCollection`, schemas, and the markdown pipeline order.
- `node_modules/@pagesmith/site/REFERENCE.md` — site config schema, validators (`validateContent`, `validateBuildOutput`), CSS/runtime entry points.
- `node_modules/diagramkit/REFERENCE.md` and `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md` — engine routing and the per-engine skills you delegate to when the article needs a new diagram.

For diagram authoring + review, jump into the matching engine skill:

- `node_modules/diagramkit/skills/diagramkit-mermaid/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-excalidraw/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-draw-io/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-graphviz/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-review/SKILL.md` — for re-render + WCAG 2.2 AA contrast audit.

## Required frontmatter

```yaml
---
title: "Title used for SEO and listing cards"
description: "One-line summary used for SEO and listing cards"
publishedDate: 2026-03-15
lastUpdatedOn: 2026-03-20
tags: [topic-a, topic-b]
draft: true # optional
---
```

Hard rules (enforced by `schemas/frontmatter.ts`):

- Do **not** set `layout` or `category` in article or blog frontmatter.
- The visible page title is the markdown `# H1`, **not** the frontmatter `title`. Use exactly one `# H1` and keep heading depth sequential.
- Always update `lastUpdatedOn` on a meaningful edit.
- Tags are kebab-case strings, e.g. `distributed-systems`, `cap-theorem`.

## Project metadata that often needs to change in the same PR

Articles do not live in isolation. When the article's identity, slug, or placement changes, also update:

- `content/articles/meta.json5` — manual order, series membership, series copy.
- `content/home.json5` — `featuredArticles` and `featuredSeries` slug references on the homepage hero.
- `content/redirects.json5` — vanity URLs and legacy slug redirects.
- `content/articles/README.md` — listing intro / grouping copy.
- `content/meta.json5` — top-level nav and footer chrome (rare; only if the article should be linked from the global chrome).

The full cross-reference check runs in `scripts/validate.ts` (and again, more strictly, in `scripts/validate-pagesmith.ts`). If you are unsure whether an edit needs a metadata change, run `npm run validate` and let it tell you.

## Markdown features available in this project

The full feature surface is documented upstream (read `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md`). The features you should reach for in articles:

| Feature                                                                                                                                 | Use when                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GFM tables (`\| col \|`)                                                                                                                | Trade-offs, comparisons, capacity numbers, decision matrices.                                                       |
| GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`)                                                       | Sparingly — to flag a footgun, an op-time risk, or a non-obvious assumption.                                        |
| Footnotes (`[^1]`)                                                                                                                      | Dense citations and source links that would clutter prose.                                                          |
| Math (`$...$`, `$$...$$`)                                                                                                               | Latency / throughput / probability formulas; rendered via MathJax (`markdown.math: 'auto'` in `content.config.ts`). |
| Code blocks with meta — `title="..."`, `showLineNumbers`, `mark={3,5-7}`, `ins={4}`, `del={5}`, `collapse={1-5}`, `wrap`, `frame="..."` | File-anchored snippets, before/after diffs, focus highlights.                                                       |
| Themed light/dark image pairs (consecutive `-light` then `-dark`)                                                                       | All diagrams. **Both variants must be present** — a lone `-light` or `-dark` throws.                                |
| Auto-merged figure with caption                                                                                                         | Use the markdown title attribute on the **light** image: `![alt](./diagrams/x-light.svg "caption")`.                |
| `rehype-local-images` (intrinsic dimensions, AVIF/WebP `<picture>`)                                                                     | Use markdown image syntax, not raw `<img>` / `<figure>` / `<picture>` HTML.                                         |
| Heading auto-anchors + autolinks                                                                                                        | Free; use them to support deep linking.                                                                             |

Repo-local Shiki language aliases (defined in `content.config.ts`) you can use in fences: `redis`, `vcl`, `promql`, `logql`, `bind`, `dns`, `cql`, `properties`, `m3u8`, `asciidoc`.

Code-block meta gotchas:

- `mark={5}`, never bare `{5}`.
- `title="file.ts"`, never `file=file.ts`.
- Always specify the language when using meta — `codeBlockValidator` warns otherwise.

## Diagrams in articles

Project defaults (in `diagramkit.config.json5`, validated by `schemas/diagramkit.ts`):

- `sameFolder: true` — source and `-light.svg` / `-dark.svg` outputs sit together inside `diagrams/`.
- `defaultFormats: ["svg"]`, `defaultTheme: "both"`, manifest-backed incremental rendering.

Workflow:

1. For a new diagram, route through `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md` to pick the engine, then follow the engine's SKILL.md to author the source under `content/articles/<slug>/diagrams/`.
2. Render: `npm run diagrams` (or `npm run diagrams:force` to ignore the manifest cache).
3. Embed with consecutive light then dark images:

   ```md
   ![High-level request flow](./diagrams/request-flow-light.svg "How requests move through the system.")
   ![High-level request flow](./diagrams/request-flow-dark.svg)
   ```

4. Never hand-edit a final SVG. Edit the source and re-render.

For a repo-wide diagram audit (structural + WCAG 2.2 AA contrast + re-render), follow `node_modules/diagramkit/skills/diagramkit-review/SKILL.md` and use `npm run validate:diagrams`.

## Citations

- Every non-trivial factual or technical claim needs support.
- Prefer inline links for sources that fit the prose; footnotes for dense citation lists.
- Source priority: official specifications → official documentation → academic papers → primary-source practitioners → well-regarded technical writing.
- If a claim cannot be verified, do not include it.

## Validation before declaring done

Use the smallest relevant set:

```bash
npm run diagrams                       # re-render any changed diagrams
npm run validate                       # config + collections + cross-file refs
npm run validate:content               # @pagesmith/site content validators only
npm run validate:diagrams              # diagramkit validate (SVG + WCAG)
npm run validate:full                  # full content + build + project cross-refs
npm run build && npm run validate:dist # only when adjusting layouts, redirects, or build-touching config
vp check                               # any code/schema/AI-doc changes
```

If `validate:full` flags `LOW_CONTRAST_TEXT` on a diagram, hand off to `node_modules/diagramkit/skills/diagramkit-review/SKILL.md` instead of editing the SVG.

## Mode hints

- Existing path: usually `update` or `review`.
- New topic or slug: `create` — create the entry folder, the README.md, the diagrams/ folder, and update `content/articles/meta.json5` (and `content/home.json5` if featured) in the same change.
- User asks for quality feedback only: `review` — do not modify content; produce a written critique.

## Operating rules

- Articles are deep — 20–30+ minute reads are normal. If a draft drifts into multiple unrelated subtopics, propose splitting it into a series and update `content/articles/meta.json5` accordingly.
- Most major sections should either include a diagram or have a clear reason not to.
- Treat the markdown file, its companion `meta.json5`, `home.json5`, and `redirects.json5` as one change set whenever the slug, series membership, or homepage placement changes.
