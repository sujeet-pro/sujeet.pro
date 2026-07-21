# Diagram Guidelines

Diagram rules for `sujeet.pro`.

Canonical upstream references:

- `node_modules/diagramkit/REFERENCE.md` (read before any `diagramkit` command)
- `node_modules/diagramkit/ai-guidelines/usage.md`
- `node_modules/diagramkit/ai-guidelines/diagram-authoring.md`
- `node_modules/diagramkit/llms.txt`
- `node_modules/diagramkit/llms-full.txt`
- `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md` (engine routing)
- `node_modules/diagramkit/skills/diagramkit-mermaid/SKILL.md`, `diagramkit-excalidraw`, `diagramkit-draw-io`, `diagramkit-graphviz`
- `node_modules/diagramkit/skills/diagramkit-review/SKILL.md` (cross-engine validate + WCAG audit)
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md` (themed-image pair embedding)

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
npm run diagrams                 # render changed sources under diagrams/ folders (. --scope-dir diagrams)
npm run diagrams:force           # ignore manifest cache
npm run diagrams:watch           # watch mode
npm run diagrams:doctor          # diagramkit doctor (env + config sanity)
npm run validate:diagrams        # validate . --recursive --scope-dir diagrams --fail-on <policy> (SVG + WCAG)
npm run validate:diagrams:json   # JSON form for CI / programmatic post-processing
```

`diagramkit` generates `-light.svg` and `-dark.svg` variants in the same folder as the source file.

Rendering and validation are both scoped with `--scope-dir diagrams`: the CLI walks the whole repo but only touches SVGs (and sources) that live under a folder literally named `diagrams/`. This is what keeps hand-authored / legacy `assets/` SVGs out of the audit without a hand-rolled per-folder loop.

Validation promotes a fixed set of issue codes to fatal (nonzero exit) via `--fail-on`, defined in `scripts/validate-diagrams.ts`:

- Always fatal (embed-safety): `CONTAINS_FOREIGN_OBJECT`, `CONTAINS_SCRIPT`, `EXTERNAL_RESOURCE`.
- `LOW_CONTRAST_TEXT` is controlled by the `FAIL_ON_LOW_CONTRAST` constant, now **on** (fatal, merge-blocking) because a fresh `validate:diagrams` over the full corpus returns **0** findings. The audit drove the count **84/72 → 24/16 → 8/6 → 0/0**:
  - **Root causes fixed upstream** in the linked diagramkit (`RENDER_PIPELINE_VERSION` 2→3→4, released via the ecosystem upgrade): injected Mermaid `sequenceNumberColor` + `xychart-beta` text colors and stopped darkening glyph fills (v3, cleared the ~48 systematic sequence/xychart findings); and the dark post-processor now _lightens_ near-black glyph fills so gantt/timeline axis ticks (Mermaid hardcodes `fill="#000"`, un-themeable) are legible on the dark canvas (v4).
  - **Fixed per-source**, preserving design intent: dropbox flowchart pastel `classDef`s → AA mid-tone palette + white text; slack flowchart per-node `style` → `classDef`; gantt task-fill `themeVariables` (`taskBkgColor`/`doneTaskBkgColor`, plus `critBkgColor #B43A3A` on all three gantts so white in-bar text on crit bars is a real 5.82:1 — Mermaid's default red crit rendered #fff-on-#ff0000 = 3.99:1); timeline `cScale*` mid-tone sections + white `cScaleLabel*`.
  - **The last 8 findings were diagramkit _scanner_ false-positives**, now fixed in the scanner itself (`src/color/wcag.ts`, validation-only, no pipeline bump): gantt off-bar labels (`taskTextOutside*`/`sectionTitle*`/`milestoneText`/`titleText`) resolve against the canvas instead of the trailing dark task rect; timeline section labels resolve against their section block painted in a sibling subtree; and multi-ancestor descendant CSS (`.edgeLabel .label text/rect`) is parsed so ER edge/entity labels stop self-matching. Because enforcement now rests on an accurate scan, a future regression re-blocks the gate rather than being masked.

Repo defaults live in `diagramkit.config.json5` and are validated by `schemas/diagramkit.ts`:

- `sameFolder: true`
- `defaultFormats: ["svg"]`
- `defaultTheme: "both"`
- `useManifest: true`

Render manifests (`**/diagrams/manifest.json`) are committed to the repo (they are no longer git-ignored), so a fresh clone with unchanged sources renders nothing and never needs Chromium.

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
