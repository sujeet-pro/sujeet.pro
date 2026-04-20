---
name: prj-blog
description: Create, update, or review technical blog posts in content/blogs for sujeet.pro. Use when the user asks for a blog, post, field note, opinionated technical write-up, or shorter reflective content.
---

# prj-blog — blogs for sujeet.pro

Blogs are shorter, more personal, and more opinionated than articles, but they still need to be technically and factually correct. They live at `content/blogs/<slug>/README.md` with sibling `diagrams/` and `assets/` folders. Default target length: under ~15 minute read.

## Read first

In order:

1. `ai-guidelines/README.md`
2. `ai-guidelines/content-structure.md`
3. `ai-guidelines/markdown.md`
4. `ai-guidelines/diagrams.md`
5. `ai-guidelines/packages.md`
6. `ai-guidelines/workflows/blog-workflow.md`

## Always cross-load these package skills

- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md` — full markdown feature reference.
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/usage.md` — content-layer rules.
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/errors.md` — validator error catalogue.
- `node_modules/@pagesmith/core/REFERENCE.md` — `ContentLayer` + markdown pipeline.
- `node_modules/@pagesmith/site/REFERENCE.md` — site config + validators.
- `node_modules/diagramkit/REFERENCE.md` and `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md` — when the post needs a diagram.
- `node_modules/diagramkit/skills/diagramkit-review/SKILL.md` — for re-render + WCAG audit.

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

Same hard rules as articles:

- No `layout` or `category` in frontmatter.
- The visible title is the markdown `# H1`. Exactly one `# H1`, sequential heading depth.
- Update `lastUpdatedOn` on every meaningful edit.

## Project metadata that often needs to change in the same PR

- `content/blogs/meta.json5` — listing behavior, ordering.
- `content/home.json5` — only if the blog is explicitly featured.
- `content/redirects.json5` — when the slug or canonical path changes.
- `content/blogs/README.md` — listing intro.

## Markdown features available in this project

Same surface as articles — see the upstream `markdown-guidelines.md`. In blogs you'll most often reach for:

- GFM tables for compact comparisons.
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, etc.) for callouts that frame personal stance.
- Footnotes for citations that would interrupt the conversational tone.
- Code blocks with `title="..."`, `mark={...}`, `ins={...}`, `del={...}` for before/after diffs and focus highlights.
- Themed light/dark image pairs for diagrams: consecutive `![alt](./diagrams/x-light.svg "caption")` then `![alt](./diagrams/x-dark.svg)`.
- Repo-local Shiki language aliases (defined in `content.config.ts`): `redis`, `vcl`, `promql`, `logql`, `bind`, `dns`, `cql`, `properties`, `m3u8`, `asciidoc`.
- Math (`$...$`, `$$...$$`) — only when the post genuinely needs it.

## Diagrams in blogs

- Add at least one diagram when the post explains a mechanism, migration, architecture, or process.
- Short reflective blogs can skip diagrams when the prose is clearly enough.
- For a new diagram: route through `diagramkit-auto` to pick the engine, then follow the matching engine SKILL.md.
- Render with `npm run diagrams`; embed with consecutive light/dark image pairs.
- Never hand-author final SVGs.

## Citations

- Cite anything non-obvious, externally sourced, numerical, standards-based, or likely to be challenged.
- Personal observations and opinions do not need citations unless they rely on external facts.
- When in doubt, cite.

## Tone

- First-person voice and opinion are welcome.
- Focus on what you learned, what you changed, or how you now think about a topic.
- Even when reflective, factual claims must be accurate. Do enough research to avoid hand-wavy or outdated statements.

## Validation before declaring done

```bash
npm run diagrams                       # re-render any changed diagrams
npm run validate                       # config + collections + cross-file refs
npm run validate:content               # @pagesmith/site content validators
npm run validate:diagrams              # diagramkit validate (SVG + WCAG)
npm run validate:full                  # full content + build + project cross-refs
vp check                               # any code/schema/AI-doc changes
```

## Operating rules

- Treat blog markdown, `content/blogs/meta.json5`, and `content/home.json5` (when featured) as a single change set if any of those need to move together.
- Do not invent Pagesmith behavior — read the installed reference first.
- Do not introduce `layout` or `category` frontmatter; the schema rejects them.
