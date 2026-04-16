---
name: sp-doc
description: Route article, blog, or repo-doc refresh work for sujeet.pro. Use when the user asks to write, update, or review an article or blog, or to refresh ai-guidelines, AGENTS.md, CLAUDE.md, or skill wrappers.
user_invocable: true
---

# /sp-doc

Read `ai-guidelines/README.md` first.

## Routing

Choose the path that matches the request:

| Signal                                                                                                                | Read next                                     |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `content/articles/`, `article`, `deep dive`, `series`, staff-level technical writing                                  | `ai-guidelines/workflows/article-workflow.md` |
| `content/blogs/`, `blog`, `post`, opinionated technical note, field note                                              | `ai-guidelines/workflows/blog-workflow.md`    |
| `ai-guidelines`, `AGENTS.md`, `CLAUDE.md`, `.claude/skills`, `.cursor/skills`, `.agents`, `sync docs`, `refresh docs` | `ai-guidelines/workflows/update-docs.md`      |

## Routing rules

- Explicit path or explicit type wins.
- Existing article or blog path usually means `update` or `review`.
- New topic or missing path usually means `create`.
- If the request is ambiguous between article and blog, ask before writing.
- For single-doc work, also inspect the companion metadata when relevant: section `meta.json5`, `content/home.json5`, and `content/redirects.json5`.
- For repo-wide reviews, audit frontmatter and companion metadata together.

## Always honor

- Keep canonical rules in `ai-guidelines/`.
- Keep wrappers thin.
- Do not create new `projects` content unless the user explicitly asks.
