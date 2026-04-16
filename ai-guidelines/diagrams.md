# Diagram Guidelines

Diagram rules for `sujeet.pro`.

Canonical upstream references:

- `node_modules/diagramkit/ai-guidelines/usage.md` (primary entry point)
- `node_modules/diagramkit/ai-guidelines/diagram-authoring.md`
- `node_modules/diagramkit/ai-guidelines/llms.txt`
- `node_modules/diagramkit/ai-guidelines/llms-full.txt`
- `node_modules/@pagesmith/core/ai-guidelines/markdown-guidelines.md`

This file captures the repo-specific expectations for where diagrams belong and how they should be embedded in article and blog content.

## Diagram bar

- Diagrams are expected for substantial technical content.
- Articles should usually have an overview diagram near the top when the topic involves architecture, flow, or system boundaries.
- Major sections should get focused diagrams when the concept is easier to learn visually.
- Blogs should include diagrams whenever the post explains a mechanism, migration, architecture, or process.
- Do not add decorative diagrams that repeat prose without adding understanding.

## Preferred source formats

| Format     | Best for                                         | Notes                                |
| ---------- | ------------------------------------------------ | ------------------------------------ |
| Mermaid    | flows, sequences, states, ER, comparisons        | Default choice for most diagrams     |
| Excalidraw | conceptual and black-box diagrams                | Good for high-level mental models    |
| Draw.io    | dense infrastructure or multi-layer architecture | Use when Mermaid becomes too cramped |
| Graphviz   | strict graph layout or existing DOT assets       | Use only when layout control matters |

Prefer Mermaid first. Move to Excalidraw or Draw.io when the concept needs freer layout or denser visuals.

## File layout

Keep diagram source files next to the content they support:

```text
content/articles/<slug>/
  README.md
  diagrams/
    request-flow.mermaid
    request-flow-light.svg
    request-flow-dark.svg
```

Rules:

- Commit the source files.
- Treat rendered SVGs as generated artifacts.
- Use descriptive filenames such as `cache-invalidation-flow.mermaid`.
- Keep one diagram per concept.

## Rendering

Use repo-native commands:

```bash
npm run diagrams
npm run diagrams:force
npm run diagrams:watch
```

`diagramkit` generates `-light.svg` and `-dark.svg` variants in the same folder as the source file.

Repo defaults live in `diagramkit.config.json5` and are validated by `schemas/diagramkit.ts`:

- `sameFolder: true`
- `defaultFormats: ["svg"]`
- `defaultTheme: "both"`
- `useManifest: true`

## Embedding in markdown

Use consecutive markdown images with `-light` and `-dark` suffixes. The Pagesmith pipeline automatically merges them into a themed `<figure>`:

```md
![System overview](./diagrams/overview-light.svg "How requests move through the system.")
![System overview](./diagrams/overview-dark.svg)
```

Notes:

- Always include meaningful alt text.
- Add a caption via the markdown title attribute on the light image when the diagram needs interpretation: `![alt](src "caption")`.
- Light image always comes first, dark image immediately after.
- Do not use `<figure>`, `<img>`, or `<picture>` HTML for diagram embeds.

## Where to add diagrams

Add diagrams when the content explains:

- architecture or component boundaries
- data or request flow
- lifecycle or state transitions
- protocol or sequence behavior
- trade-off comparisons
- failure domains or fallback paths

Do not add diagrams for:

- trivial lists
- content that is clearer as code
- sections where the visual would only restate the heading

## Article-specific expectations

- Put an overview diagram near the top when the article benefits from a black-box model.
- Use additional section-level diagrams for hard-to-visualize mechanisms.
- A single article can have multiple diagrams. That is normal.

## Blog-specific expectations

- Use at least one diagram when the post explains a system, migration, or design choice.
- Short reflective blogs can skip diagrams only when prose is clearly enough on its own.

## Update and delete rules

- Never hand-author final SVGs without a source file.
- When the content changes, update the source diagram and re-render.
- When removing a diagram, remove the source file, rendered artifacts, and markdown reference together.
- When changing repo-wide diagram behavior, update `diagramkit.config.json5`, `schemas/diagramkit.ts`, and any relevant AI docs together.

## Authoring heuristics

- Keep node labels short.
- Prefer one visual story per diagram.
- Split dense visuals into multiple diagrams instead of one unreadable figure.
- Use captions to explain why the diagram matters, not just what it is.
