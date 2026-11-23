# Workflow: `article-media` — visuals, audio, PDF, lock hashes

Use when an article needs generated binaries: diagram WebPs (including per-stage figures), thumbnails, the LinkedIn card, podcast audio, or the branded PDF. All of it runs **locally on the owner's Apple-Silicon Mac**; CI never runs media pipelines. Read first: [../architecture.md](../architecture.md) (visibility tiers), [../commands.md](../commands.md).

## Pipelines

| Pipeline | Command | Status (2026-11-23) | Outputs (inside `src/articles/<slug>/`) |
| :--- | :--- | :--- | :--- |
| Visuals | `npm run visuals -- --slug <slug>` | **Not built yet** (Stage 4.1) | `diagrams/<name>-{light,dark}.webp`, per-stage `diagrams/stage-l<n>-{light,dark}.webp`, `social/thumbnail-{light,dark}.webp` (800×450), `social/thumbnail.png`, `social/linkedin-card.png` (1200×628, < 5 MB) |
| Audio | `npm run audio -- --slug <slug>` | **Built** (`scripts/render-audio.mjs` + `scripts/audio/synthesize_mlx.py`) | `audio/episode.mp3`, `audio/chapters.json` |
| PDF | `npm run pdf -- --slug <slug>` | **Not built yet** (Stage 4.4) | `exports/<slug>.pdf` |

Every pipeline writes `generated.lock.json` (`GeneratedLockSchema`): per artifact `pipeline`, `inputHash`, `outputHash`, `toolVersion`, `generatedAt`. Re-runs with unchanged inputs are no-ops, so `git status` stays clean (P19).

## When to run

| Change | Run |
| :--- | :--- |
| `data/evolution.json` / `data/topology.json` / diagram spec changed | `visuals` (per-stage WebPs must match the interactive topology; E9 turns into an error once a lock exists or the article is published) |
| `audio/script.json` or `sp.config.ts` `audio` changed | `audio` |
| Any page content changed and `features.pdf` is true | `pdf` |
| Title / Quick Read / ladder changed | `visuals` (thumbnails, LinkedIn card) |

Set `features.audio` / `features.pdf` to `true` in `article.json` only after the corresponding pipeline has produced its outputs.

## Audio

First-time machine setup: [../setup/local-audio.md](../setup/local-audio.md) (`bash scripts/setup-audio.sh`).

1. Author `audio/script.json` (`AudioScriptSchema`): podcast order, one host, `{ text, spoken? }` paragraphs, a `lexicon` for acronyms (e.g. `DynamoDB`, `P99`, `KeyValueStore`), chapters with `targetSectionId` (`evolution-ladder`, `stage-l<n>`) and optional `targetVisualId`.
2. `npm run audio -- --slug <slug>`.
3. Check the run log: `synthesizer calls`, `loudnorm pass 1 I=…`, `lock updated|unchanged`.
4. Acceptance: a second run prints `up to date … skipping` with zero synthesis calls; `ffmpeg -i audio/episode.mp3 -af ebur128 -f null - 2>&1 | rg 'I:'` reports −16 ± 1 LUFS.

**Never run `--force` casually.** Kokoro synthesis is not deterministic: forcing a re-render on a fresh clone replaces the committed MP3 with a different one. The lock skip is what protects normal runs.

## Per-stage visuals (evolution articles)

- One `diagrams/<visual>-{light,dark}.webp` per `figures[]` entry; flagship convention `stage-l<n>`.
- Render with the same SVG drawing code as `SystemTopology` `stage` mode, so static and interactive views cannot drift. Output aspect = `topology.viewBox`, matching the `ExplainerFigure` frame (CLS 0).
- The LinkedIn card for evolution articles renders the Evolution Ladder (levels, mode badges, cost bands) with title and `sujeet.pro` branding.

## Size budgets

| Artifact | Budget |
| :--- | :--- |
| `episode.mp3` | 64 kbps mono, 24 kHz (≈ 0.48 MB per minute) |
| `linkedin-card.png` | < 5 MB (validator error) |
| Thumbnails | 800×450 WebP light/dark + PNG fallback |

## Guardrails

- `audio/script.json`, `audio/.cache/`, `diagrams/.cache.json`, `/print-export/` are local-only; they must never reach `dist/`.
- Commit binaries + `generated.lock.json` only when the owner asks.
- Do not hand-tune chapter times to compensate for MP3 encoder priming (P21).
