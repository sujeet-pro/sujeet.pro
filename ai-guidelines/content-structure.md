# Content Structure

Canonical content model for `sujeet.pro`.

This repo is primarily for `articles` and `blogs`. The `projects` collection still exists in the codebase, but it is being phased out. Do not create new project entries unless the user explicitly asks.

## Editorial bar

- Write for senior engineers: staff, principal, and similarly experienced readers.
- Optimize for practical decision-making, not generic tutorials or academic summaries.
- Emphasize constraints, trade-offs, engineering effort, operational reality, and ROI.
- Both articles and blogs must be technically and factually correct.
- Most substantial sections should either include a diagram or have a clear reason not to.

## Shared requirements

Entry pages use folder-based content:

```text
content/<type>/<slug>/
  README.md
  diagrams/
  assets/
```

Use this frontmatter for article and blog entries:

```yaml
---
title: "Canonical title — fallback for every other title field"
seoTitle: "Optional override used in <title> and OpenGraph"
cardTitle: "Optional punchier title for listing cards"
linkTitle: "Optional short title for sidebar / breadcrumb / prev-next"
description: "One-line summary used for SEO and listing cards"
publishedDate: 2026-03-15
lastUpdatedOn: 2026-03-20
tags: [topic-a, topic-b]
draft: true # Optional
---
```

Rules:

- Do not set `layout` or `category` in article or blog frontmatter.
- The visible page title is the markdown `# H1`, not the frontmatter `title`.
- Use exactly one `# H1`.
- Keep heading depth sequential.
- Update `lastUpdatedOn` on every meaningful edit.
- Store diagram source files in a sibling `diagrams/` directory.
- Store supporting images in a sibling `assets/` directory.

### Title field semantics

`title` is the only required title field; the other three are optional and
each falls back to `title` whenever it is missing. Use them when the chrome
that surfaces the title has different ergonomic constraints than the body.

| Field       | Where it surfaces                                      | When to set                                                                                                                                |
| :---------- | :----------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| `title`     | Markdown `# H1`, fallback for every other field        | Always.                                                                                                                                    |
| `seoTitle`  | `<title>`, OpenGraph, Twitter card                     | When the SEO title should differ from the body title — usually a longer, keyword-rich variant that would not read well as the page header. |
| `cardTitle` | Listing-page cards, homepage rails                     | When a punchier or shorter title scans better in dense listings.                                                                           |
| `linkTitle` | Sidebar entries, breadcrumb leaf, prev/next navigation | When the canonical title is too long for navigation chrome. Prefer 2-4 words; use community short forms like `JS`, `CRP`, `Perf`.          |

Example for a CRP series article — full title in `title`, short `linkTitle`
for the sidebar / breadcrumb / prev-next chrome:

```yaml
---
title: "Critical Rendering Path: Commit"
linkTitle: "CRP: Commit"
description: "..."
---
```

The H1 in the markdown body still controls what the reader sees on the
page. Set `cardTitle` only when listings genuinely benefit; set `seoTitle`
only when SEO should diverge from the visible title.

### Tags and the canonical taxonomy

Tags live in entry frontmatter as a flat list of strings:

```yaml
tags: [javascript, performance, web-vitals]
```

The taxonomy itself is defined in `content/tags.json5`. Each canonical slug
declares a `displayName`, an optional `shortName`, and a list of `aliases`
that should normalise to it. Matching is case-insensitive and ignores
non-alphanumeric characters, so `JS`, `js`, `JavaScript`, `ecmascript`, and
`ES6` all collapse to the canonical `javascript` slug and render as
`JavaScript` in cards and content meta.

Rules:

- Prefer canonical slugs in frontmatter (`javascript`, not `js`). The alias
  system exists so legacy and contributor variants do not break — not as a
  license to invent new variants.
- Add a new entry to `content/tags.json5` whenever you introduce a new
  topic. Unknown tags still render with a title-cased fallback, but they do
  not consolidate with existing tags or get a custom display name.
- Keep tag lists tight: 3-6 tags per entry is typical. Tags should describe
  the topic, not the format (do not tag with `article`).

## Coordination files

Before creating, updating, or reviewing content, identify the companion metadata:

- `content/meta.json5` drives top-level nav and footer links.
- `content/articles/meta.json5` drives article listing behavior, ordering, and series definitions.
- `content/blogs/meta.json5` drives blog listing behavior and ordering.
- `content/home.json5` drives homepage hero copy and featured content.
- `content/redirects.json5` holds vanity URLs and legacy content redirects.
- `content/tags.json5` defines the canonical tag taxonomy (display names + aliases).

Rules:

