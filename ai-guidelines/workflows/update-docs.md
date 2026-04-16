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

Then read the version-matched upstream references:

- `node_modules/@pagesmith/core/REFERENCE.md`
- `node_modules/@pagesmith/core/ai-guidelines/usage.md`
- `node_modules/@pagesmith/core/ai-guidelines/core-guidelines.md`
- `node_modules/@pagesmith/core/ai-guidelines/markdown-guidelines.md`
- `node_modules/@pagesmith/core/ai-guidelines/recipes.md`
- `node_modules/@pagesmith/core/ai-guidelines/errors.md`
- `node_modules/@pagesmith/core/ai-guidelines/migration.md`
- `node_modules/@pagesmith/core/ai-guidelines/changelog-notes.md`
- `node_modules/@pagesmith/site/REFERENCE.md`
- `node_modules/@pagesmith/site/ai-guidelines/setup-site.md`
- `node_modules/@pagesmith/site/ai-guidelines/usage.md`
- `node_modules/@pagesmith/site/ai-guidelines/site-guidelines.md`
- `node_modules/@pagesmith/site/ai-guidelines/recipes.md`
- `node_modules/@pagesmith/site/ai-guidelines/migration.md`
- `node_modules/diagramkit/ai-guidelines/usage.md`
- `node_modules/diagramkit/ai-guidelines/diagram-authoring.md`
- `node_modules/diagramkit/ai-guidelines/llms.txt`
- `node_modules/diagramkit/ai-guidelines/llms-full.txt`

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
- `scripts/postbuild.ts`

## Update order

1. Update `ai-guidelines/` first.
2. Then update the thin wrappers in `.claude/`, `.cursor/`, and `.agents/`.
3. Then update `AGENTS.md`, `CLAUDE.md`, and Cursor rules.

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
