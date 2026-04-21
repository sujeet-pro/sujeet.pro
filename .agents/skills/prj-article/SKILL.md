---
name: prj-article
description: Create, update, or review deep, research-backed technical articles in content/articles for sujeet.pro. Use when the user asks for an article, deep dive, series entry, or staff/principal-level technical writing. The bar is: authoritative sources, in-depth coverage of the non-obvious, plain explanations of the common, and a diagram for every section that benefits from one.
---

# prj-article — deep technical articles for sujeet.pro

Articles are deep, research-backed, diagram-heavy technical documents written for senior engineers (staff/principal). They live at `content/articles/<slug>/README.md` with sibling `diagrams/` and `assets/` folders.

This skill is the project wrapper. It defines:

- The **research protocol** (source hierarchy, evidence buckets, validation gate).
- The **authoring protocol** (audience, depth, structure, voice).
- The **diagram protocol** — handed off to [`../prj-diagrams/SKILL.md`](../prj-diagrams/SKILL.md).
- The **publication protocol** (companion metadata, validators).

The repo-wide markdown / content / packaging detail lives in `ai-guidelines/` and `node_modules/@pagesmith/**`; this file points at them but does not duplicate them.

## Read first

Read in order, then come back here for the project-specific workflow:

1. `ai-guidelines/README.md`
2. `ai-guidelines/content-structure.md` — folder layout, required frontmatter, citation bar, series rules.
3. `ai-guidelines/markdown.md` — local markdown rules (allowed code-block meta, language aliases, themed-image pairs, validator expectations).
4. `ai-guidelines/diagrams.md` — when to draw, where source files live, how to embed.
5. `ai-guidelines/packages.md` — current Pagesmith / diagramkit integration map.
6. `ai-guidelines/workflows/article-workflow.md` — the canonical create/update/review playbook.

## Always cross-load these package skills

These are the version-pinned upstream skills you must read whenever you touch markdown features, the content layer, or diagrams:

- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md` — full markdown feature reference (GFM, GitHub alerts, math, smart typography, code-block meta, themed-image pair merging, footnotes, autolinks).
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/usage.md` — agent rules for the content layer.
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/errors.md` — error catalogue when validation fails.
- `node_modules/@pagesmith/core/REFERENCE.md` — `ContentLayer`, `defineCollection`, schemas, markdown pipeline order.
- `node_modules/@pagesmith/site/REFERENCE.md` — site config schema, validators (`validateContent`, `validateBuildOutput`), CSS/runtime entry points.
- `node_modules/diagramkit/REFERENCE.md` and `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md` — engine routing and the per-engine skills.

Do **not** use those upstream skills directly for diagram authoring inside this repo. Always go through [`../prj-diagrams/SKILL.md`](../prj-diagrams/SKILL.md), which wires them into the project's defaults (`sameFolder: true`, dual-theme SVGs, manifest-backed render, repo audit commands).

## Audience and depth contract

- **Reader**: senior engineer — staff, principal, or experienced specialist. Assume strong fundamentals.
- **Goal**: build the strongest possible mental model in a single read, then act as a reference.
- **Depth rule**: go deep on the non-obvious; stay short on the well-known.
  - Common, well-trodden items → 1–3 sentence plain-English explanation, then move on. Do not pad.
  - Non-obvious mechanisms, internals, trade-offs, failure modes, edge cases → expand fully, with diagrams, tables, and citations.
- **Voice**: precise, opinionated when warranted, never hand-wavy. Prefer the engineering verb ("the scheduler preempts", "the kernel coalesces") over the marketing verb ("powers", "enables").
- **Length**: a 20–30 minute read is normal. If the draft drifts into multiple unrelated subtopics, stop and propose a series — see `ai-guidelines/content-structure.md` (Series).

## Research protocol (mandatory before drafting)

Articles must be grounded in **authoritative** sources. Do not draft from memory.

### 1. Source hierarchy (always cite the strongest available)

Use this priority order. A higher tier overrides a lower one when they conflict; lower tiers are only acceptable when higher tiers are silent.

| Tier | Source class                                                                                                                  | Examples                                                                                                                                                                                                                                  |
| ---: | :---------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | **Standards / specifications** — RFCs, ISO/IEC standards, W3C / WHATWG specs, ECMA standards, IETF drafts, language spec docs | RFCs (e.g. RFC 9110 HTTP, RFC 8446 TLS 1.3), ECMA-262, ECMA-402, WHATWG HTML / DOM / Fetch / URL / Streams, W3C CSS specs, TC39 proposals (stage matters), POSIX, SQL:2023, OAuth 2.1 draft                                               |
|    2 | **First-party official documentation**                                                                                        | Node.js docs, V8 / Blink / Gecko / WebKit design docs, Linux kernel docs, Postgres / Redis / Kafka / Cassandra docs, AWS / GCP / Azure service docs, framework docs (React, Vue, Svelte, Next.js), browser vendor docs, CNCF project docs |
|    3 | **Peer-reviewed academic papers and primary-source engineering papers**                                                       | Dynamo, Spanner, BigTable, MapReduce, Raft, Paxos, CRDTs (Shapiro et al.), TLA+ specs, USENIX / SOSP / OSDI / VLDB / SIGMOD papers                                                                                                        |
|    4 | **Secondary authoritative references** (vendor-neutral, expert-reviewed)                                                      | MDN Web Docs, web.dev, HTTP Archive Almanac, Mozilla Hacks, Chrome for Developers, browser engineers' technical posts on official sites                                                                                                   |
|    5 | **Primary-source practitioners** — engineering blogs from the team that built the system                                      | Netflix Tech Blog, Uber Engineering, Stripe Engineering, Cloudflare Blog, Discord, Figma, Shopify, GitHub, LinkedIn, Meta, Google Research                                                                                                |
|    6 | **Well-regarded technical writers and books**                                                                                 | Designing Data-Intensive Applications, High Performance Browser Networking, official conference talks (V8 team at JSConf, etc.)                                                                                                           |
|    7 | **Independent blogs / community content**                                                                                     | Use **only** when the claim cannot be verified from tiers 1–6. Treat as a lead, not as evidence. Cross-validate against an upper tier before citing.                                                                                      |

### 2. Topic → authoritative source map (start here, then expand)

Use this as the default starting set per topic family. Always check for a newer or more specific source.

| Topic                         | Tier-1 / Tier-2 starting points                                                                                            |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| JavaScript language           | ECMA-262 (latest), ECMA-402, TC39 proposals, MDN JavaScript reference                                                      |
| TypeScript                    | TypeScript Handbook (typescriptlang.org), TypeScript GitHub (release notes, design notes)                                  |
| HTML / DOM                    | WHATWG HTML Living Standard, WHATWG DOM Standard, MDN, web.dev                                                             |
| CSS                           | W3C CSS specs (per module — Selectors, Cascade, Containment, Houdini), MDN CSS reference, CSS Working Group drafts         |
| Browser internals / rendering | Chrome for Developers, V8 blog, web.dev, Mozilla Hacks, WebKit blog, browser source design docs                            |
| Node.js / runtime             | nodejs.org docs, libuv docs, V8 docs, Node release notes                                                                   |
| HTTP / networking             | RFCs (9110, 9111, 9112, 9113, 9114, 9000–9002 for QUIC, 8446 for TLS 1.3), MDN HTTP, Cloudflare blog                       |
| DNS                           | RFCs (1034, 1035, 6891, 7858, 8484, 8499), IANA, Cloudflare / Google DNS docs                                              |
| Security                      | OWASP project pages, NIST publications, IETF security RFCs, vendor security docs                                           |
| Auth                          | RFC 6749 / 6750 / 7519 / 8252 / 9068 / OAuth 2.1 draft, OpenID Connect Core, vendor docs (Auth0, Okta) for ergonomics only |
| Databases                     | Vendor docs (Postgres / MySQL / MongoDB / Cassandra / DynamoDB), original papers (Dynamo, Spanner, etc.), Jepsen analyses  |
| Distributed systems           | Original papers (Paxos, Raft, CRDTs, Calvin, Spanner), DDIA, Jepsen, vendor docs                                           |
| Caching / CDN                 | RFC 9111, vendor docs (Varnish, Cloudflare, Fastly, Akamai), web.dev caching guide                                         |
| Performance / Core Web Vitals | web.dev, Chrome for Developers, HTTP Archive Almanac, browser vendor RUM docs                                              |
| Streaming / messaging         | Kafka / Pulsar / NATS / Redpanda docs, Confluent engineering blog, original Kafka paper, RabbitMQ docs                     |
| Cloud architecture            | AWS Well-Architected, Google SRE Book / Workbook, Azure Architecture Center, vendor service docs                           |
| Accessibility                 | WCAG 2.2 (W3C), ARIA Authoring Practices Guide, MDN accessibility, web.dev accessibility                                   |
| React / framework internals   | Official docs, framework RFCs (e.g. React RFC repo), maintainer blog posts, conference talks                               |

### 3. Research workflow

Before writing a single sentence of prose:

1. **Define the question and the success bar.** Restate the article's thesis in one sentence and list the 5–10 questions a senior engineer would want answered.
2. **Tier-1 sweep.** Pull the relevant specs / RFCs / standards. Read the parts you will actually cite — not the abstract, the actual normative section.
3. **Tier-2 sweep.** Pull the official docs and the canonical source-design docs (V8, Blink, etc.). Note where the docs disagree with or extend the spec.
4. **Tier-3 + Tier-4 sweep.** Pull the foundational papers and the secondary-authoritative references (MDN, web.dev). Note version-specific or browser-specific behavior.
5. **Tier-5/6 sweep.** Pull primary-source practitioner write-ups for production reality, scale numbers, postmortems.
6. **Tier-7 cross-validation.** If you have to use a community blog, find at least one upper-tier source that confirms the same claim. If you cannot, drop the claim.
7. **Bucket every finding** as one of:
   - `Verified` — supported by a Tier-1 to Tier-3 source, or a Tier-4 source that aligns with primary specs.
   - `Inferred` — strong conclusion from partial evidence; mark explicitly in your notes; only include in the article if it adds value and is flagged as "in practice" / "typically".
   - `Rejected` — cannot be verified or actively contradicted by an upper tier; do not include.
8. **Capture the citation as you go.** URL + section anchor + access date. Do not backfill citations after drafting — claims silently drift when you do.
9. **Surface conflicts.** When upper-tier sources disagree (e.g., spec says X, browser implements Y), make this explicit in the article instead of picking a side silently.

> [!IMPORTANT]
> Research artifacts — link dumps, claim ledgers, scratch notes — go under `.temp/article-research/<slug>/` (gitignored). Never commit them and never inline an unfiltered link dump into the article.

### 4. Anti-patterns

- Citing memory or "general knowledge" as fact.
- Citing a community blog when an RFC or official doc covers the same claim.
- Citing a Stack Overflow answer as primary evidence.
- Compressing uncertainty into confident language ("X is always Y").
- Hand-waving past version- or browser-specific behavior.
- Fabricating URLs or section anchors.
- Skipping the spec because the doc is "easier to read" — read both.

## Required frontmatter

```yaml
---
title: "Title used for SEO and listing cards"
description: "One-line summary used for SEO and listing cards"
publishedDate: 2026-03-15
lastUpdatedOn: 2026-03-20
tags: [topic-a, topic-b]
draft: true # optional
---
```

Hard rules (enforced by `schemas/frontmatter.ts`):

- Do **not** set `layout` or `category` in article or blog frontmatter.
- The visible page title is the markdown `# H1`, **not** the frontmatter `title`. Use exactly one `# H1` and keep heading depth sequential.
- Always update `lastUpdatedOn` on a meaningful edit.
- Tags are kebab-case strings against the canonical taxonomy in `content/tags.json5`. Add a new tag entry there before introducing a brand-new topic tag.
- Optional title overrides (`seoTitle`, `cardTitle`, `linkTitle`) — see `ai-guidelines/content-structure.md` for when each is appropriate.

