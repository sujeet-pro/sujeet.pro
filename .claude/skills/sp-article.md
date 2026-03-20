---
name: sp-article
description: Create or update an article with proper folder structure, frontmatter, diagrams, and series assignment
user_invocable: true
---

# Create/Update Article

## Instructions

When the user asks to create or update an article:

1. **Create the article directory:** `content/articles/<slug>/`
2. **Create README.md** with proper frontmatter:
   ```yaml
   ---
   title: "Article Title"
   description: "One-line description"
   publishedDate: <today>
   lastUpdatedOn: <today>
   tags: [tag1, tag2]
   ---
   ```
3. **Write the content** starting with an H1 heading, then an abstract/intro paragraph
4. **Create diagrams** as `.mermaid` or `.excalidraw` files in `<slug>/diagrams/` — never generate SVG directly
5. **Add to a series** in `content/articles/meta.json5` if applicable
6. **Run `bun run diagrams`** to render diagram SVGs
7. **Run `bun run build`** to verify the article builds correctly
8. **Run `bun run validate`** to check frontmatter

## Content Guidelines

- Target audience: Staff/Principal/Senior engineers, IT management
- Each article should be a focused deep-dive with practical takeaways
- Use tables for comparisons, mermaid diagrams for architecture/flows
- Include an Abstract section after the H1 with "Core mental model" bullets
- Use `<figure>` tags to reference diagrams with light/dark variants
