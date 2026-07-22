---
name: prj-article
description: Create, update, refactor, or review deep, research-backed technical articles in content/articles for sujeet.pro. Use when the user asks for an article, deep dive, series entry, staff/principal-level technical writing, or targets an existing article for the solution-evolution format. Design-space topics default to the solution-evolution spine — simplest working solution first, stressed with numbers, evolved stage by stage, with an operating-regime map, a staged adoption plan, and real-company case studies. Research, drafting, and fact-checking are delegated to the prj-article-* agents; every article passes a fact-check gate before it ships.
---

# prj-article — deep technical articles for sujeet.pro

Articles are deep, research-backed, diagram-heavy technical documents written for senior engineers (staff/principal). They live at `content/articles/<slug>/README.md` with sibling `diagrams/` and `assets/` folders.

This skill is the project wrapper. It defines:

- The **research protocol** (source hierarchy, evidence buckets, validation gate).
- The **authoring protocol** (audience, depth, structure, voice) — including the two article spines and how to pick between them.
- The **case-study protocol** (real-company examples that ground each design stage in production reality).
- The **agent roster** (dedicated `prj-article-*` subagents for research, drafting, and fact-checking).
- The **diagram protocol** — handed off to [`../prj-diagrams/SKILL.md`](../prj-diagrams/SKILL.md).
- The **publication protocol** (companion metadata, validators, the fact-check gate).

The repo-wide markdown / content / packaging detail lives in `ai-guidelines/` and `node_modules/@pagesmith/**`; this file points at them but does not duplicate them.

## Read first

Read in order, then come back here for the project-specific workflow:

1. `ai-guidelines/README.md`
2. `ai-guidelines/content-structure.md` — folder layout, required frontmatter, citation bar, series rules.
3. `ai-guidelines/markdown.md` — local markdown rules (allowed code-block meta, language aliases, themed-image pairs, validator expectations).
4. `ai-guidelines/diagrams.md` — when to draw, where source files live, how to embed.
5. `ai-guidelines/packages.md` — current Pagesmith / diagramkit integration map.
6. `ai-guidelines/workflows/article-workflow.md` — the canonical create/update/refactor/review playbook.

## Always cross-load these package skills

These are the version-pinned upstream skills you must read whenever you touch markdown features, the content layer, or diagrams:

- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md` — full markdown feature reference (GFM, GitHub alerts, math, smart typography, code-block meta, themed-image pair merging, footnotes, autolinks).
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/usage.md` — agent rules for the content layer.
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/errors.md` — error catalogue when validation fails.
- `node_modules/@pagesmith/core/REFERENCE.md` — `ContentLayer`, `defineCollection`, schemas, markdown pipeline order.
- `node_modules/@pagesmith/site/REFERENCE.md` — site config schema, validators (`validateContent`, `validateBuildOutput`), CSS/runtime entry points.
- `node_modules/diagramkit/REFERENCE.md` and `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md` — engine routing and the per-engine skills.

Do **not** use those upstream skills directly for diagram authoring inside this repo. Always go through [`../prj-diagrams/SKILL.md`](../prj-diagrams/SKILL.md), which wires them into the project's defaults (`sameFolder: true`, dual-theme SVGs, manifest-backed render, repo audit commands).

## Agent roster

Article work is split across three dedicated subagents defined in `.claude/agents/`. When running inside a harness that supports subagents (Claude Code), delegate to them; when it does not, perform the same roles inline, sequentially, with the same output contracts.

| Agent                    | Model | Role                                                                                                                                                     | Writes                                             |
| :----------------------- | :---- | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------- |
| `prj-article-researcher` | opus  | Runs the research protocol: tiered source sweep, claim ledger, case-study dossier.                                                                       | Only `.temp/article-research/<slug>/` (gitignored) |
| `prj-article-writer`     | fable | Drafts or refactors the article per this skill: spine selection, prose, tables, citation placement, diagram queue.                                       | `content/articles/<slug>/` and companion metadata  |
| `prj-article-reviewer`   | fable | Adversarial fact-check gate: verifies every claim against its cited source, recomputes arithmetic, validates references and company examples. Read-only. | Nothing — returns a findings report                |

Rules:

- The writer and reviewer must run on `fable` (or `opus` when fable is unavailable). Never route these roles to a smaller model — factual depth is the product.
- The reviewer is **mandatory** for create, update, and refactor. An article is not done until the reviewer returns zero `unsupported` / `contradicted` findings (see the fact-check gate below).
- The reviewer never edits content. Fixes go back through the writer (or the orchestrating session), then the changed sections are re-reviewed.
- Diagrams stay with the orchestrating session via [`../prj-diagrams/SKILL.md`](../prj-diagrams/SKILL.md); the writer only queues them (name, engine hint, what it must show).

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
5. **Tier-5/6 sweep.** Pull primary-source practitioner write-ups for production reality, scale numbers, postmortems. For a solution-evolution article, this sweep also fills the **case-study dossier** (see the case-study protocol below): who runs each stage's shape in production, at what scale, with what trade-off.
6. **Tier-7 cross-validation.** If you have to use a community blog, find at least one upper-tier source that confirms the same claim. If you cannot, drop the claim.
7. **Bucket every finding** as one of:
   - `Verified` — supported by a Tier-1 to Tier-3 source, or a Tier-4 source that aligns with primary specs.
   - `Inferred` — strong conclusion from partial evidence; mark explicitly in your notes; only include in the article if it adds value and is flagged as "in practice" / "typically".
   - `Rejected` — cannot be verified or actively contradicted by an upper tier; do not include.
8. **Capture the citation as you go.** URL + section anchor + access date. Do not backfill citations after drafting — claims silently drift when you do.
9. **Surface conflicts.** When upper-tier sources disagree (e.g., spec says X, browser implements Y), make this explicit in the article instead of picking a side silently.

> [!IMPORTANT]
> Research artifacts — link dumps, claim ledgers, case-study dossiers, scratch notes — go under `.temp/article-research/<slug>/` (gitignored). Never commit them and never inline an unfiltered link dump into the article.

### 4. Anti-patterns

- Citing memory or "general knowledge" as fact.
- Citing a community blog when an RFC or official doc covers the same claim.
- Citing a Stack Overflow answer as primary evidence.
- Compressing uncertainty into confident language ("X is always Y").
- Hand-waving past version- or browser-specific behavior.
- Fabricating URLs or section anchors.
- Skipping the spec because the doc is "easier to read" — read both.

## Case-study protocol (real companies, real trade-offs)

Readers trust an architecture when they can see it running somewhere real. Every solution-evolution article — and any reference article where production examples exist — must ground its claims in named systems.

- **Shape of a case study.** One or two sentences in the stage it belongs to: _company X, at scale S, chose this shape; they optimized for Y by compromising Z, and it solved P._ Example framing: "WhatsApp ran ~2M connections per Erlang box by keeping per-connection state minimal and terminating TLS upstream — trading per-node blast radius for fleet size." Follow with the citation.
- **Density.** At least one case study per major stage of a solution-evolution article where a real-world example exists, and at least three across the article. If no real example exists for a stage, say so — "this intermediate shape mostly appears as a migration step" is itself information.
- **Sources.** Tier-5 primary sources only: the company's own engineering blog, postmortem, conference talk, or paper. A third-party retelling (tier 7) is a lead to the primary source, never the citation. Public postmortems are the highest-value case studies — they document the compromise _and_ the failure mode.
- **Numbers.** Never invent, round up, or "approximately remember" a company's numbers. Quote the figure the source gives, date-stamped when the source is older than ~3 years ("as of their 2017 write-up…"). If the primary source is gone and only retellings remain, drop the number and keep the qualitative shape, or drop the example.
- **Fair characterization.** Present the company's trade-off as they framed it, not as a strawman for the stage you prefer. The fact-check gate verifies each case study against its source: system, scale, trade-off, and outcome must all match.

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

## Pick the spine

Articles come in two shapes. Decide which one before outlining:

| Spine                                                    | Use when                                                                                                                                                                                                                                                        | Typical topics                                                               |
| :------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **Solution-evolution** (default for design-space topics) | The topic is a problem with a genuine design space: several viable solutions, and the winner depends on measurable parameters (traffic, data volume, change rate, page count, team size, cost budget). "Design X", "scale Y", pattern and strategy comparisons. | blob-storage design, API gateway patterns, caching strategies, rate limiting |
| **Reference**                                            | The topic describes one mechanism as it exists — internals, protocols, spec behavior. There is no design space to walk; the value is precision and completeness.                                                                                                | the `crp-*` rendering pipeline series, event-loop internals, TLS handshake   |

When a topic has both — a mechanism plus the design space around it — lead with the solution-evolution spine and push the mechanism depth into the stage where it becomes load-bearing (the way epoll internals belong inside the "persistent connections" stage of a fan-out article, not in a standalone section before the problem exists).

## Solution-evolution spine

The article is a guided walk through a design space, written as a working discussion with the reader — not a taxonomy of options, and not a single prescriptive answer. It starts with the simplest solution that genuinely works, stresses it with arithmetic until it breaks, fixes the dominant problem, shows what the fix costs, and repeats. It is explicit that **there is no one solution**: the winner depends on named parameters, and the right architecture changes as those parameters move.

### Beats, in order

1. **The problem, with numbers.** The scenario and its constraints as concrete figures (users, request rate, data size, change rate, latency budget, cost ceiling). No abstract "imagine a large system" — give the reader the same numbers you will do arithmetic with later.
2. **The driving parameters.** Name the parameters that decide which solution wins — usually two, at most four (e.g. _traffic × change rate_, or _traffic × page count_). Pick the dominant two the regime map will be drawn over; demote anything else to a secondary constraint noted in prose. State what the design optimizes for first — and note when that priority itself shifts over the system's life.
3. **Stage 1 — the baseline that works.** The simplest correct solution, presented respectfully: mechanism in a few lines, then _the regime where it is genuinely the right answer_ ("this is fine for 500 users — ship it"). Then stress it: scale one parameter and show, with visible arithmetic, exactly where and why it breaks. Enumerate the problems by name.
4. **Stages 2…N — one fix at a time.** Each stage follows the stage template below. Order stages so each one fixes the _dominant_ remaining problem, not an arbitrary one.
5. **The operating-regime map.** The "no single answer" section — see below.
6. **The staged adoption plan.** How a real team moves through the stages over time as the parameters grow — see below.
7. **The synthesis** (when the topic converges). The end-state design, stated plainly — and explicitly which pieces of earlier stages survive in it and why (a fallback, a degradation path, a cheaper tier). The best final answers keep earlier stages alive: "polling → cache → coalesce → push, and polling stays as the safety net."
8. **Rules of thumb.** The handful of memorizable heuristics the article earned ("~20–50k connections per GB on a managed runtime; CPU is almost never the constraint for low-change-rate fan-out"). Only rules the article actually derived — no imported listicles.
9. **References.**

### Stage template

Every stage after the baseline hits the same beats, in order:

- **The dominant problem** — one line, quantified, carried over from the previous stage's fallout.
- **The fix** — the mechanism, named with its industry term (_request coalescing_, _conflation_, _write-through_, _fan-out-on-write_). Naming the general law behind the trick is half the value. Diagram when the shape changes (route through `../prj-diagrams/SKILL.md`).
- **The numbers** — back-of-envelope math showing the improvement, arithmetic visible. "Origin sees POPs × 1 req/s ≈ 100–400 RPS; 2,000 pods become 2–4" beats "significantly reduces load".
- **What it costs** — the new problems this stage introduces: failure modes, operational burden, consistency gaps, cost shape. **Every stage pays something.** A stage without a costs paragraph is a red flag — either the analysis is shallow or the stage shouldn't exist.
- **In production** — a real-company case study per the case-study protocol, when one exists.
- **Checkpoint** — one short question inviting the reader to predict the next break before reading on ("Before continuing: we made polling nearly free _for us_ — did we make it free for the client?"). One per stage at most; a quiz is not the goal, engagement with the trade-off is.

### The operating-regime map

This section is mandatory in every solution-evolution article. It makes "it depends" precise:

- A **decision matrix or quadrant** over the two dominant parameters (GFM table, or a quadrant/flow diagram via `prj-diagrams`), placing each stage in the region where it wins. If more parameters were named, say which two decide the map and why.
- **Thresholds and signals**, not vibes: the observable numbers that tell a team it is time to move ("when origin egress cost passes the cost of a small pod fleet", "when p99 staleness exceeds the product's freshness budget").
- The **coupling law** where one exists — the one-sentence invariant that explains the whole map ("polling couples cost to time; push couples cost to change rate"). If the article cannot state one, the parameters were probably chosen wrong.
- Movement is **bidirectional** — say when a team should step back down a stage (traffic fell, the product pivoted, the ops burden isn't paying rent).

### The staged adoption plan

Architecture is a path, not a point. This section is mandatory in every solution-evolution article: give the phase-wise plan for how a real team moves through the stages as the parameters grow. Differential growth between the parameters (traffic high from day one while page count grows over years — or the reverse) changes the plan's _shape_, not whether it exists:

- **Phase 1 / Phase 2 / Phase 3** keyed to parameter thresholds, each phase naming what to build, what to defer, and what to keep from the previous phase.
- **Build-ahead notes**: the small, cheap decisions in phase 1 that make phase 2 a step instead of a rewrite (version every event now so replay works later; keep the polling endpoint alive as the push tier's degradation mode).
- Migration risk goes here too: what breaks mid-transition, and how to run the two stages side by side.

### Voice moves for this spine

The evolution spine reads like a strong colleague working the problem with you. Reach for these moves; they are the difference between a discussion and a lecture:

- **Ask before telling.** Pose the question the reader should be asking, then answer it ("So what's still broken?").
- **Kill myths by name.** When a well-known belief is wrong at this scale, say so directly and show why ("Ports are not the limit — a connection is the full 4-tuple").
- **Push back on inverted intuitions with math.** When the obvious cost model points the wrong way, do the arithmetic in front of the reader ("pods look expensive next to a CDN until you price 5M RPS of per-request fees: $400k/day vs a $10k/month fleet").
- **Respect every stage.** Each stage is somebody's correct production answer at some scale. Never strawman a stage to make the next one look better — state the regime where it wins before you break it.
- **Quantify everything.** Capacity math, cost math, staleness math — with the arithmetic on the page, so the reader can rerun it with their own numbers.
- **Flag the memorable.** When a rule of thumb is worth keeping, say so explicitly ("rule of thumb worth memorizing: …").

### Anti-patterns for this spine

- A "comparison of N approaches" listicle — the stages must be causally chained (each born from the previous stage's failure), not enumerated.
- A final answer presented without the regime map — the article's thesis is _when_ each answer wins, not _that_ the last one is best.
- Strawman baselines ("obviously naive polling is terrible") — the baseline must be the right answer somewhere.
- A stage with benefits but no costs.
- Checkpoint questions that quiz trivia instead of inviting a design prediction.
- Unnamed mechanisms — if the trick has an industry name (coalescing, conflation, dogpile protection), use it and cite it.

## Reference spine

For mechanism/internals topics with no design space to walk. Use this as the default shape; deviate only when the topic genuinely calls for a different one.

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
- **Usually** for: any non-obvious mechanism described in 3+ paragraphs of prose; each solution-evolution stage whose fix changes the system's shape; the operating-regime map when two axes make a quadrant clearer than a table.
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

| Feature                                                                                                                                 | Use when                                                                                                                                                        |
| :-------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GFM tables (`\| col \|`)                                                                                                                | Trade-offs, comparisons, capacity numbers, decision matrices.                                                                                                   |
| GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`)                                                       | Sparingly — to flag a footgun, an op-time risk, or a non-obvious assumption.                                                                                    |
| Footnotes (`[^1]`)                                                                                                                      | Dense citations and source links that would clutter prose.                                                                                                      |
| Math (`$...$`, `$$...$$`)                                                                                                               | Latency / throughput / probability formulas; rendered via MathJax — `@pagesmith/core`'s default `markdown.math: 'auto'`, not overridden in `content.config.ts`. |
| Code blocks with meta — `title="..."`, `showLineNumbers`, `mark={3,5-7}`, `ins={4}`, `del={5}`, `collapse={1-5}`, `wrap`, `frame="..."` | File-anchored snippets, before/after diffs, focus highlights.                                                                                                   |
| Themed light/dark image pairs (consecutive `-light` then `-dark`)                                                                       | All diagrams. **Both variants must be present** — a lone `-light` or `-dark` throws.                                                                            |
| Auto-merged figure with caption                                                                                                         | Use the markdown title attribute on the **light** image: `![alt](./diagrams/x-light.svg "caption")`.                                                            |
| `rehype-local-images` (intrinsic dimensions, AVIF/WebP `<picture>`)                                                                     | Use markdown image syntax, not raw `<img>` / `<figure>` / `<picture>` HTML.                                                                                     |
| Heading auto-anchors + autolinks                                                                                                        | Free; use them to support deep linking from other articles.                                                                                                     |

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
- The **References section is load-bearing**, not decorative: every entry must be cited from the body (inline or footnote) and must actually support the claims that point at it. The fact-check gate rejects orphaned references and references that are merely topically adjacent to the claim.

