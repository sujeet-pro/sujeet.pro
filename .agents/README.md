# Agents Entry Points

Neutral task entrypoints for agent runtimes that do not use `.claude/skills/` or `.cursor/skills/`.

Canonical guidance lives in `ai-guidelines/`. The files in `.agents/skills/` are intentionally thin wrappers that point there.

These wrappers assume content work may require coordinated updates to entry frontmatter, section `meta.json5`, homepage curation, and redirects.

Available skills:

- `sp-doc`: route article, blog, or docs-refresh work
- `sp-article`: create, update, or review articles
- `sp-blog`: create, update, or review blogs
- `sp-sync`: refresh `ai-guidelines/`, root docs, and skill wrappers
