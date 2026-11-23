# AI Guidelines — single source of truth

Every coding agent working in this repo (JetBrains **Junie** and **Claude Code**) reads the same instructions from this folder. The tool-specific files are thin wrappers that point here; never put rules in a wrapper.

```mermaid
flowchart LR
  A[AGENTS.md<br/>repo overview + hard rules] --> R[ai-guidelines/README.md]
  C[CLAUDE.md<br/>@AGENTS.md + @ai-guidelines/README.md] --> A
  JS[.junie/skills/*/SKILL.md] --> W[ai-guidelines/workflows/*.md]
  CS[.claude/skills/*/SKILL.md] --> W
  JA[.junie/agents/*.md] --> RO[ai-guidelines/roles/*.md]
  CA[.claude/agents/*.md] --> RO
  R --> RULES[architecture / voice / ux / archetypes]
  W --> RULES
  RO --> RULES
```

## Rule files (read before changing the matching area)

| File | Read when | Covers |
| :--- | :--- | :--- |
| [architecture.md](architecture.md) | Touching `src/`, `scripts/`, routes, data files | Folder map, single-folder articles, `sp-` namespacing, visibility tiers and leak rules, graph invariants, pitfalls P1–P27 |
| [voice-and-quality.md](voice-and-quality.md) | Writing any prose, UI copy, commit or PR text | Register, banned filler, citation gate, `ASSUMPTION:` labels, UI copy rules |
| [interactive-ux.md](interactive-ux.md) | Touching layouts, components, keyboard, CSS | Uniform container, `hybrid` stage layout, one keyboard dispatcher, dialogs, WCAG 2.1.4, print guard, CWV budgets |
| [archetypes-and-standards.md](archetypes-and-standards.md) | Planning or reviewing article content | Four archetypes, evolution-first thesis, "right-size each level", E1–E10, AI-era economics, Generic ↔ AWS |
| [commands.md](commands.md) | Running anything | npm scripts, which exist today, dev-server rule, verify chains |
| [setup/local-audio.md](setup/local-audio.md) | Generating podcast audio | Apple-Silicon MLX + Kokoro setup, `scripts/setup-audio.sh`, troubleshooting |

## Workflows (skills)

Each workflow is exposed as a skill with the same name in both tools: `.junie/skills/<name>/SKILL.md` and `.claude/skills/<name>/SKILL.md`.

| Skill | Workflow file | Use for |
| :--- | :--- | :--- |
| `article` | [workflows/article.md](workflows/article.md) | Starting or advancing an article through `idea → … → published` |
| `article-prototype` | [workflows/article-prototype.md](workflows/article-prototype.md) | Standalone `prototypes/vN.html` previews, multi-variant layout switchers |
| `article-media` | [workflows/article-media.md](workflows/article-media.md) | Visuals, per-stage WebPs, audio, PDF, lock hashes |
| `article-social` | [workflows/article-social.md](workflows/article-social.md) | LinkedIn copy + `linkedin.json`, `llms-notes.md` |
| `article-qa` | [workflows/article-qa.md](workflows/article-qa.md) | Real-Chromium QA pass before review/publish |

## Roles (subagents)

Each role is a subagent with the same name in both tools: `.junie/agents/<name>.md` and `.claude/agents/<name>.md`.

| Agent | Role file | Scope |
| :--- | :--- | :--- |
| `article-researcher` | [roles/article-researcher.md](roles/article-researcher.md) | Read-only + web; primary sources only; returns a cited fact table |
| `article-builder` | [roles/article-builder.md](roles/article-builder.md) | Implements MDX, React islands, data files, media runs |
| `article-reviewer` | [roles/article-reviewer.md](roles/article-reviewer.md) | Adversarial fact-check, anti-slop, right-size-each-level checklist, QA audit |

## Deeper references (not duplicated here)

| Doc | Purpose |
| :--- | :--- |
| `docs/implementation-plan.md` | Canonical build plan: status tracker (§1), decisions (§2), contracts (§4), file map (§5), pitfalls (§6), stages (§8), publish gate (§11) |
| `docs/preview-guide.md` | How to open and smoke-test `prototypes/v1.html` and `v2.html` |
| `.junie/plans/interactive-articles-platform.md` | Master product plan (requirements, editorial thesis, key decisions) |
| `sp.config.ts` | Runtime config: shortcuts, audio, PDF, `layout` (owner pick `hybrid`) |

## Maintaining this setup

- Edit content **here**, never in `.junie/` or `.claude/` wrappers.
- Adding a workflow: create `workflows/<name>.md`, add both wrappers (`.junie/skills/<name>/SKILL.md`, `.claude/skills/<name>/SKILL.md`) pointing at it, add a row above.
- Adding a role: create `roles/<name>.md` plus both agent wrappers, add a row above.
- Run `npm run validate:junie` after any change; CI runs it too.
