---
name: sp-doc
description: Create, review, or update site content (articles, blogs, projects) with deep research, citations, and diagram management
user_invocable: true
---

# /sp-doc — Content Management

Unified skill for creating, reviewing, and updating content on sujeet.pro. Handles articles, blogs, and projects with deep research, citation requirements, and automatic diagram lifecycle management.

## Usage

```
/sp-doc <path-or-topic> [--mode create|review|update] [--type article|blog|project]
/sp-doc content/articles/cap-theorem/README.md              # auto-detects: review
/sp-doc content/articles/cap-theorem/README.md --mode update # explicit update
/sp-doc "Build Pipelines and CI/CD" --type article           # create new article
/sp-doc content/blogs/new-post --mode create                 # create new blog
```

## Mode Detection

| Signal                        | Mode   |
| ----------------------------- | ------ |
| Path exists, no `--mode` flag | review |
| Path does not exist           | create |
| `--mode create`               | create |
| `--mode review`               | review |
| `--mode update`               | update |

## Content Type Detection

| Path Pattern                   | Type    | Page Kind |
| ------------------------------ | ------- | --------- |
| `content/articles/*/README.md` | article | content   |
| `content/articles/README.md`   | article | listing   |
| `content/blogs/*/README.md`    | blog    | content   |
| `content/blogs/README.md`      | blog    | listing   |
| `content/projects/*/README.md` | project | content   |
| `content/README.md`            | home    | page      |

## Prerequisites

Before any operation, read these guidelines:

- `ai-guidelines/content-structure.md` — Content types, frontmatter, layout rules, citations
- `ai-guidelines/markdown.md` — Markdown features and syntax (extended from @pagesmith/core)
- `ai-guidelines/diagrams.md` — Diagram authoring with diagramkit
- `ai-guidelines/packages.md` — @pagesmith/core and diagramkit API reference

---

## Create Mode

### Article Research Workflow

Articles require deep research with rigorous citation and fact-checking.

**Phase 1 — Research**

1. Identify the topic domain and find authoritative sources:
   - **Primary**: Official specifications (ECMAScript, RFCs, W3C, WHATWG, language specs)
   - **Primary**: Official documentation (MDN, framework docs, language references)
   - **Secondary**: Academic papers (peer-reviewed)
   - **Secondary**: Recognized experts (core contributors, TC39 members, language designers)
   - **Tertiary**: Well-known technical blogs (with established track record)
2. For each factual claim, record the source URL and relevant quote
3. **CRITICAL**: If a statement cannot be verified against an authoritative source, do NOT include it

**Phase 2 — Outline**

1. Generate article outline:
   - H1 title
   - Abstract with "Core mental model" bullets
   - H2/H3 section hierarchy
   - Identify where diagrams add value (architecture, flows, comparisons)
   - Map citations to sections
2. Present outline to user for approval before writing

**Phase 3 — Write**

1. Follow structure from `ai-guidelines/content-structure.md`:
   - H1 title (the only H1)
   - Abstract/intro paragraph
   - Deep-dive sections with sequential H2/H3 hierarchy
   - Practical takeaways
2. Citation rules:
   - Every factual statement has an inline link or footnote
   - Code examples sourced from official docs where possible
   - Use tables for comparisons
   - Use code blocks with language identifiers and appropriate meta
3. Create frontmatter:
   ```yaml
   ---
   title: "Article Title"
   description: "One-line description for SEO and listing cards"
   publishedDate: YYYY-MM-DD
   lastUpdatedOn: YYYY-MM-DD
   tags: [tag1, tag2]
   ---
   ```

**Phase 4 — Diagrams**

1. Create `.mermaid` source files in `<slug>/diagrams/`
2. One diagram per concept, named descriptively
3. Reference in markdown:
   ```html
   <picture>
     <source media="(prefers-color-scheme: dark)" srcset="./diagrams/name-dark.svg" />
     <img src="./diagrams/name-light.svg" alt="Descriptive alt text" />
   </picture>
   ```
4. Run `npm run diagrams` to render

**Phase 5 — Finalize**

1. Add slug to appropriate series in `content/articles/meta.json5` if applicable
2. Run `npm run validate` — check frontmatter
3. Run `npm run build` — verify rendering
4. Self-review against checklist (see Review Mode)

### Blog Creation

Same phases as articles with lighter requirements:

- Research depth is lighter — opinion pieces and personal experience are acceptable
- Citations recommended but not mandatory for every claim
- No series assignment needed
- Shorter, more focused content

### Project Creation

- Include architecture overview diagram
- Link to repository, demo, documentation
- Focus on technical decisions, trade-offs, and outcomes

---

## Review Mode

Read the content thoroughly, then check each area. Report findings with severity.

### Checklist

1. **Structure** (per `ai-guidelines/content-structure.md`):
   - [ ] Has H1 title (exactly one)
   - [ ] Has abstract/intro paragraph
   - [ ] H2/H3 hierarchy is sequential (no skipping levels)
   - [ ] Diagrams present where architecture/flow would benefit
   - [ ] Tables used for comparisons
   - [ ] GitHub Alerts used appropriately

2. **Depth**:
   - [ ] Staff/Principal-engineer level (not too basic)
   - [ ] Concepts explained with sufficient depth
   - [ ] Practical takeaways included

3. **Accuracy**:
   - [ ] Technical claims are correct
   - [ ] Code examples compile/run correctly
   - [ ] Patterns described accurately

4. **Citations** (articles only):
   - [ ] All factual statements have sources
   - [ ] Sources are authoritative (see hierarchy in content-structure.md)
   - [ ] Links are not broken

5. **Completeness**:
   - [ ] No missing sections or incomplete explanations
   - [ ] No TODO markers or placeholder text

6. **Frontmatter**:
   - [ ] All required fields present (title, description, publishedDate, lastUpdatedOn, tags)
   - [ ] No `layout` or `category` in frontmatter
   - [ ] Tags are relevant and consistent with existing tags

7. **Diagrams**:
   - [ ] Diagrams are relevant and accurate
   - [ ] Alt text is descriptive
   - [ ] `<picture>` tag used with dark mode source

8. **Markdown** (per `ai-guidelines/markdown.md`):
   - [ ] Code blocks have language identifiers
   - [ ] Valid meta properties on code blocks
   - [ ] External links are absolute URLs
   - [ ] Internal links are relative

### Severity Levels

- **Critical**: Accuracy issues, missing required frontmatter, broken structure
- **Warning**: Missing diagrams, shallow sections, weak citations
- **Suggestion**: Style improvements, better structure, additional examples

---

## Update Mode

1. **Read** existing content and identify changes needed
2. **Update** content following the same guidelines as create mode
3. **Manage diagrams**:
   - Content changed but diagram still accurate → keep as-is
   - Content changed and diagram needs updating → replace the `.mermaid` (or other) source file
   - New concept needs visualization → create new source file + add `<picture>` reference
   - Diagram no longer relevant → clean up:
     a. Delete the source file (`.mermaid`, `.excalidraw`, etc.)
     b. Delete the rendered SVGs (`*-light.svg`, `*-dark.svg`)
     c. Remove the `<picture>` tag from markdown
     d. Clean up manifest entries if present
4. **Run `npm run diagrams`** to re-render changed diagrams
5. **Update `lastUpdatedOn`** in frontmatter to today's date
6. **Run `npm run validate`** and `npm run build`
