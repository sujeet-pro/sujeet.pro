---
name: sp-sync
description: Refresh the repo's AI docs and skill wrappers for sujeet.pro.
---

# sp-sync

Read these files in order:

1. `ai-guidelines/README.md`
2. `ai-guidelines/packages.md`
3. `ai-guidelines/workflows/update-docs.md`

## Rules

- Update `ai-guidelines/` first.
- Keep `.claude/`, `.cursor/`, and `.agents/` aligned.
- Keep wrappers thin and pointer-based.
- Keep the docs aligned with the real core-native integration surfaces and do not reintroduce `@pagesmith/docs`.
