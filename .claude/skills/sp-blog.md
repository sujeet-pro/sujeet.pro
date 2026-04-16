---
name: sp-blog
description: Create, update, or review technical blog posts in content/blogs for sujeet.pro. Use when the user asks for a blog, post, field note, opinionated technical write-up, or shorter reflective content.
user_invocable: true
---

# /sp-blog

Read these files in order:

1. `ai-guidelines/README.md`
2. `ai-guidelines/content-structure.md`
3. `ai-guidelines/markdown.md`
4. `ai-guidelines/diagrams.md`
5. `ai-guidelines/packages.md`
6. `ai-guidelines/workflows/blog-workflow.md`

## Key rules

- Blogs can be personal and opinionated, but factual claims still need to be correct.
- Keep the scope tight enough for a shorter read.
- Use diagrams when they materially improve understanding.
- If the draft is turning into a deep technical reference, propose an article instead.
- Treat blog markdown, listing metadata, homepage curation, and redirects as one change set when the post's identity or placement changes.

## Validation

Use the smallest relevant set:

```bash
npm run diagrams
npm run validate
npm run build
```