- A single entry edit is not complete until you check whether one or more companion files also need to change.
- If a slug changes, update related section metadata, homepage references, and redirects in the same change.
- If an article joins, leaves, or reshapes a series, update `content/articles/meta.json5` alongside the article itself.
- For repo-wide reviews, audit frontmatter and coordinating JSON5 files together rather than file-by-file in isolation.

## Articles

Path: `content/articles/<slug>/README.md`

Articles are deep technical documents. A 20-30+ minute read is normal if the topic warrants it.

### Article expectations

- Cover one clear subtopic in depth instead of trying to cover an entire domain shallowly.
- Assume the reader is experienced and wants a strong mental model quickly.
- Start with an overview diagram near the top whenever the topic has architecture, flow, or system boundaries worth visualizing.
- Use section-level diagrams to explain non-trivial mechanisms, data flow, timelines, state transitions, or trade-offs.
- Prefer practical explanation over purely historical or academic framing.
- Include concrete decision criteria, failure modes, and operational implications.
- Use comparisons and tables when they clarify trade-offs.

### Article length and splitting

- Long articles are fine.
- If the draft drifts into multiple large subtopics, split it into a series of articles.
- Prefer one article per meaningful subtopic and link related articles through `content/articles/meta.json5`.
- A series should feel like a deliberate decomposition, not arbitrary fragmentation.

### Article structure

Suggested shape:

1. `# H1` title
2. Short introduction that frames the problem and the core mental model
3. Overview diagram near the top when the topic benefits from a black-box view
4. Main sections with clear `##` and `###` hierarchy
5. Detailed diagrams, tables, and code examples where they materially improve understanding
6. Closing section with practical takeaways, heuristics, or next-step guidance

### Article companion metadata

Check these whenever the article changes:

- `content/articles/meta.json5` for manual order, series membership, and series copy
- `content/home.json5` if the article is featured on the homepage
- `content/redirects.json5` if the slug or canonical path changes
- `content/articles/README.md` if the listing intro or grouping needs to reflect the new state

### Article citations

- Every non-trivial factual or technical claim needs support.
- Prefer inline links or footnotes.
- Cite the strongest available source, using this priority order:
  1. Official specifications
  2. Official documentation
  3. Academic papers
  4. Primary-source practitioners and maintainers
  5. Well-regarded technical writing with a strong accuracy track record
- If a claim cannot be verified, do not include it.

## Blogs

Path: `content/blogs/<slug>/README.md`

Blogs are shorter, more personal, and more top-of-mind than articles. A sub-15-minute read is the default target.

### Blog expectations

- First-person voice and opinions are fine.
- Blogs can focus on what you learned, what you changed, or how you now think about something.
- Even when the tone is personal, factual claims still need to be accurate.
- Do enough research to avoid hand-wavy or outdated claims.
- Add diagrams when they make the idea easier to understand, especially for flows, architecture, or before/after comparisons.

### Blog citation bar

- Cite anything non-obvious, externally sourced, numerical, standards-based, or likely to be challenged.
- Personal observations and opinions do not need citations unless they rely on external facts.
- When in doubt, cite.

### Blog companion metadata

Check these whenever the blog changes:

- `content/blogs/meta.json5` for listing behavior and ordering assumptions
- `content/home.json5` if the blog is explicitly surfaced from the homepage or other curated content
- `content/redirects.json5` if the slug or canonical path changes
- `content/blogs/README.md` if the listing intro should change

## Diagrams by content type

### Articles

- Prefer an overview diagram near the top for system-level topics.
- Add focused diagrams to most major sections when the mechanism is visual.
- A single article can have multiple diagrams. This is expected, not exceptional.

### Blogs

- Add at least one diagram when the post explains a mechanism, migration, architecture, or process.
- Skip diagrams only when the post is short and the concept is clearer in prose.

## Listing and home pages

### Article listing

Path: `content/articles/README.md`

- Listing page for articles
- Frontmatter: `title`, `description`, `tags` optional
- Section behavior comes from `content/articles/meta.json5`

### Blog listing

Path: `content/blogs/README.md`

- Listing page for blogs
- Frontmatter: `title`, `description`, `tags` optional
- Section behavior comes from `content/blogs/meta.json5`

### Home page

Path: `content/README.md`

- Frontmatter may include `layout: Home`
- Keep this limited to site-level homepage concerns, not article/blog entry rules
- Hero and featured content live in `content/home.json5`

## Series

Article series live in `content/articles/meta.json5`.

Use a series when:

- the topic is naturally multi-part
- each article can stand on its own
- readers benefit from ordered navigation

Do not force every article into a series.

## Legacy projects

The repo still contains:

- `content/projects/`
- existing project pages

Treat these as legacy until the repo is fully cleaned up. Do not expand project guidance in new skills or docs unless the user asks for that work explicitly.
