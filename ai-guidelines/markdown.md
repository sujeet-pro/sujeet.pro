# Markdown Guidelines

Extended markdown reference for sujeet.pro. Based on `@pagesmith/core` markdown pipeline with site-specific additions for frontmatter, diagrams, and citations.

For the upstream source: `../pagesmith/ai-guidelines/markdown-guidelines.md`

## Pipeline Order

```
remark-parse → remark-gfm → remark-math → remark-frontmatter
  → remark-github-alerts → remark-smartypants → [user remark plugins]
  → lang-alias transform → remark-rehype
  → rehype-mathjax (must run before Expressive Code so math is rendered to SVG first)
  → rehype-expressive-code (dual themes, line numbers, titles, copy, collapse, mark/ins/del)
  → rehype-slug → rehype-autolink-headings
  → rehype-external-links → rehype-accessible-emojis
  → heading extraction → [user rehype plugins] → rehype-stringify
```

## GitHub Flavored Markdown (remark-gfm)

### Tables

```md
| Left | Center | Right |
| :--- | :----: | ----: |
| L    |   C    |     R |
```

### Strikethrough

```md
~~deleted text~~
```

### Task Lists

```md
- [x] Completed task
- [ ] Pending task
```

### Footnotes

```md
Content with a footnote[^1].

[^1]: This is the footnote content.
```

## GitHub Alerts (remark-github-alerts)

Five alert types:

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
```

## Math (remark-math + rehype-mathjax)

Inline: `$E = mc^2$` — no spaces inside delimiters.

Block:

```md
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$
```

## Smart Typography (remark-smartypants)

| Input     | Output  | Description         |
| --------- | ------- | ------------------- |
| `"hello"` | "hello" | Curly double quotes |
| `'hello'` | 'hello' | Curly single quotes |
| `--`      | –       | En dash             |
| `---`     | —       | Em dash             |
| `...`     | …       | Ellipsis            |

Code blocks and inline code are not affected.

## External Links (rehype-external-links)

Absolute URLs (`http://`, `https://`) get `target="_blank"` and `rel="noopener noreferrer"`. Relative links stay in the same tab.

## Accessible Emojis (rehype-accessible-emojis)

Unicode emojis are automatically wrapped with `role="img"` and `aria-label`.

## Heading Links (rehype-slug + rehype-autolink-headings)

All headings get a URL-safe `id` and are wrapped in anchor links.

| Heading                 | Generated slug     |
| ----------------------- | ------------------ |
| `## Getting Started`    | `getting-started`  |
| `## What's New in v2?`  | `whats-new-in-v2`  |
| `## API Reference (v3)` | `api-reference-v3` |

## Expressive Code

Syntax highlighting with dual themes (`github-light` / `github-dark`). All styling and copy buttons are injected inline.

### Code Block Meta Syntax

