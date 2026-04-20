# Agents Entry Points

Canonical project skills for sujeet.pro. Every skill is folder-shaped at
`.agents/skills/<name>/SKILL.md`. The `.claude/skills/<name>/SKILL.md` and
`.cursor/skills/<name>/SKILL.md` files are thin pointers to the canonical body
— never edit them directly. Edit the canonical body here.

Repo-local guidance lives in `ai-guidelines/`. Each skill below reads the
relevant `ai-guidelines/*.md` files, plus the version-pinned upstream skills
shipped inside `node_modules/@pagesmith/<pkg>/skills/` and
`node_modules/diagramkit/skills/`.

Available skills:

- `prj-doc` — route an unclear task to the right project skill (article, blog, content, diagrams, validate, sync).
- `prj-article` — create, update, or review articles under `content/articles/`.
- `prj-blog` — create, update, or review blogs under `content/blogs/`.
- `prj-content` — author or revise the prose / markdown body of an existing entry (markdown features, frontmatter, code blocks, themed images, citations).
- `prj-diagrams` — author, render, embed, and audit diagrams. Delegates to the `diagramkit-*` skills shipped under `node_modules/diagramkit/skills/`.
- `prj-validate` — run the full validation suite (content, diagrams, build, dist).
- `prj-sync` — refresh `ai-guidelines/`, root docs, rules, and skill wrappers after a package upgrade or convention change.
