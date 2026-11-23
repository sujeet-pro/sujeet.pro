# Commands

## Dev server rule

Always start the dev server in background mode and manage it with the Astro CLI:

```bash
astro dev --background      # or: npx astro dev --background
astro dev status
astro dev logs
astro dev stop
```

Never leave a foreground `astro dev` blocking an agent session.

## npm scripts (`package.json`)

"Exists" = the backing file is in the repo as of 2026-11-23. Scripts whose file does not exist yet fail until their stage lands (plan §1 tracks status).

| Script | Runs | Exists | Use |
| :--- | :--- | :--- | :--- |
| `npm run dev` | `astro dev` | yes | Prefer `astro dev --background` |
| `npm run build` | `astro build && npx pagefind --site dist` | yes | Full static build + search index |
| `npm run preview` | `astro preview` | yes | Serve `dist/` |
| `npm run check` | `astro check` | yes | Types + `.astro` diagnostics (CI runs `npx astro check`) |
| `npm run validate` | `node scripts/validate.mjs` | **no** (Stage 5.1) | Pre-build manifest/graph/evolution/publish-gate checks |
| `npm run validate:dist` | `node scripts/validate-dist.mjs` | **no** (Stage 5.2) | Post-build crawl: links, anchors, leaks |
| `npm run validate:junie` | `node scripts/validate-junie.mjs` | yes | Validates `ai-guidelines/`, `.junie/`, `.claude/` wiring (CI) |
| `npm run test:e2e` | `playwright test` | **no config yet** (Stage 5.3) | E2E on a built `dist/` |
| `npm run visuals` | `node scripts/render-visuals.mjs` | **no** (Stage 4.1) | Diagrams, per-stage WebPs, thumbnails, LinkedIn card |
| `npm run audio` | `node scripts/render-audio.mjs` | yes | Podcast MP3 + chapters (local Apple Silicon; see [setup/local-audio.md](setup/local-audio.md)) |
| `npm run pdf` | `node scripts/render-pdf.mjs` | **no** (Stage 4.4) | Branded PDF export |

Pass arguments after `--`, e.g. `npm run audio -- --slug design-url-redirection-service`.

## Other scripts

| Command | Use |
| :--- | :--- |
| `bash scripts/setup-audio.sh` | Idempotent local audio setup + warm-up synthesis in a temp dir |
| `node scripts/validate-junie.mjs --live` | Also smoke-checks that the `junie` / `claude` CLIs are installed (assumption-gated; never in CI) |

## Verify chains

```bash
# quick (today)
npm run validate:junie && npx astro check && npm run build

# full target (plan §10), once Stage 5 lands
npm ci && npm run validate && npm run validate:junie && npx astro check && npm run build && npm run validate:dist && npm run test:e2e
```

## CI (`.github/workflows/deploy.yml`)

`npm ci` → `npm run validate:junie` → `npx astro check` → `npm run build` → Pages deploy. Media pipelines (`visuals`, `audio`, `pdf`) never run in CI; their outputs are committed with `generated.lock.json`.

## Search and git

- Search with `rg` / `fd`; GitHub via `gh`. No MCP server is required by this project.
- Commit only when the owner asks; conventional commits.
