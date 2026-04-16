# Blog Workflow

Use this workflow for `content/blogs/<slug>/README.md`.

Read first:

- `ai-guidelines/README.md`
- `ai-guidelines/content-structure.md`
- `ai-guidelines/markdown.md`
- `ai-guidelines/diagrams.md`
- `ai-guidelines/packages.md`

Also inspect the local companion config that matches the task:

- `content/blogs/meta.json5`
- `content/home.json5` when the homepage or curated content links to the post
- `content/redirects.json5` when the slug or canonical path might change

## Intent and mode

Choose the mode from the request and the target:

- `create`: new post, new slug, or explicit create request
- `update`: existing blog path or explicit update request
- `review`: quality pass without immediately editing

Default target: a focused post that reads in under 15 minutes.

## Scope audit

Before editing:

- For a single blog task, read the post, sibling `diagrams/` and `assets/` folders, and any metadata that may need to change with it.
- For a repo-wide blog review, inspect `content/blogs/meta.json5`, blog frontmatter across the section, homepage references, and redirects together.
- Treat blog markdown, section metadata, curated homepage references, and redirects as one change set when the post's identity or placement changes.

## Create

### 1. Frame the post

- Decide what the post is actually about:
  - an opinion
  - a lesson learned
  - a change you made
  - a new mental model
  - a practical field note
- Keep the scope tight.

### 2. Research enough

- Verify technical claims before writing them.
- Cite anything non-obvious, external, numerical, or standards-based.
- Do not hide behind "personal opinion" when the sentence is really making a factual claim.

### 3. Write

- Personal voice is allowed.
- Keep the writing direct and concrete.
- Explain why the issue mattered in practice.
- Add examples, comparisons, or before/after framing when useful.

### 4. Diagram

- Add a diagram when the post explains a mechanism, flow, migration, or architecture.
- Skip diagrams only when prose is genuinely clearer.
- Store source files in `./diagrams/` and render with `npm run diagrams`.

### 5. Finalize

- Ensure frontmatter is complete.
- Update `content/blogs/meta.json5` if listing behavior or ordering assumptions need to change.
- Update `content/home.json5` if the post is explicitly surfaced from curated homepage content.
- Update `content/redirects.json5` when the new post replaces or renames an old path.
- Update `lastUpdatedOn` to the current edit date.
- Keep the final post tight enough that every section earns its place.

## Update

### 1. Read and verify

- Read the existing post fully.
- Read the companion metadata before changing structure:
  - `content/blogs/meta.json5`
  - `content/home.json5` when relevant
  - `content/redirects.json5` when relevant
- Identify stale facts, outdated recommendations, and diagrams that no longer match the story.
- Preserve the original voice unless it blocks clarity or correctness.

### 2. Update

- Correct facts first.
- Then tighten structure and add diagrams only where they add real value.
- Avoid turning a blog into an article by accretion. If the topic now needs a deep treatment, propose a new article instead.
- If the blog changes slug, positioning, or curated visibility, update the coordinating JSON5 files in the same patch.

### 3. Close out

- Update `lastUpdatedOn`.
- Re-render diagrams when needed.
- Re-check metadata and redirects for drift.

## Review

Review questions:

- Is the post focused enough for blog scope?
- Is the personal voice helping rather than substituting for substance?
- Are all factual claims still correct?
- Does the post need a diagram?
- Would this be clearer as an article instead?

For repo-wide blog reviews, also check:

- frontmatter drift such as stale dates, tags, or drafts
- listing metadata in `content/blogs/meta.json5`
- homepage references that no longer match the current post set
- redirects that still point to removed or renamed blog content

## Validation

Use the smallest relevant set:

```bash
npm run diagrams
npm run validate
npm run build
```

Use `vp check` only when the task also changed code or config.
