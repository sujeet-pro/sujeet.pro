---
name: sp-sync
description: Sync AI guidelines from @pagesmith/core and diagramkit package updates
user_invocable: true
---

# /sp-sync — Sync Package Guidelines

Updates AI guidelines when `@pagesmith/core` or `diagramkit` package versions change. Reads reference docs from installed packages and upstream source, then regenerates `ai-guidelines/` files.

## Usage

```
/sp-sync                          # Sync all guidelines
/sp-sync --check                  # Check if guidelines are outdated (no changes)
/sp-sync --package pagesmith      # Sync only @pagesmith/core guidelines
/sp-sync --package diagramkit     # Sync only diagramkit guidelines
```

## What Gets Synced

### From @pagesmith/core

| Source                                              | Target                      | What                                                |
| --------------------------------------------------- | --------------------------- | --------------------------------------------------- |
| `node_modules/@pagesmith/core/REFERENCE.md`         | `ai-guidelines/packages.md` | Content layer API, schemas, CSS exports, validators |
| `node_modules/@pagesmith/core/docs/agents/usage.md` | `ai-guidelines/packages.md` | Usage patterns and examples                         |
| `../pagesmith/ai-guidelines/markdown-guidelines.md` | `ai-guidelines/markdown.md` | Markdown pipeline, features, code block syntax      |
| `../pagesmith/ai-guidelines/core-guidelines.md`     | `ai-guidelines/packages.md` | Collection options, JSX runtime, key rules          |

### From diagramkit

| Source                                  | Target                      | What                                 |
| --------------------------------------- | --------------------------- | ------------------------------------ |
| `node_modules/diagramkit/llms.txt`      | `ai-guidelines/packages.md` | CLI commands, render options         |
| `node_modules/diagramkit/llms-full.txt` | `ai-guidelines/diagrams.md` | Detailed diagram authoring reference |

## Sync Process

### Step 1 — Read Sources

Read all source files listed above. If a source file is missing, warn but continue with other sources.

Check upstream (sibling repo) sources first, fall back to `node_modules/`:

```
../pagesmith/ai-guidelines/       # Upstream source (preferred)
node_modules/@pagesmith/core/     # Installed package (fallback)

../diagramkit/                    # Upstream source (preferred)
node_modules/diagramkit/          # Installed package (fallback)
```

### Step 2 — Update ai-guidelines/packages.md

Regenerate the `@pagesmith/core` and `diagramkit` sections with:

- Content layer API (defineCollection, defineConfig, createContentLayer)
- Collection options table
- Frontmatter schemas table
- JSX runtime setup
- CSS exports table
- Built-in validators list
- diagramkit CLI commands and options
- diagramkit programmatic API

Update the sync metadata comment at the top:

```md
<!-- Last synced: YYYY-MM-DD -->
<!-- @pagesmith/core: <version-or-path> -->
<!-- diagramkit: <version-or-path> -->
```

### Step 3 — Update ai-guidelines/markdown.md

Copy the full markdown guidelines from @pagesmith/core and append site-specific additions:

- Site-specific frontmatter fields
- Diagram reference syntax (`<picture>` tag)
- Citation format requirements
- Content structure rules specific to this site

Preserve the site-specific sections (marked with `<!-- site-specific -->` comments) when regenerating.

### Step 4 — Update ai-guidelines/diagrams.md

If diagramkit's `llms-full.txt` has new features or changed CLI options:

- Update supported formats table
- Update CLI commands and options
- Update programmatic API section
- Preserve site-specific sections (file organization, naming conventions, when-to-add rules)

### Step 5 — Report

Output a summary of what changed:

```
## /sp-sync Summary

### Updated
- ai-guidelines/packages.md — @pagesmith/core API reference updated
- ai-guidelines/markdown.md — Added new code block meta: `startLineNumber`

### Unchanged
- ai-guidelines/diagrams.md — No changes detected

### Warnings
- ../diagramkit/ not found, used node_modules/diagramkit/ instead
```

## --check Mode

Compare current guidelines against source files without making changes. Report:

- Which files are outdated
- What sections differ
- Whether a sync is recommended
