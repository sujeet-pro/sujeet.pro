---

## name: prj-content
description: Author or revise the prose / markdown surface of an existing entry in sujeet.pro — frontmatter, headings, code blocks, tables, alerts, themed images, citations, and footnotes. Use when the user asks to write, polish, restructure, or expand the markdown body of an article or blog without changing its identity (slug, series, redirects).

# prj-content — markdown authoring helper

Use this skill when the **content** of an existing entry is changing but the entry's **identity** (slug, folder, series membership, homepage feature) is not. For identity changes, route to `prj-article` or `prj-blog`.

## Read first

1. `ai-guidelines/markdown.md` — repo-local supplement (allowed code-block meta, language aliases, themed-image rules, validator expectations).
2. `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md` — full upstream feature reference. **Read this end-to-end before writing non-trivial markdown.** It covers the entire pipeline:
  ```
   remark-parse → remark-gfm → remark-frontmatter
     → remark-github-alerts → remark-smartypants
     → remark-math (auto-detected)
     → lang-alias transform → remark-rehype
     → rehype-mathjax (when math is enabled)
     → applyPagesmithCodeRenderer (dual themes, line numbers, titles, copy, collapse, mark/ins/del)
     → rehype-code-tabs → rehype-scrollable-tables
     → rehype-slug → rehype-autolink-headings
     → rehype-external-links → rehype-accessible-emojis → rehype-local-images
     → heading extraction → rehype-stringify
  ```
3. `node_modules/@pagesmith/core/REFERENCE.md` — pipeline order, code-block meta syntax, frontmatter schemas, validators.
4. `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/errors.md` — error catalogue when validation fails.

## Markdown features and how to use them in this repo

### Frontmatter (required for articles + blogs)

```yaml
---

title: "Title used for SEO and listing cards"
description: "One-line summary used for SEO and listing cards"
publishedDate: 2026-03-15
lastUpdatedOn: 2026-03-20
tags: [topic-a, topic-b]
draft: true # optional

---

````

- **Never** add `layout` or `category` — `schemas/frontmatter.ts` rejects them.
- The visible page title comes from the markdown `# H1`, **not** the frontmatter `title`.
- Update `lastUpdatedOn` on every meaningful edit.

### Headings and structure

- Exactly one `# H1` per page.
- Sequential heading depth (`#` → `##` → `###`); never skip a level — `headingValidator` enforces this.
- Auto-anchors and autolinks come for free; you can deep-link `#section-slug`.
- Keep heading text non-empty (also enforced).

### GFM features

- **Tables** — alignment via `:---`, `:---:`, `---:`. Wide tables get a horizontal scroll wrapper automatically (`rehype-scrollable-tables`).
- **Strikethrough** — `~~deleted~~`.
- **Task lists** — `- [x]` / `- [ ]`.
- **Footnotes** — `[^id]` for inline reference, `[^id]: ...` for the body.
- **Autolinks** — bare URLs become links, but `linkValidator` warns on them — prefer `[Link text](url)`.

### GitHub alerts

```md
> [!NOTE]
> Informational note.
> [!TIP]
> Helpful tip.
> [!IMPORTANT]
> Important information.
> [!WARNING]
> Warning message.
> [!CAUTION]
> Cautionary message.
````

Use sparingly and intentionally — to flag a footgun, an op-time risk, or a non-obvious assumption.

### Math (auto-detected)

`markdown.math` defaults to `'auto'` in `content.config.ts`, so MathJax only loads on pages that contain math markers. Inline `$E = mc^2$`, block `$$ ... $$`. Inline `$` delimiters must not have spaces immediately inside them.

### Smart typography

Straight quotes, `--`, `---`, and `...` get auto-converted in prose. Code blocks and inline code are untouched.

### Code blocks (Pagesmith built-in renderer)

Always specify the language — `codeBlockValidator` warns when meta is used without a language.

```md
\`\`\`ts title="cache.ts" showLineNumbers mark={3,8-10}
export function getCacheKey() {
// ...
}
\`\`\`
```