## Article structure (default spine)

Use this as the default; deviate only when the topic genuinely calls for a different shape.

1. `# H1` title.
2. **One-paragraph thesis** — what the article argues, who it's for, what they will be able to do after reading it. No preamble, no "in this article we will".
3. **Overview diagram** near the top whenever the topic has architecture, flow, or system boundaries worth visualizing. Render via [`../prj-diagrams/SKILL.md`](../prj-diagrams/SKILL.md).
4. **Mental model** — the smallest set of concepts a senior reader needs to follow the rest. Define terms exactly once.
5. **Main sections** with clear `##` and `###` hierarchy. Each major section either contains a diagram, a table, a code example, or has a clear reason not to.
6. **Trade-offs / decision matrix** — when the topic has more than one viable approach, surface the criteria as a table.
7. **Failure modes / operational implications** — what breaks, how it breaks, how you detect and recover.
8. **Practical takeaways** — heuristics, defaults, when to revisit. No throat-clearing summary.
9. **References / footnotes** — when citation density would clutter inline links.

### Depth-vs-skim within a section

For each substantial concept, decide its weight before drafting:

- **Skim weight**: it is universally known to your audience. One short paragraph or a sentence with a link to a tier-1/2 source. Move on.
- **Deep weight**: it is non-obvious, version-dependent, easy to get wrong, or where the article's value lives. Expand with mechanism, diagram, code or pseudocode, edge cases, and citations.