## Fact-check gate (mandatory before done)

Run `prj-article-reviewer` on the finished draft (new, updated, or refactored). The gate checks:

1. **Claim ↔ source fidelity.** Every non-trivial claim traced to its citation; the cited source fetched and confirmed to _actually state_ the claim — not merely discuss the topic.
2. **Arithmetic.** Every back-of-envelope calculation recomputed from the stated inputs. Wrong math in a quantified article is fatal to trust.
3. **References.** Every reference resolves, is cited from the body, and supports what points at it. No fabricated URLs or anchors.
4. **Case studies — accuracy and coverage.** Each company example verified against its primary source: system, scale figures, trade-off, and outcome all match; date-stamping present where the source is old. Coverage blocks the gate too: a solution-evolution stage with no case study where the dossier or an accessible primary source shows one exists, or an article below the case-study protocol's density floor, fails the gate.
5. **Conflict handling.** Where sources disagree, the article surfaces the disagreement rather than silently picking a side.

The reviewer returns findings bucketed `confirmed` / `unsupported` / `contradicted` (plus editorial notes). The article ships only when `unsupported` and `contradicted` are zero and no case-study coverage gaps remain — fix the claim, replace the source, add the missing case study, or cut the claim, then re-review the changed sections.

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
- **update** — existing article path or explicit update request. Preserve voice; fix correctness first, then structure, then clarity. When the target is an existing slug whose topic passes the solution-evolution fit check and the article does not yet have that shape, **attempt the refactor as part of the update by default**: announce the conversion and run the refactor workflow. Reserve propose-only for requests that explicitly scope a narrow fix — and never expand a narrow fix into a silent rewrite.
- **refactor** — existing slug whose topic fits the design space. Invoking this skill against an existing article defaults to converting it to the solution-evolution format (after the fit check). One slug per invocation: **never batch-migrate the back catalogue.**
- **review** — quality pass without committing edits. Produce a written critique; do not modify content.

