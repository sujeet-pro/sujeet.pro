# sujeet.pro

Personal engineering blog and portfolio. Built with [@pagesmith/core](https://github.com/nicholasgriffintn/pagesmith) for content rendering and [diagramkit](https://github.com/nicholasgriffintn/diagramkit) for diagram generation.

## Prerequisites

- [Node.js 24](https://nodejs.org/) (LTS)
- [Vite+](https://viteplus.dev/) — `curl -fsSL https://vite.plus | bash`
- [Playwright Chromium](https://playwright.dev/) — `npx playwright install chromium` (for E2E tests and diagram rendering)

## Setup

```bash
git clone <repo-url>
cd v5.sujeet.pro
vp install             # Install dependencies (uses npm under the hood)
vp config              # Set up commit hooks
```

## Development

```bash
npm run dev                    # Dev server with hot reload (port 3000)
```

## Build & Preview

```bash
npm run build                  # Render diagrams + build site
npm run preview                # Serve production build (port 4000)
```

## Checks

```bash
vp check                       # Format + lint + type-check (Oxfmt + Oxlint + tsgo)
vp check --fix                 # Auto-fix formatting and lint issues
```

## Testing

```bash
vp test                        # Unit tests (Vitest)
npm run test:e2e               # E2E tests (Playwright)
```

## Content Validation

```bash
npm run validate               # Check all frontmatter against schemas
npm run check-orphans          # Find unreferenced assets in content/
```

## Diagrams

Write `.mermaid`, `.excalidraw`, `.drawio`, or `.dot` source files in `<article>/diagrams/`, then render:

```bash
npm run diagrams               # Render changed diagrams only
npm run diagrams:force         # Re-render all diagrams
npm run diagrams:watch         # Watch mode
```

See [ai-guidelines/diagrams.md](ai-guidelines/diagrams.md) for authoring details.

## Content Structure

```
content/
  site.json5                   # Site-wide config (nav, social, analytics)
  redirects.json5              # URL redirects
  README.md                    # Homepage
  articles/
    meta.json5                 # Series definitions, layout config
    README.md                  # Articles listing page
    <slug>/README.md           # Article content (flat, no category nesting)
  blogs/
    meta.json5
    README.md                  # Blog listing page
    <slug>/README.md           # Blog post
  projects/
    meta.json5
    <slug>/README.md           # Project page
```

See [ai-guidelines/content-structure.md](ai-guidelines/content-structure.md) for metadata and frontmatter requirements.

## Toolchain

| Tool                                                              | Purpose                                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Vite+](https://viteplus.dev/)                                    | `vp check` (Oxlint + Oxfmt), `vp test` (Vitest), `vp staged` (commit hooks) |
| [Node.js 24](https://nodejs.org/)                                 | Runtime (LTS) — managed by Vite+                                            |
| [tsx](https://tsx.is/)                                            | TypeScript script runner for build/dev/preview                              |
| [esbuild](https://esbuild.github.io/)                             | Runtime JS bundling                                                         |
| [@pagesmith/core](https://github.com/nicholasgriffintn/pagesmith) | Content layer, markdown pipeline, custom JSX runtime, CSS bundling          |
| [diagramkit](https://github.com/nicholasgriffintn/diagramkit)     | Diagram rendering — Mermaid, Excalidraw, Draw.io, Graphviz → SVG            |
| [Playwright](https://playwright.dev/)                             | E2E testing (navigation, sidebar, TOC, responsive layout, themes)           |

## CI/CD

Deploys to GitHub Pages via `.github/workflows/gh-pages.yml` on push to `main`. Uses `setup-vp` for Node.js management in CI.

## AI Agent Support

This repo provides AI guidelines for Claude Code, Cursor, and Codex:

- `CLAUDE.md` — Claude Code project context
- `AGENTS.md` — Cursor / Codex project context
- `ai-guidelines/` — Shared content authoring guidelines
- `.claude/skills/` — Claude Code skills (`/sp-doc`, `/sp-sync`)
- `.cursor/rules/` — Cursor rules
