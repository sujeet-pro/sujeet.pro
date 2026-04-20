---
name: prj-sync
description: Refresh sujeet.pro AI docs and skill wrappers after a Pagesmith / diagramkit upgrade or a project convention change. Use when the user asks to sync ai-guidelines, AGENTS.md, CLAUDE.md, .cursor/rules, or any .agents/.claude/.cursor skills.
---

# prj-sync — refresh repo AI docs and skills

Use this skill after any of:

- `npm install` upgraded `@pagesmith/core`, `@pagesmith/site`, or `diagramkit`.
- A new package skill appeared under `node_modules/<pkg>/skills/`.
- A repo convention changed (a new collection, a new `meta.json5` field, a new validator, a renamed CLI script).
- The user explicitly asks to refresh the AI docs or skill wrappers.

## Read first

1. `ai-guidelines/README.md`, `ai-guidelines/packages.md`, `ai-guidelines/workflows/update-docs.md` — current repo state.
2. `node_modules/@pagesmith/core/REFERENCE.md`
3. `node_modules/@pagesmith/site/REFERENCE.md`
4. `node_modules/diagramkit/REFERENCE.md`
5. `node_modules/@pagesmith/core/skills/pagesmith-core-setup/SKILL.md`
6. `node_modules/@pagesmith/site/skills/pagesmith-site-setup/SKILL.md`
7. `node_modules/diagramkit/skills/diagramkit-setup/SKILL.md`

Confirm the **installed** versions before editing anything:

```bash
node -p "require('./node_modules/@pagesmith/core/package.json').version"
node -p "require('./node_modules/@pagesmith/site/package.json').version"
node -p "require('./node_modules/diagramkit/package.json').version"
```

If a `node_modules/<pkg>/REFERENCE.md` file is missing, the package install is broken — run `npm install` before continuing.

## Authoritative directories

| Directory                       | Purpose                                                                                                                 | Edit policy                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `ai-guidelines/`                | Repo-local source of truth for routing, content rules, markdown supplement, diagram supplement, package map, workflows. | **Edit here first.** Everything else is downstream.                    |
| `AGENTS.md`, `CLAUDE.md`        | Agent-readable repo entry points. Thin pointers into `ai-guidelines/` and the installed package references.             | Edit after `ai-guidelines/` updates.                                   |
| `.cursor/rules/*.mdc`           | Cursor-specific rules (always-on, file-pattern, agent-requestable).                                                     | Edit after `ai-guidelines/`.                                           |
| `.agents/skills/prj-*/SKILL.md` | Canonical project skills (folder-per-skill with `SKILL.md` inside).                                                     | Edit here. **Do not duplicate** content into `.claude/` or `.cursor/`. |
| `.claude/skills/prj-*/SKILL.md` | Thin wrappers pointing at `.agents/skills/prj-*/SKILL.md`.                                                              | Regenerate from a template. Never write content here.                  |
| `.cursor/skills/prj-*/SKILL.md` | Same — thin wrappers pointing at `.agents/skills/prj-*/SKILL.md`.                                                       | Regenerate from a template.                                            |

## Wrapper templates

### `.claude/skills/prj-<name>/SKILL.md`

```markdown
---
name: prj-<name>
description: <copy from .agents/skills/prj-<name>/SKILL.md frontmatter>
---

# prj-<name>

Follow [`.agents/skills/prj-<name>/SKILL.md`](../../../.agents/skills/prj-<name>/SKILL.md). Do not duplicate its content here.
```

### `.cursor/skills/prj-<name>/SKILL.md`

Same template — Cursor reads `.cursor/skills/<name>/SKILL.md`. The relative path `../../../.agents/...` resolves correctly from both `.claude/skills/<name>/SKILL.md` and `.cursor/skills/<name>/SKILL.md`.

## Refresh workflow

1. **Diff installed package surfaces.**

   ```bash
   ls node_modules/@pagesmith/core/skills
   ls node_modules/@pagesmith/site/skills
   ls node_modules/diagramkit/skills
   ```

   Note any new skill folders that should appear in `ai-guidelines/packages.md`.

2. **Refresh `ai-guidelines/packages.md`** — fix every `node_modules/<pkg>/...` path so it points at the actual installed file. The current layout is:
   - `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/{setup-core,usage,markdown-guidelines,errors,migration,recipes,changelog-notes,core-guidelines}.md`
   - `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/{setup-site,usage,site-guidelines,errors,migration,recipes,changelog-notes}.md`
   - `node_modules/diagramkit/ai-guidelines/{usage,diagram-authoring}.md`, `node_modules/diagramkit/llms.txt`, `node_modules/diagramkit/llms-full.txt`, `node_modules/diagramkit/REFERENCE.md`, plus `node_modules/diagramkit/skills/diagramkit-{setup,auto,mermaid,excalidraw,draw-io,graphviz,review}/SKILL.md`.

   Update the `<!-- Last synced: YYYY-MM-DD -->` marker and the version comments at the top.

3. **Refresh `ai-guidelines/markdown.md` and `ai-guidelines/diagrams.md`** — keep the upstream link list current. These supplements should never restate upstream content; they should link out and capture only the project-specific layer.

4. **Refresh the workflow docs** under `ai-guidelines/workflows/` to reflect any new validators or scripts. Use the package map as the source of truth for paths.

5. **Refresh `AGENTS.md` and `CLAUDE.md`** — same path corrections, same version sweep, no duplication of `ai-guidelines/` content.

6. **Refresh `.cursor/rules/*.mdc`** — they may inline package paths; keep them in sync.

7. **Regenerate the `.claude/skills/` and `.cursor/skills/` wrappers** from the template above. For every `prj-*` folder under `.agents/skills/`, ensure a matching wrapper exists in both `.claude/skills/<name>/SKILL.md` and `.cursor/skills/<name>/SKILL.md`. Remove any stale wrappers (e.g. for retired skills).

8. **Verify** with the validators:

   ```bash
   npm run validate
   npm run validate:full
   npm run validate:diagrams
   vp check
   ```

   Then spot-check a handful of `node_modules/<pkg>/...` paths referenced in the docs to confirm they resolve.

## Operating rules

- **Single source of truth.** Repo guidance lives in `ai-guidelines/`. Skill bodies live in `.agents/skills/prj-*/SKILL.md`. Never duplicate content into `.claude/` or `.cursor/` — those folders only hold thin pointers.
- **No invented paths.** Every `node_modules/<pkg>/...` reference must exist in the freshly installed `node_modules`. If the upstream renames a file, the only acceptable response is to update the local pointer to the new path.
- **Keep wrapper files thin.** They contain frontmatter, a one-line follow-link, and nothing else.
- **Do not reintroduce `@pagesmith/docs` references.** This repo runs core + site directly.