### Step-by-step (create / update)

1. **Frame the article.** Slug, one-sentence thesis, audience, success bar (the 5–10 questions the article must answer). Pick the spine. Decide whether it fits an existing series.
2. **Research.** Delegate to `prj-article-researcher`: it runs the research protocol and writes the claim ledger to `.temp/article-research/<slug>/claims.md` (each claim, source URL, tier, bucket), the case-study dossier to `.temp/article-research/<slug>/case-studies.md`, and the deduplicated source list to `.temp/article-research/<slug>/sources.md`.
3. **Outline the spine.** Headings only — no prose. For the evolution spine: the stage ladder, the driving parameters, and where the regime map and adoption plan land. Mark each section as skim-weight or deep-weight. Mark which sections need diagrams; queue the diagram list for `prj-diagrams`.
4. **Draft.** Delegate to `prj-article-writer` with the outline and the research paths. Citations go in as the prose is written, not after. Tables and diagrams the moment a paragraph starts enumerating dimensions.
5. **Diagram.** Hand off each queued diagram to [`../prj-diagrams/SKILL.md`](../prj-diagrams/SKILL.md). Re-render with `npm run diagrams`. Verify that every section flagged in step 3 has its diagram embedded with a caption.
6. **Fact-check gate.** Run `prj-article-reviewer`; fix findings via the writer; re-review changed sections until `unsupported` and `contradicted` are zero.
7. **Self-review.** Use the review checklist below for the editorial pass the gate does not cover (structure, voice, depth placement).
8. **Update companion metadata** (see list above).
9. **Validate.** Run the validation set below. Fix issues; do not silence them.
10. **Update `lastUpdatedOn`.**