| Meta                | Example                                     | Description                              |
| ------------------- | ------------------------------------------- | ---------------------------------------- |
| `title="..."`       | ` ```js title="app.js" `                    | File title above code block              |
| `showLineNumbers`   | ` ```js showLineNumbers `                   | Show line numbers                        |
| `startLineNumber=N` | ` ```js showLineNumbers startLineNumber=5 ` | Start numbering at N                     |
| `mark={lines}`      | ` ```js mark={3,5-7} `                      | Highlight lines                          |
| `ins={lines}`       | ` ```js ins={4} `                           | Mark as inserted (green)                 |
| `del={lines}`       | ` ```js del={5} `                           | Mark as deleted (red)                    |
| `collapse={lines}`  | ` ```js collapse={1-5} `                    | Collapse lines by default                |
| `wrap`              | ` ```js wrap `                              | Enable text wrapping                     |
| `frame="..."`       | ` ```js frame="terminal" `                  | Frame style: none, code, terminal, lines |

### Language Aliases (site-specific)

Configured in `pagesmith.config.ts`:

| Alias        | Maps To     |
| ------------ | ----------- |
| `redis`      | `bash`      |
| `vcl`        | `nginx`     |
| `promql`     | `plaintext` |
| `logql`      | `plaintext` |
| `bind`       | `nginx`     |
| `dns`        | `ini`       |
| `cql`        | `sql`       |
| `properties` | `ini`       |

## Built-in Content Validators

Three validators run automatically on markdown collections:

- **linkValidator** — warns on bare URLs, empty link text, suspicious protocols
- **headingValidator** — enforces single H1, sequential heading depth
- **codeBlockValidator** — warns on missing language, unknown meta properties

Known valid meta: `title`, `showLineNumbers`, `startLineNumber`, `wrap`, `frame`, `collapse`, `mark`, `ins`, `del`.

<!-- site-specific -->

## Site-Specific: Frontmatter

All content uses `BaseFrontmatterSchema` from `@pagesmith/core`:

```yaml
---
title: "Title" # Required — used for SEO, RSS, listing cards
description: "One-line summary" # Required — used for meta tags and cards
publishedDate: 2026-03-15 # Required — ISO date
lastUpdatedOn: 2026-03-20 # Required — ISO date (update on every edit)
tags: [topic-a, topic-b] # Required — at least one tag
draft: true # Optional — excludes from build
---
```

**Do NOT set** `layout` or `category` in frontmatter. Layouts are resolved from `meta.json5`.

**Title and description are NOT rendered** on the content page. The markdown H1 is the visible title.

## Site-Specific: Diagram References

Use `<picture>` tags for dark mode support (see `ai-guidelines/diagrams.md`):

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./diagrams/name-dark.svg" />
  <img src="./diagrams/name-light.svg" alt="Descriptive alt text" />
</picture>
```

## Site-Specific: Citations

For articles, every factual statement needs a source. Two formats:

**Inline:**

```md
According to the [ECMAScript specification](https://tc39.es/ecma262/), ...
```

**Footnote:**

```md
The event loop processes microtasks before macrotasks[^1].

[^1]: [WHATWG HTML Living Standard](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
```

<!-- /site-specific -->

## Quick Reference

| Feature          | Syntax                    | Plugin                   |
| ---------------- | ------------------------- | ------------------------ |
| Bold             | `**bold**`                | built-in                 |
| Italic           | `*italic*`                | built-in                 |
| Inline code      | `` `code` ``              | built-in                 |
| Link             | `[text](url)`             | built-in                 |
| Image            | `![alt](src)`             | built-in                 |
| Blockquote       | `> quote`                 | built-in                 |
| Table            | `\| col \| col \|`        | remark-gfm               |
| Strikethrough    | `~~text~~`                | remark-gfm               |
| Task list        | `- [x] done`              | remark-gfm               |
| Footnote         | `[^id]` + `[^id]: text`   | remark-gfm               |
| Inline math      | `$E = mc^2$`              | remark-math              |
| Block math       | `$$...$$`                 | remark-math              |
| Alert            | `> [!NOTE]`               | remark-github-alerts     |
| Code title       | ` ```js title="f.js" `    | rehype-expressive-code   |
| Line numbers     | ` ```js showLineNumbers ` | rehype-expressive-code   |
| Line highlight   | ` ```js mark={1-3} `      | rehype-expressive-code   |
| External link    | `[text](https://...)`     | rehype-external-links    |
| Heading anchor   | auto `id` + link          | rehype-slug              |
| Accessible emoji | auto-wrapped              | rehype-accessible-emojis |

## Key Rules

1. Use fenced code blocks with a language identifier (validator warns otherwise)
2. Do NOT add manual copy-button JS — Expressive Code handles it
3. Do NOT import separate code block CSS — Expressive Code injects inline styles
4. One `# H1` per page (validator enforces)
5. Sequential heading depth (no skipping from H2 to H4)
6. Prefer relative links for internal content
7. Absolute URLs get external link treatment (new tab)
