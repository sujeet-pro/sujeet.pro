---
name: sp-article
description: Create, update, or review deep technical articles in content/articles for sujeet.pro. Use when the user asks for an article, deep dive, series entry, or staff-level technical writing.
---

# sp-article

Read these files in order:

1. `ai-guidelines/README.md`
2. `ai-guidelines/content-structure.md`
3. `ai-guidelines/markdown.md`
4. `ai-guidelines/diagrams.md`
5. `ai-guidelines/packages.md`
6. `ai-guidelines/workflows/article-workflow.md`

## Key rules

- Articles are for senior engineers.
- Practical constraints, trade-offs, and ROI matter.
- Start with an overview diagram when the topic benefits from a black-box view.
- Most major sections should get diagrams when the mechanism is visual.
- Every non-trivial factual claim needs support.
- Prefer one clear subtopic per article. Split broad topics into a series when needed.
- Treat article markdown, article series metadata, homepage features, and redirects as one change set when the article's identity or placement changes.

## Mode hints

- Existing path: usually `update` or `review`
- New topic or slug: `create`
- User asks for quality feedback only: `review`

## Validation

Use the smallest relevant set:

```bash
npm run diagrams
npm run validate
npm run build
```

For broad or research-heavy topics, split the work into at least research, writing, and review passes before finalizing.
