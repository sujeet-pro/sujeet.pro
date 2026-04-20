---
name: prj-doc
description: Route any sujeet.pro content task to the correct project skill. Use when the user asks for an article, blog, diagram, validation pass, or repo-wide content review and the right specialised skill is not yet obvious.
---

# prj-doc — sujeet.pro task router

This is the entry-point skill for sujeet.pro content work. It routes the request to one of the specialised `prj-*` skills (article, blog, diagram, validation, content authoring, doc/skill sync), then steps out of the way.

## Read first

These three files describe the project surface and must be loaded before routing:

1. `ai-guidelines/README.md` — task map, content model overview, validation commands.
2. `ai-guidelines/content-structure.md` — articles/blogs frontmatter, companion `meta.json5` / `home.json5` / `redirects.json5` rules.
3. `ai-guidelines/packages.md` — current Pagesmith + diagramkit integration and the canonical reference paths (which are the only source of truth for the installed versions).

## Routing table

| User intent                                                                                                                           | Route to                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Create / update / review an article under `content/articles/...`                                                                      | `.agents/skills/prj-article/SKILL.md`                            |
| Create / update / review a blog under `content/blogs/...`                                                                             | `.agents/skills/prj-blog/SKILL.md`                               |
| Create / update a diagram (any engine)                                                                                                | `.agents/skills/prj-diagrams/SKILL.md`                           |
| Author or revise prose-shape content (markdown features, frontmatter, captions, tables, alerts, code blocks) inside an existing entry | `.agents/skills/prj-content/SKILL.md`                            |
| Run validation (content, build output, diagrams)                                                                                      | `.agents/skills/prj-validate/SKILL.md`                           |
| Refresh `ai-guidelines/`, `AGENTS.md`, `CLAUDE.md`, or any skill wrapper                                                              | `.agents/skills/prj-sync/SKILL.md`                               |
| Project / portfolio entry under `content/projects/...`                                                                                | Decline unless the user explicitly asks — `projects/` is legacy. |

## Project guard rails (apply to every route)

- Stay on the `@pagesmith/core` + `@pagesmith/site` + `diagramkit` stack. **Never** reintroduce `@pagesmith/docs`, `pagesmith.config.json5`, or the `pagesmith-docs` CLI. The repo deliberately bypasses the preset CLI and wires Vite directly.
- Treat a single content edit as incomplete until you check the metadata companions (`content/meta.json5`, `content/<section>/meta.json5`, `content/home.json5`, `content/redirects.json5`).
- Anchor on the **locally installed** package surface — read from `node_modules/<pkg>/REFERENCE.md` and `node_modules/<pkg>/skills/...`, not training data, and run CLIs through `npx` (`npx pagesmith-site`, `npx diagramkit`, `npx pagesmith-core`) so they resolve to the project's bin.
- Do not hand-author final SVGs; every diagram has a `.mermaid` / `.excalidraw` / `.drawio` / `.dot` / `.gv` source under `diagrams/`.

## Validation commands

Use the smallest relevant set:

```bash
npm run diagrams           # render changed diagrams
npm run validate           # config + collections + cross-file refs
npm run validate:diagrams  # diagramkit validate (SVG structure + WCAG 2.2 AA)
npm run validate:content   # @pagesmith/site content validation only
npm run validate:full      # @pagesmith/site content + build validators + project cross-refs
npm run validate:dist      # bundled-asset, sitemap, link integrity in dist/
npm run validate:all       # validate + validate:diagrams + validate:full
vp check                   # format + lint + type-check
```

## Output rules

- Pick exactly one specialised skill. If the task spans two (e.g. "rewrite this article and re-render its diagrams"), route to the dominant one and use the other only as a sub-step.
- When in doubt, ask one short clarifying question before routing — never invent an answer that changes which skill runs.

## Related package skills

The specialised `prj-*` skills below all defer to these version-pinned upstream skills:

- `node_modules/@pagesmith/core/skills/pagesmith-core-setup/SKILL.md`
- `node_modules/@pagesmith/site/skills/pagesmith-site-setup/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-setup/SKILL.md`
- `node_modules/diagramkit/skills/diagramkit-review/SKILL.md`
