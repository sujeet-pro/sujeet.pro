---
name: sp-diagram
description: Create or regenerate diagrams (writes source files, runs render)
user_invocable: true
---

# Create/Regenerate Diagrams

## Instructions

1. **Write diagram source files** as `.mermaid` or `.excalidraw` in the article's `diagrams/` directory
2. **Run `bun run diagrams`** to render (uses manifest caching — only changed files re-render)
3. **To force re-render all:** `bun run diagrams:force`
4. **To render a single file:** `bun scripts/diagrams.ts --file <path>`

## Mermaid Tips

- Use `graph TD`, `sequenceDiagram`, `flowchart LR` etc.
- Keep diagrams focused — one concept per diagram
- Name files descriptively (the filename becomes the SVG filename)

## Referencing in Markdown

```html
<figure>
<img class="only-light" src="./diagrams/name.light.svg" alt="Description" />
<img class="only-dark" src="./diagrams/name.dark.svg" alt="Description" />
<figcaption>Description</figcaption>
</figure>
```

**Never generate SVG directly. Always write `.mermaid` or `.excalidraw` source and run the renderer.**
