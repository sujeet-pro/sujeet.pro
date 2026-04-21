---

## name: prj-diagrams

description: Author, render, embed, and audit diagrams in sujeet.pro. Use when the user asks to create a diagram, re-render diagrams, fix WCAG contrast warnings, or run the repo-wide diagram health check.

# prj-diagrams — diagram lifecycle for sujeet.pro

This skill orchestrates the diagram workflow against the locally installed `diagramkit` CLI/API. Per-engine authoring detail and the cross-engine review playbook live in the version-pinned upstream skills — this file just wires them into the project's conventions.

## Read first

1. `ai-guidelines/diagrams.md` — repo defaults, file layout, embedding rules.
2. `node_modules/diagramkit/REFERENCE.md` — version-pinned CLI/API contract. **Always read before running a `diagramkit` command.**
3. `node_modules/diagramkit/ai-guidelines/usage.md` — agent setup prompts.
4. `node_modules/diagramkit/ai-guidelines/diagram-authoring.md` — exhaustive per-engine authoring guidance (palettes, theming, embedding).

## Always anchor on the local CLI

```bash
npx diagramkit --version          # confirms node_modules/.bin/diagramkit
npx diagramkit doctor             # environment + config sanity check
```

If `node_modules/diagramkit/REFERENCE.md` is missing, the package isn't installed correctly — run `npm install` (the repo already has `diagramkit` in `dependencies`). **Never** fall back to a global `diagramkit`.

## Project defaults

Defined in `diagramkit.config.json5` and validated by `schemas/diagramkit.ts`:

- `sameFolder: true` — source files and the rendered `-light.svg` / `-dark.svg` outputs sit together inside `diagrams/`.
- `defaultFormats: ["svg"]`.
- `defaultTheme: "both"` — every diagram emits both light and dark variants.
- Manifest-backed incremental rendering keyed on source-file SHA-256.

The repo's `npm run diagrams` (= `tsx scripts/diagrams.ts`) validates the config against the local schema, then delegates to the official `diagramkit render` CLI so every CLI flag stays available.

## File layout

```text
content/articles/<slug>/
  README.md
  diagrams/
    request-flow.mermaid
    request-flow-light.svg
    request-flow-dark.svg
```

Same shape under `content/blogs/<slug>/diagrams/` and (legacy) `content/projects/<slug>/diagrams/`.

Rules:

- Commit source files. Treat rendered SVGs as generated artifacts (still committed for SSG, but never hand-edited).
- Use descriptive filenames (`cache-invalidation-flow.mermaid`, not `diagram-3.mermaid`).
- One concept per diagram — split dense visuals.
- Never hand-author a final SVG without a source file.

## Authoring a new diagram

1. **Pick the engine** by following `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md`.
2. **Author the source** by following the matching engine SKILL.md:
  - `node_modules/diagramkit/skills/diagramkit-mermaid/SKILL.md` — flowcharts, sequence, class, state, ER, gantt, …
  - `node_modules/diagramkit/skills/diagramkit-excalidraw/SKILL.md` — freeform, hand-drawn, conceptual diagrams.
  - `node_modules/diagramkit/skills/diagramkit-draw-io/SKILL.md` — dense infrastructure, cloud icons, BPMN, multi-page.
  - `node_modules/diagramkit/skills/diagramkit-graphviz/SKILL.md` — algorithmic layouts; WASM, no browser needed.
3. **Save the source** under `content/<section>/<slug>/diagrams/<descriptive-name>.<ext>`.
4. **Render**:
  ```bash
   npm run diagrams                                       # render only changed sources
   npm run diagrams -- ./content/articles/<slug>/diagrams # scope to one entry
   npm run diagrams:force                                 # ignore manifest cache and re-render everything
  ```
5. **Embed** with consecutive light/dark markdown images (Pagesmith auto-merges them into a themed `<figure>`):
  ```md
   ![High-level request flow](./diagrams/request-flow-light.svg "How requests move through the system.")
   ![High-level request flow](./diagrams/request-flow-dark.svg)
  ```
   Caption goes on the **light** image's title attribute. Both variants must be present and consecutive — a lone `-light` or `-dark` throws an error.

## Editing an existing diagram

- Edit the source file and re-render.
- Never edit the generated SVGs directly — they will be overwritten on the next `npm run diagrams` and your edit will be lost.
- If the diagram is renamed: update the source file, re-render, update both markdown image refs, and delete the orphaned SVG siblings (`npm run check-orphans` lists them).

## Repo-wide audit (validate + WCAG 2.2 AA)

For a pre-merge or pre-release pass, follow `node_modules/diagramkit/skills/diagramkit-review/SKILL.md` end-to-end. The shortcut:

```bash
npm run validate:diagrams              # diagramkit validate ./content --recursive
npm run validate:diagrams:json         # JSON form for CI
```

The validator reports issue codes; the most common in this repo:


| Code                      | Severity | Means                                                                                  |
| ------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `NO_VISUAL_ELEMENTS`      | error    | Empty SVG — source has a syntax error.                                                 |
| `MISSING_SVG_CLOSE`       | error    | Render crashed mid-output.                                                             |
| `EMPTY_FILE`              | error    | Zero bytes — re-render, check `npx diagramkit warmup`.                                 |
| `CONTAINS_SCRIPT`         | error    | `<script>` inside SVG — won't work in `<img>` embed.                                   |
| `CONTAINS_FOREIGN_OBJECT` | warning  | Mermaid HTML labels — silently degrade in `<img>` / Markdown. Set `htmlLabels: false`. |
| `EXTERNAL_RESOURCE`       | warning  | SVG references external URL — blocked in `<img>`.                                      |
| `LOW_CONTRAST_TEXT`       | warning  | Fails WCAG 2.2 AA (< 4.5:1 normal, < 3:1 large). **Always fix.**                       |


For per-engine fix tactics, hand off to that engine's SKILL.md `## Review Mode` section. Cap any per-source fix loop at 8 iterations (the upstream `diagramkit-review` convention).

## Removing a diagram

Remove together — never leave dangling references:

1. Delete the source file under `diagrams/`.
2. Delete the matching `-light.svg` and `-dark.svg`.
3. Remove the markdown image references from the entry.
4. Re-run `npm run validate:full` to confirm nothing else still references the removed asset.

## Repo-wide config changes

If you change repo-wide diagram behavior, update **both** in the same change:

- `diagramkit.config.json5`
- `schemas/diagramkit.ts`

…and re-render to surface drift before committing.

## Operating rules

- Always `npx diagramkit ...` (or `npm run diagrams ...`), never a global `diagramkit`.
- Edit sources, not SVGs. Re-render after every source change.
- Always render with both themes (`defaultTheme: "both"` is the project default; do not override per-entry).
- Use `<picture>`-style auto-merging via consecutive markdown images, not raw `<picture>` HTML.
- For audits, follow `diagramkit-review` end-to-end and write the report into `.temp/diagram-review/<timestamp>/report.md`.