If every section ends up "deep weight", the article is probably two articles — split it into a series.

## Diagrams

Diagram authoring, rendering, embedding, and auditing are owned by [`../prj-diagrams/SKILL.md`](../prj-diagrams/SKILL.md). This skill only sets the editorial expectations for when a diagram is required.

### When to draw

- **Always** for: architecture, request flow, sequence, state machines, lifecycle, data layout, memory layout, build/render pipelines, rollout / migration timelines, decision trees with more than two branches, comparisons across more than two dimensions.
- **Usually** for: any non-obvious mechanism described in 3+ paragraphs of prose.
- **Sometimes** for: trade-off comparisons (a table is often better than a quadrant diagram).
- **Rarely** for: simple lists, single-axis comparisons, code that already reads as a diagram.

### Picking the engine

Route through `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md` (via `../prj-diagrams/SKILL.md`):

| Need                                          | Engine     |
| :-------------------------------------------- | :--------- |
| Flowchart, sequence, state, ER, gantt, class  | Mermaid    |
| Freeform, hand-drawn, conceptual sketches     | Excalidraw |
| Dense infrastructure, cloud icons, BPMN       | draw.io    |
| Algorithmic graph layouts (DAGs, large trees) | Graphviz   |

### Embedding

Always use consecutive light/dark markdown images so Pagesmith auto-merges them into a themed `<figure>`:

```md
![High-level request flow](./diagrams/request-flow-light.svg "How requests move through the system.")
![High-level request flow](./diagrams/request-flow-dark.svg)
```

Caption goes on the **light** image's title attribute. Both variants must be present and consecutive. Never edit the rendered SVG — edit the source and re-render. For repo-wide audits or contrast issues, hand off to `../prj-diagrams/SKILL.md` (which delegates to `node_modules/diagramkit/skills/diagramkit-review/SKILL.md`).

## Markdown features available in this project

The full feature surface is documented upstream (read `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md`). The features you should actively reach for in articles:

| Feature                                                                                                                                 | Use when                                                                                                            |
| :-------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| GFM tables (`\| col \|`)                                                                                                                | Trade-offs, comparisons, capacity numbers, decision matrices.                                                       |
| GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`)                                                       | Sparingly — to flag a footgun, an op-time risk, or a non-obvious assumption.                                        |
| Footnotes (`[^1]`)                                                                                                                      | Dense citations and source links that would clutter prose.                                                          |
| Math (`$...$`, `$$...$$`)                                                                                                               | Latency / throughput / probability formulas; rendered via MathJax (`markdown.math: 'auto'` in `content.config.ts`). |
| Code blocks with meta — `title="..."`, `showLineNumbers`, `mark={3,5-7}`, `ins={4}`, `del={5}`, `collapse={1-5}`, `wrap`, `frame="..."` | File-anchored snippets, before/after diffs, focus highlights.                                                       |
| Themed light/dark image pairs (consecutive `-light` then `-dark`)                                                                       | All diagrams. **Both variants must be present** — a lone `-light` or `-dark` throws.                                |
| Auto-merged figure with caption                                                                                                         | Use the markdown title attribute on the **light** image: `![alt](./diagrams/x-light.svg "caption")`.                |
| `rehype-local-images` (intrinsic dimensions, AVIF/WebP `<picture>`)                                                                     | Use markdown image syntax, not raw `<img>` / `<figure>` / `<picture>` HTML.                                         |
| Heading auto-anchors + autolinks                                                                                                        | Free; use them to support deep linking from other articles.                                                         |

Repo-local Shiki language aliases (defined in `content.config.ts`) you can use in fences: `redis`, `vcl`, `promql`, `logql`, `bind`, `dns`, `cql`, `properties`, `m3u8`, `asciidoc`.

Code-block meta gotchas:

- `mark={5}`, never bare `{5}`.
- `title="file.ts"`, never `file=file.ts`.
- Always specify the language when using meta — `codeBlockValidator` warns otherwise.

## Citations

- Every non-trivial factual or technical claim needs support. "Common knowledge to senior engineers" is not a citation.
- Prefer inline links for sources that fit the prose; footnotes for dense citation lists at the end of a section.
- Cite the strongest available source per the source hierarchy above.
- For specs, deep-link the section anchor, not the spec home page.
- For RFCs, prefer the IETF datatracker URL over mirrors.
- For browser internals, prefer the source-design doc or the engine-team blog post over a third-party summary.
- Include the **publication or retrieval date** in your research notes; if a claim is version- or year-sensitive, surface that in the prose itself.
- If a claim cannot be verified, do not include it.

## Project metadata that often needs to change in the same PR

Articles do not live in isolation. When the article's identity, slug, or placement changes, update in the same change set:

- `content/articles/meta.json5` — manual order, series membership, series copy.
- `content/home.json5` — `featuredArticles` and `featuredSeries` slug references on the homepage hero.
- `content/redirects.json5` — vanity URLs and legacy slug redirects.
- `content/articles/README.md` — listing intro / grouping copy.
- `content/tags.json5` — when the article introduces a new canonical tag.
- `content/meta.json5` — top-level nav and footer chrome (rare; only if the article should be linked from global chrome).

The full cross-reference check runs in `scripts/validate.ts` (and again, more strictly, in `scripts/validate-pagesmith.ts`). When unsure, run `npm run validate` and let it tell you.

## Workflow

### Mode hints

- **create** — new topic or slug. Create the entry folder, the README.md, the `diagrams/` folder, and update `content/articles/meta.json5` (and `content/home.json5` if featured) in the same change.
- **update** — existing article path or explicit update request. Preserve voice; fix correctness first, then structure, then clarity.
- **review** — quality pass without committing edits. Produce a written critique; do not modify content.

### Step-by-step (create / update)

1. **Frame the article.** Slug, one-sentence thesis, audience, success bar (the 5–10 questions the article must answer). Decide whether it fits an existing series.
2. **Run the research protocol** (above). Build a claim ledger in `.temp/article-research/<slug>/claims.md` with each claim, source URL, source tier, and bucket.
3. **Outline the spine.** Headings only — no prose. Mark each section as skim-weight or deep-weight. Mark which sections need diagrams; queue the diagram list for `prj-diagrams`.
4. **Draft.** Write top-down. Add citations inline as you write, not after. Reach for tables and diagrams the moment a paragraph starts enumerating dimensions.
5. **Diagram.** Hand off each queued diagram to [`../prj-diagrams/SKILL.md`](../prj-diagrams/SKILL.md). Re-render with `npm run diagrams`. Verify that every section flagged in step 3 has its diagram embedded with a caption.
6. **Self-review.** Use the review checklist below. Pay special attention to: any unverified claim, any "deep weight" section that turned shallow, any section without a diagram or a clear reason not to have one.
7. **Update companion metadata** (see list above).
8. **Validate.** Run the validation set below. Fix issues; do not silence them.
9. **Update `lastUpdatedOn`.**

### Review checklist

Use the same bar for both new articles and updates.

- **Correctness.** Every non-trivial claim has a tier-appropriate citation. No fabricated URLs. No stale version-specific claims.
- **Source quality.** No claim leans solely on a tier-7 source where an upper-tier source exists.
- **Audience fit.** Is depth applied where it matters? Are common items short and clear? Could a senior engineer skim the simple parts and still trust the deep parts?
- **Structure.** One coherent subtopic. Sequential heading depth. Mental model section establishes terms before they are used.
- **Diagrams.** Overview diagram present where warranted. Each substantial section either has a diagram or has a clear reason not to. Both `-light` and `-dark` variants present.
- **Trade-offs.** Real engineering criteria, failure modes, and operational implications are present and explicit.
- **Voice.** No throat-clearing, no marketing verbs, no padding.

## Validation before declaring done

Use the smallest relevant set, in this order:

```bash
npm run diagrams                       # re-render any changed diagrams
npm run validate                       # config + collections + cross-file refs
npm run validate:content               # @pagesmith/site content validators only
npm run validate:diagrams              # diagramkit validate (SVG + WCAG 2.2 AA)
npm run validate:full                  # full content + build + project cross-refs
npm run build && npm run validate:dist # only when adjusting layouts, redirects, or build-touching config
vp check                               # any code/schema/AI-doc changes
```

If `validate:full` flags `LOW_CONTRAST_TEXT` on a diagram, hand off to `../prj-diagrams/SKILL.md` (which delegates to `node_modules/diagramkit/skills/diagramkit-review/SKILL.md`) — never edit the SVG directly.

## Hard rules

- Research before drafting. Cite every non-trivial claim. Prefer the highest-tier source.
- Distinguish `Verified` / `Inferred` / `Rejected` while researching. Drop anything that stays unverified.
- Surface conflicts between sources explicitly; do not silently pick a side.
- Treat the article markdown, its companion `meta.json5`, `home.json5`, `tags.json5`, and `redirects.json5` as one change set when slug, series membership, tags, or homepage placement changes.
- Diagrams are mandatory wherever the topic warrants them; route all diagram work through `../prj-diagrams/SKILL.md`.
- Use exactly one `# H1`, sequential heading depth, and update `lastUpdatedOn` on every meaningful edit.
- Never edit a generated SVG or hand-author `<picture>` / `<figure>` / `<img>` HTML.
- Never commit research scratch under `.temp/`.

## Operating heuristics

- Articles are deep — 20–30+ minute reads are normal. If a draft drifts into multiple unrelated subtopics, propose splitting it into a series and update `content/articles/meta.json5` accordingly.
- A spec disagreement with a docs site is itself worth writing about — surface it.
- A primary-source practitioner postmortem usually beats a third-party retelling. Find the original.
- When you would otherwise paste a long quote from a spec, prefer summarizing in your own words and citing the section anchor.
- When a topic is moving fast (e.g. an active TC39 proposal, a draft RFC), date-stamp the claim in prose ("As of TC39 Stage 3 in 2026-Q1, …").