### Step-by-step (refactor an existing article)

1. **Read everything first.** The full article, its `diagrams/` and `assets/`, its citations, and the companion metadata (`content/articles/meta.json5`, `content/home.json5`, `content/redirects.json5`).
2. **Fit check.** Does the topic have a genuine design space — multiple viable solutions whose winner moves with measurable parameters? If not (pure mechanism reference: the `crp-*` series, a protocol walkthrough), **stop and report that** with the reasoning; do not force the spine onto a reference topic.
3. **Inventory the survivors.** Verified claims, citations, tables, diagrams, and code that carry over. The refactor restructures the narrative; it must not throw away verified research. Anything kept is still subject to the fact-check gate.
4. **Re-frame.** Identify the driving parameters, the stage ladder (which existing sections become stages, in what causal order), the regime map, the adoption plan, and the case-study gaps. Delegate gap research to `prj-article-researcher`.
5. **Rewrite.** Delegate to `prj-article-writer`. Slug, frontmatter identity, series membership, and redirects stay untouched unless the user asked otherwise; `title`/`description` may be sharpened to match the new shape. New stage/regime diagrams go through `prj-diagrams`; existing diagrams are re-used where the concept is unchanged.
6. **Fact-check gate.** Full pass — refactors move claims between contexts, which is exactly when citations silently detach from what they support.
7. **Close out.** Companion metadata drift check, validation set, `lastUpdatedOn`.

