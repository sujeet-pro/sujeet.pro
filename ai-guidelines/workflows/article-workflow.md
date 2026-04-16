# Article Workflow

Use this workflow for `content/articles/<slug>/README.md`.

Read first:

- `ai-guidelines/README.md`
- `ai-guidelines/content-structure.md`
- `ai-guidelines/markdown.md`
- `ai-guidelines/diagrams.md`
- `ai-guidelines/packages.md`

Also inspect the local companion config that matches the task:

- `content/articles/meta.json5`
- `content/home.json5` when featured content might change
- `content/redirects.json5` when the slug or canonical path might change

## Intent and mode

Choose the mode from the request and the target:

- `create`: new topic, new slug, or explicit create request
- `update`: existing article path or explicit update request
- `review`: quality pass without committing to edits yet

If the topic is broad enough that it could become a series, stop and decide the split before drafting.

## Scope audit

Before editing:

- For a single article task, read the article, sibling `diagrams/` and `assets/` folders, and the relevant metadata that may need to move with it.
- For a repo-wide article review, inspect `content/articles/meta.json5`, article frontmatter across the section, homepage featured references, and redirects together.
- Treat article markdown, section metadata, homepage curation, and redirects as one change set when the article's identity or placement changes.

## Create

### 1. Research

- Start with primary sources: specs, official docs, maintainers, and source material.
- Capture the claims that matter, not a pile of links.
- Verify the practical constraints, trade-offs, and failure modes.
- Reject claims that cannot be verified.

### 2. Frame the article

- Pick a slug that names one clear subtopic.
- Decide whether the article belongs in an existing series or needs a new one.
- Decide whether the article should appear in homepage featured content.
- Draft the article spine:
  - intro and core mental model
  - overview diagram
  - section breakdown
  - diagram plan
  - citation plan

### 3. Write

- Write for senior engineers, not beginners.
- Lead with the why, then the mechanism, then the trade-offs.
- Prefer concrete examples, tables, and engineering decision criteria.
- Add citations as you write instead of backfilling them later.

### 4. Diagram

- Add an overview diagram near the top when the topic benefits from one.
- Add section-level diagrams for hard-to-visualize mechanisms.
- Create source files in `./diagrams/`.
- Re-render with `npm run diagrams` after changing diagram sources.

### 5. Finalize

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

### 2. Update surgically

- Fix correctness first.
- Then improve structure, diagrams, and clarity.
- If the article has expanded into multiple subtopics, propose a split instead of endlessly growing one page.
- Re-render diagrams when the concept changes.
- If the article moves within a series, changes slug, or changes homepage prominence, update the coordinating JSON5 files in the same patch.

### 3. Close out

- Update `lastUpdatedOn`.
- Re-check the article against the same standards as a new article.
- Re-check section metadata, homepage references, and redirects for drift.

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
- Is there an overview diagram when one is warranted?
- Do the major sections have enough diagrams, tables, or examples?
- Are the trade-offs and practical constraints explicit?
- Are all important claims grounded in sources?

## Validation

Use the smallest relevant set:

```bash
npm run diagrams
npm run validate
npm run build
```

Use `vp check` only when the task also changed code or config.
