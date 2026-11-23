@AGENTS.md

@ai-guidelines/README.md

## Claude Code

- The two imports above are the shared instructions (also read by Junie). Edit them, or the files under `ai-guidelines/`, never this file, when a rule changes.
- Skills: `.claude/skills/<name>/SKILL.md`; subagents: `.claude/agents/<name>.md`. Both are thin wrappers over `ai-guidelines/workflows/` and `ai-guidelines/roles/`.
- Before writing article prose or UI copy, read `ai-guidelines/voice-and-quality.md`; before touching `src/`, read `ai-guidelines/architecture.md` and `ai-guidelines/interactive-ux.md`.
