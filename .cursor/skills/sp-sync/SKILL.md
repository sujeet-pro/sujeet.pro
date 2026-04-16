---
name: sp-sync
description: Refresh the repo's AI docs and skill wrappers for sujeet.pro. Use when the user asks to update ai-guidelines, sync AGENTS.md or CLAUDE.md, refresh Cursor or Claude skills, or align package guidance with installed Pagesmith and diagramkit docs.
---

# sp-sync

Read these files in order:

1. `ai-guidelines/README.md`
2. `ai-guidelines/packages.md`
3. `ai-guidelines/workflows/update-docs.md`

## Primary rule

Update `ai-guidelines/` first. Then update wrappers and root docs to match it.

## Required sources

This workflow must read the installed upstream references named in `ai-guidelines/workflows/update-docs.md` before making changes.

## Always honor

- Keep `.claude/`, `.cursor/`, and `.agents/` aligned.
- Keep wrappers thin and pointer-based.
- Preserve repo-specific article and blog rules.
- Keep the docs aligned with the real core-native integration surfaces and do not reintroduce `@pagesmith/docs`.
- Do not reintroduce `projects` as a first-class content surface unless the user explicitly asks.

## Validation

- Check that all referenced files still exist.
- Use `ReadLints` for changed rule or config files when relevant.
