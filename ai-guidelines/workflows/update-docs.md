# Update Docs Workflow

Use this workflow when refreshing the repo's AI-facing docs and skill wrappers.

Managed surfaces:

- `ai-guidelines/`
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/skills/`
- `.cursor/skills/`
- `.cursor/rules/`
- `.agents/`

## Read first

Start with:

- `ai-guidelines/README.md`
- `ai-guidelines/packages.md`

Then read the version-matched upstream references. The Pagesmith packages no longer ship a top-level `ai-guidelines/` folder — every guideline now lives inside the matching skill's `references/` subfolder.

- `node_modules/@pagesmith/core/REFERENCE.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/SKILL.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/setup-core.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/usage.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/core-guidelines.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/markdown-guidelines.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/recipes.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/errors.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/migration.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/changelog-notes.md`
- `node_modules/@pagesmith/core/skills/pagesmith-core-write-validator/SKILL.md`
- `node_modules/@pagesmith/site/REFERENCE.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/SKILL.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/setup-site.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/usage.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/site-guidelines.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/recipes.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/references/migration.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-customize-theme/SKILL.md`
- `node_modules/diagramkit/REFERENCE.md`
- `node_modules/diagramkit/ai-guidelines/usage.md`
- `node_modules/diagramkit/ai-guidelines/diagram-authoring.md`
- `node_modules/diagramkit/llms.txt`
- `node_modules/diagramkit/llms-full.txt`
- `node_modules/diagramkit/skills/diagramkit-setup/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-auto/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-mermaid/SKILL.md`, `diagramkit-excalidraw`, `diagramkit-draw-io`, `diagramkit-graphviz`
- `node_modules/diagramkit/skills/diagramkit-review/SKILL.md`

Then read the local integration sources that define the current repo behavior:

- `site.config.json5`
- `vite.config.ts`
- `index.html`
- `src/theme.css`
- `src/client.ts`
- `diagramkit.config.json5`
- `content.config.ts`
- `schemas/site.ts`
- `schemas/frontmatter.ts`
- `schemas/content-data.ts`
- `schemas/diagramkit.ts`
- `src/entry-server.tsx`
- `theme/lib/content.ts`
- `scripts/validate.ts`
- `scripts/validate-pagesmith.ts`
- `scripts/validate-dist.ts`
- `scripts/postbuild.ts`
- `package.json` (`scripts.*`)

## Update order

1. Update `ai-guidelines/` first.
2. Then update the canonical skill bodies in `.agents/skills/<name>/SKILL.md`.
3. Then update / regenerate the thin wrappers in `.claude/skills/` and `.cursor/skills/` so they still match the template (frontmatter + one-line follow-link).
4. Then update `AGENTS.md`, `CLAUDE.md`, and Cursor rules.

Do not update wrappers first. They should reflect the canonical guidance, not define it.

## What to preserve

- Repo-specific editorial rules for articles and blogs
- The repo's current commands and folder layout
- The fact that this repo uses `@pagesmith/core` + `@pagesmith/site` directly and should not drift back toward `@pagesmith/docs`
- The repo's metadata companions: `content/meta.json5`, section `meta.json5`, `content/home.json5`, and `content/redirects.json5`
- The decision that `projects` is legacy and should not receive new guidance unless explicitly requested
- Thin wrappers that point back into `ai-guidelines/`

## What to avoid

- Copying large chunks of upstream package docs into every wrapper
- Inventing Pagesmith or diagramkit behavior
- Reintroducing `projects` as a first-class content surface in new skills
- Letting `.claude/`, `.cursor/`, and `.agents/` drift from one another

## Checklist

- Are the upstream file references still correct?
- Does `ai-guidelines/` reflect the installed package behavior?
- Do all wrappers point to `ai-guidelines/` instead of duplicating it?
- Do root docs describe the repo primarily as an articles-and-blogs site?
- Are commands still real and repo-native?

## Validation

After updating docs:

- scan for stale references to removed files or old paths
- make sure wrapper files still point to real `ai-guidelines/` docs
- run `ReadLints` on any changed config or rule files if needed

Only run repo commands when the changed docs materially affect build or content behavior.
