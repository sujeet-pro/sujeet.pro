---
name: sp-doc
description: Route article, blog, or repo-doc refresh work for sujeet.pro.
---

# sp-doc

Read `ai-guidelines/README.md` first.

## Routing

| Signal                                                                                                                | Read next                                     |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `content/articles/`, `article`, `deep dive`, `series`                                                                 | `ai-guidelines/workflows/article-workflow.md` |
| `content/blogs/`, `blog`, `post`, field note                                                                          | `ai-guidelines/workflows/blog-workflow.md`    |
| `ai-guidelines`, `AGENTS.md`, `CLAUDE.md`, `.claude/skills`, `.cursor/skills`, `.agents`, `sync docs`, `refresh docs` | `ai-guidelines/workflows/update-docs.md`      |

## Rules

- Explicit path or explicit type wins.
- Existing article or blog path usually means `update` or `review`.
- New topic or missing path usually means `create`.
- Keep canonical rules in `ai-guidelines/`.
- For single-doc work, also inspect the companion metadata when relevant: section `meta.json5`, `content/home.json5`, and `content/redirects.json5`.
- For repo-wide reviews, audit frontmatter and companion metadata together.