| Meta               | Example                 | Use for                          |
| ------------------ | ----------------------- | -------------------------------- |
| `title="..."`      | `ts title="app.ts"`     | File-anchored snippets.          |
| `showLineNumbers`  | `ts showLineNumbers`    | Long snippets / line references. |
| `mark={lines}`     | `ts mark={3,5-7}`       | Highlight focus lines.           |
| `ins={lines}`      | `ts ins={4}`            | Inserted lines (green).          |
| `del={lines}`      | `ts del={5}`            | Deleted lines (red).             |
| `collapse={lines}` | `ts collapse={1-5}`     | Collapsible regions.             |
| `wrap`             | `ts wrap`               | Force soft-wrap.                 |
| `frame="..."`      | `bash frame="terminal"` | Frame style.                     |

Repo-local Shiki language aliases (defined in `content.config.ts`):

| Alias        | Maps to     |
| ------------ | ----------- |
| `redis`      | `bash`      |
| `vcl`        | `nginx`     |
| `promql`     | `plaintext` |
| `logql`      | `plaintext` |
| `bind`       | `nginx`     |
| `dns`        | `ini`       |
| `cql`        | `sql`       |
| `properties` | `ini`       |
| `m3u8`       | `bash`      |
| `asciidoc`   | `markdown`  |

Common mistakes:

- Bare `{5}` instead of `mark={5}`.
- `file=file.ts` instead of `title="file.ts"`.
- Omitting the language identifier when using meta.

### Code tabs

Multiple code fences in a row with matching `title="..."` get auto-grouped into tabs (`rehype-code-tabs`). The runtime in `@pagesmith/site/runtime/code-tabs` wires the switching.

### Images and figures

- Use markdown image syntax. **Do not** use raw `<img>`, `<picture>`, or `<figure>` HTML — the local repo validator (`validate-pagesmith.ts`) sets `forbidHtmlImgTag: true`.
- Caption via the title attribute: `![alt](./assets/x.png "caption")` becomes `<figcaption>caption</figcaption>`.
- `requireAltText: true` — every image needs alt text.
- Local raster images automatically get `<picture>` with AVIF + WebP `<source>` variants and intrinsic dimensions.
- SVGs are passed through without format conversion.

### Themed (light/dark) image pairs — diagrams

Consecutive markdown images whose filenames end in `-light` and `-dark` are auto-merged into a single themed `<figure class="ps-figure ps-figure-themed">`. **Both variants must be present** — a lone one throws.

```md
![High-level request flow](./diagrams/request-flow-light.svg "How requests move through the system.")
![High-level request flow](./diagrams/request-flow-dark.svg)
```

The repo's `validate-pagesmith.ts` sets `requireThemeVariantPairs: true`, so missing pairs fail validation.

### Links

- `linkValidator` flags bare URLs, empty link text, and suspicious protocols.
- External links (`http://`, `https://`) get `target="_blank" rel="noopener noreferrer"` automatically.
- Internal links should resolve to real markdown entries; the repo runs `internalLinksMustBeMarkdown: true`.
- Use canonical `./relative/path.md` form for in-repo cross-refs.

### Emojis

Unicode emojis in prose are auto-wrapped in `<span role="img" aria-label="...">`. Just use the character.

## Validation feedback loop

After writing or revising, run:

```bash
npm run validate:content   # @pagesmith/site content validators (alt text, links, theme pairs, schema)
npm run validate           # config + collections + cross-file refs
```

Common errors and fixes:

- `MISSING_ALT_TEXT` → add alt text to every image.
- `THEME_VARIANT_PAIR` → ensure both `-light` and `-dark` images sit consecutively.
- `INTERNAL_LINK_NOT_MARKDOWN` → use `./path.md` form to a real entry.
- `HTML_IMG_TAG` → switch to markdown image syntax.
- `linkValidator` bare-URL → wrap as `[text](url)`.
- `headingValidator` skip → re-introduce the missing heading level or restructure.
- `codeBlockValidator` no-lang → add the language to the fence.

For diagram-related warnings (e.g. low contrast), do not edit the SVG — hand off to `node_modules/diagramkit/skills/diagramkit-review/SKILL.md`.

## Operating rules

- Use the upstream `markdown-guidelines.md` as the source of truth — this skill is a project-flavored summary, not a replacement.
- Write for sujeet.pro's editorial bar (senior engineers; trade-offs, constraints, ROI).
- Do not introduce features that the pipeline does not support; the validators will reject them.
- Do not edit generated SVGs or hand-author `<picture>` / `<figure>` / `<img>` HTML.
