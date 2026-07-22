# Article Workflow

Use this workflow for `content/articles/<slug>/README.md`.

Read first:

- `ai-guidelines/README.md`
- `ai-guidelines/content-structure.md`
- `ai-guidelines/markdown.md`
- `ai-guidelines/diagrams.md`
- `ai-guidelines/packages.md`

The full authoring protocol — spines, research protocol, case-study protocol, agent roster, fact-check gate — lives in `.agents/skills/prj-article/SKILL.md`. This file is the operational checklist; that file is the standard.

Also inspect the local companion config that matches the task:

- `content/articles/meta.json5`
- `content/home.json5` when featured content might change
- `content/redirects.json5` when the slug or canonical path might change

## Intent and mode

Choose the mode from the request and the target:

- `create`: new topic, new slug, or explicit create request
- `update`: existing article path or explicit update request
- `refactor`: existing slug whose topic fits the design space — invoking against an existing article defaults to attempting this conversion (after the fit check); one slug per invocation, never a batch migration
- `review`: quality pass without committing to edits yet

If the topic is broad enough that it could become a series, stop and decide the split before drafting.

## Pick the spine

Before outlining, pick the article's shape (full definitions in the skill):

- **Solution-evolution** — default for design-space topics: several viable solutions whose winner depends on measurable parameters. Simplest working baseline → stress it with arithmetic → fix the dominant problem stage by stage (every stage states what it costs) → operating-regime map with thresholds → staged adoption plan → synthesis that names which earlier pieces survive. Real-company case studies anchor the stages.
- **Reference** — mechanism/internals topics with no design space to walk: thesis, mental model, deep sections, trade-offs, failure modes, takeaways.

## Agents

Delegate the heavy roles to the dedicated subagents in `.claude/agents/` (perform the same roles inline, in the same order, when subagents are unavailable):

- `prj-article-researcher` (opus) — claim ledger + case-study dossier under `.temp/article-research/<slug>/`
- `prj-article-writer` (fable) — drafts or refactors the article from the outline and ledger
- `prj-article-reviewer` (fable) — mandatory fact-check gate; read-only findings report

The reviewer gate applies to create, update, and refactor: the article is done only when `unsupported` and `contradicted` findings are zero.

## Scope audit

Before editing:

- For a single article task, read the article, sibling `diagrams/` and `assets/` folders, and the relevant metadata that may need to move with it.
- For a repo-wide article review, inspect `content/articles/meta.json5`, article frontmatter across the section, homepage featured references, and redirects together.
- Treat article markdown, section metadata, homepage curation, and redirects as one change set when the article's identity or placement changes.

## Create

### 1. Frame the article

- Pick a slug that names one clear subtopic.
- State the thesis and the questions the article must answer; pick the spine.
- Decide whether the article belongs in an existing series or needs a new one.
- Decide whether the article should appear in homepage featured content.
- Draft the article spine:
  - solution-evolution: problem with numbers, driving parameters, stage ladder, regime map, adoption plan, synthesis, diagram plan, citation plan
  - reference: intro and core mental model, overview diagram, section breakdown, diagram plan, citation plan

### 2. Research

- Delegate to `prj-article-researcher` with the slug, thesis, the questions the article must answer, and the spine.
- Start with primary sources: specs, official docs, maintainers, and source material.
- Capture the claims that matter, not a pile of links.
- Verify the practical constraints, trade-offs, and failure modes.
- For solution-evolution articles, fill the case-study dossier: who runs each stage in production, what they optimized, what they compromised, with primary-source citations.
- Reject claims that cannot be verified.

### 3. Write

- Delegate to `prj-article-writer` with the outline and research paths.
- Write for senior engineers, not beginners.
- Lead with the why, then the mechanism, then the trade-offs.
- Prefer concrete examples, tables, and engineering decision criteria.
- Add citations as you write instead of backfilling them later.
- Solution-evolution: visible arithmetic, a costs paragraph in every stage, case studies woven into stages, checkpoint questions, an operating-regime map with real thresholds.

### 4. Diagram

- Add an overview diagram near the top when the topic benefits from one.
- Add section-level diagrams for hard-to-visualize mechanisms; for solution-evolution, diagram the stages whose fix changes the system's shape, and consider a quadrant for the regime map.
- Create source files in `./diagrams/`.
- Re-render with `npm run diagrams` after changing diagram sources.

