# AI Guidelines

Canonical guidance for writing and updating content in `sujeet.pro`.

Read this file first, then load only the task-specific docs you need. Keep repo knowledge here and keep skill wrappers in `.claude/`, `.cursor/`, and `.agents/` thin.

## Editorial focus

- The primary output of this repo is long-form technical `articles` and shorter `blogs`.
- Articles are research-backed documents for senior engineers. They should be practical, technically deep, and diagram-heavy.
- Blogs are shorter, more personal, and opinionated, but they still need factual and technical correctness.
- The `projects` collection still exists in the codebase, but it is legacy. Do not create new project content unless the user explicitly asks.

## Repo-aware content model

This repo is content-plus-metadata, not markdown-only:

- `site.config.json5` defines site-level runtime, SEO, search, theme, and server settings.
- `content.config.ts` defines the `@pagesmith/core` collections, markdown behavior, and repo-local language aliases.
- `content/meta.json5` defines top-level nav and footer chrome.
- `content/articles/meta.json5` and `content/blogs/meta.json5` define listing behavior, order, and article series.
- `content/home.json5` defines homepage hero and featured content.
- `content/redirects.json5` defines vanity links and legacy URL redirects.
- `schemas/` validates site config, frontmatter, content metadata, and diagramkit config.

Treat a single content edit as incomplete until you check whether one or more of those companion files also need to change.

## Read by task

| Task                                 | Read                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create or update an article          | `ai-guidelines/content-structure.md`, `ai-guidelines/markdown.md`, `ai-guidelines/diagrams.md`, `ai-guidelines/packages.md`, `ai-guidelines/workflows/article-workflow.md`                             |
| Create or update a blog              | `ai-guidelines/content-structure.md`, `ai-guidelines/markdown.md`, `ai-guidelines/diagrams.md`, `ai-guidelines/packages.md`, `ai-guidelines/workflows/blog-workflow.md`                                |
| Review one article or blog           | `ai-guidelines/content-structure.md`, `ai-guidelines/markdown.md`, `ai-guidelines/diagrams.md`, plus the matching workflow doc                                                                         |
| Review the repo's docs/content model | `ai-guidelines/content-structure.md`, `ai-guidelines/packages.md`, `ai-guidelines/workflows/article-workflow.md`, `ai-guidelines/workflows/blog-workflow.md`, `ai-guidelines/workflows/update-docs.md` |
| Refresh AI docs and skill wrappers   | `ai-guidelines/packages.md`, `ai-guidelines/workflows/update-docs.md`                                                                                                                                  |

## Canonical files

- `ai-guidelines/content-structure.md`: content model, frontmatter, metadata companions, citations, article/blog expectations
- `ai-guidelines/markdown.md`: local markdown rules layered on top of the installed `@pagesmith/core` markdown guidance
- `ai-guidelines/diagrams.md`: diagram expectations, file layout, embedding, and rendering
- `ai-guidelines/packages.md`: upstream Pagesmith and diagramkit reference map plus repo-specific integration notes
- `ai-guidelines/workflows/article-workflow.md`: create, update, and review workflow for articles
- `ai-guidelines/workflows/blog-workflow.md`: create, update, and review workflow for blogs
- `ai-guidelines/workflows/update-docs.md`: workflow for syncing `ai-guidelines/`, root docs, rules, and skill wrappers

## Validation commands

Use repo-native commands only:

```bash
npm run diagrams           # Re-render changed diagrams when diagram sources change
npm run validate           # Validate site config, diagramkit config, collections, and cross-file references
npm run validate:content   # @pagesmith/site content validators only
npm run validate:full      # @pagesmith/site content + build validators + project cross-refs
npm run validate:diagrams  # diagramkit validate ./content --recursive (SVG + WCAG 2.2 AA)
npm run validate:dist      # Repo-local dist integrity (links, sitemap, base path)
npm run validate:all       # validate + validate:diagrams + validate:full
npm run build              # Render diagrams, run Vite SSG, and write postbuild assets
vp check                   # Format, lint, and type-check code and config changes
vp test                    # Unit tests
```

Pick the smallest relevant command set for the change. For article and blog edits, `npm run diagrams`, `npm run validate`, and `npm run validate:diagrams` cover the common case. Run `npm run validate:full` and `npm run validate:dist` before a release. Use `vp check` when the task also changed code, schemas, config, or AI docs.

## Skill map

The repo-local skills are folder-shaped at `.agents/skills/<name>/SKILL.md`. The `.claude/skills/<name>/SKILL.md` and `.cursor/skills/<name>/SKILL.md` files are thin pointers to the canonical body — never edit them directly.

- `prj-doc`: route to the right project skill (article, blog, content, diagrams, validate, sync).
- `prj-article`: create, update, or review `content/articles/...`.
- `prj-blog`: create, update, or review `content/blogs/...`.
- `prj-content`: author or revise the prose / markdown body of an existing entry (markdown features, frontmatter, code blocks, themed images, citations).
- `prj-diagrams`: author, render, embed, and audit diagrams (delegates to the `diagramkit-*` skills under `node_modules/diagramkit/skills/`).
- `prj-validate`: run the full validation suite (content, diagrams, build, dist).
- `prj-sync`: refresh `ai-guidelines/`, `AGENTS.md`, `CLAUDE.md`, rules, and the skill wrappers.