### Review checklist

Use the same bar for both new articles and updates.

- **Correctness.** Every non-trivial claim has a tier-appropriate citation. No fabricated URLs. No stale version-specific claims. Arithmetic recomputes.
- **Source quality.** No claim leans solely on a tier-7 source where an upper-tier source exists.
- **References.** Every entry cited from the body and actually supporting its claims; no orphans.
- **Case studies.** Present per the case-study protocol; numbers match the primary source; characterization fair.
- **Audience fit.** Is depth applied where it matters? Are common items short and clear? Could a senior engineer skim the simple parts and still trust the deep parts?
- **Structure.** One coherent subtopic. Sequential heading depth. Right spine for the topic. For the evolution spine: stages causally chained, every stage has a costs paragraph, regime map present with thresholds, staged adoption plan present, synthesis says which earlier pieces survive.
- **Diagrams.** Overview diagram present where warranted. Each substantial section either has a diagram or has a clear reason not to. Both `-light` and `-dark` variants present.
- **Trade-offs.** Real engineering criteria, failure modes, and operational implications are present and explicit.
- **Voice.** No throat-clearing, no marketing verbs, no padding. Evolution spine: discussion, not lecture; questions posed before answers; myths killed by name.

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
- The fact-check gate (`prj-article-reviewer`) is mandatory for create, update, and refactor. Zero `unsupported` / `contradicted` findings before done.
- Writer and reviewer roles run on `fable` (or `opus` as fallback) — never a smaller model.
- Refactors to the solution-evolution format are per-slug: attempt the conversion when invoked against an existing article that fits the design space, but never batch-migrate existing articles.
- Solution-evolution articles must include the operating-regime map and the staged adoption plan, and every stage must state what it costs.
- Company numbers come from primary sources verbatim, date-stamped when old; never approximated from memory.
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
- The strongest evolution articles derive their regime map, they don't assert it: if the reader can rerun your arithmetic with their own parameters and land in a different (correct) cell of the matrix, the article did its job.
- If you cannot name the parameter that separates two stages, they are probably the same stage.