### 5. Fact-check gate

- Run `prj-article-reviewer` on the full draft.
- Fix `unsupported` / `contradicted` findings via the writer; re-review changed sections until both are zero.

### 6. Finalize

- Ensure frontmatter is complete.
- Ensure the visible `# H1` matches the article intent.
- Update `content/articles/meta.json5` when the article belongs to a series, affects manual ordering, or changes listing copy.
- Update `content/home.json5` when the article is featured or newly removed from featured content.
- Update `content/redirects.json5` when the new article replaces or renames an old path.
- Update `lastUpdatedOn` to the current edit date.

## Update

### 1. Read and diff

- Read the current article end to end.
- Read the current article's companion metadata before changing structure:
  - `content/articles/meta.json5`
  - `content/home.json5` when relevant
  - `content/redirects.json5` when relevant
- Identify stale claims, weak sections, outdated diagrams, and broken citations.
- Preserve the article's voice unless the structure itself is the problem.
- If the target slug passes the solution-evolution fit check and does not yet have that shape, attempt the refactor (below) as part of the update by default — announce the conversion first. Reserve propose-only for requests that explicitly scope a narrow fix, and never expand a narrow fix into a silent rewrite.

### 2. Update surgically

- Fix correctness first.
- Then improve structure, diagrams, and clarity.
- If the article has expanded into multiple subtopics, propose a split instead of endlessly growing one page.
- Re-render diagrams when the concept changes.
- If the article moves within a series, changes slug, or changes homepage prominence, update the coordinating JSON5 files in the same patch.

### 3. Close out

- Run the fact-check gate (`prj-article-reviewer`) on the changed material.
- Update `lastUpdatedOn`.
- Re-check the article against the same standards as a new article.
- Re-check section metadata, homepage references, and redirects for drift.

## Refactor (existing article → solution-evolution format)

One slug per invocation — this is the default path when the skill targets an existing article whose topic fits the design space. Never batch-migrate the back catalogue.

### 1. Read and fit-check

- Read the full article, its `diagrams/` and `assets/`, citations, and companion metadata.
- Fit check: does the topic have a genuine design space — multiple viable solutions whose winner moves with measurable parameters? If not (pure mechanism reference such as the `crp-*` series), stop and report the reasoning instead of forcing the spine.

### 2. Inventory and re-frame

- Inventory the survivors: verified claims, citations, tables, diagrams, and code that carry over.
- Identify the driving parameters, the stage ladder (which existing sections become stages, in causal order), the regime map, the adoption plan, and case-study gaps.
- Delegate gap research to `prj-article-researcher`.

### 3. Rewrite

- Delegate to `prj-article-writer`. Slug, frontmatter identity, series membership, and redirects stay untouched unless the user asked otherwise; `title`/`description` may be sharpened to match the new shape.
- Route new stage/regime diagrams through `prj-diagrams`; reuse existing diagrams where the concept is unchanged.

### 4. Close out

- Full fact-check gate — refactors move claims between contexts, which is when citations silently detach.
- Update `lastUpdatedOn`; run the validation set; re-check companion metadata for drift.

## Review

Prioritize findings in this order:

1. factual correctness
2. weak or missing citations
3. incorrect or stale diagrams
4. structure and scope problems
5. clarity and polish

For repo-wide article reviews, also check:

- missing or orphaned series entries in `content/articles/meta.json5`
- article slugs referenced from `content/home.json5` that no longer exist or no longer fit
- redirects that point to stale or overly broad destinations
- frontmatter drift such as missing dates, stale tags, or unmaintained drafts

Review questions:

- Does the article teach one coherent subtopic?
- Is the audience clearly senior?
- Is the right spine used — and for solution-evolution: are stages causally chained, does every stage state its costs, is the regime map present with thresholds, does the synthesis name surviving pieces?
- Is there an overview diagram when one is warranted?
- Do the major sections have enough diagrams, tables, or examples?
- Are the trade-offs and practical constraints explicit?
- Are all important claims grounded in sources, and do the references actually back the data?
- Are real-company examples present where they exist, accurate to their primary sources?

## Validation

Use the smallest relevant set:

```bash
npm run diagrams
npm run validate
npm run validate:diagrams
```

Run `npm run validate:full` before a release. Use `npm run build` only when the change touches layouts, redirects, or build-affecting config, and `vp check` only when the task also changed code or config.
