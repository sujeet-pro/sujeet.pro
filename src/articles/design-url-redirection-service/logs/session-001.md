# Session 001 — decisions log (2026-11-23)

Covers the preview review (`prototypes/v1.html`, `prototypes/v2.html`), the research pass (plan §8 6.1, claims V1–V12) and the production build of this article through Stage 6.5.

## Preview feedback and owner picks

| # | Topic | Decision | Source of the decision |
| :--- | :--- | :--- | :--- |
| D1 | Stage layout (v2 variant pick) | **`hybrid`**: `stacked` base, promoted to `split` at ≥ 1200px via CSS, plus an **Expand** button that opens the figure in a full-viewport dialog (`figureExpand: true`). Only `stacked` and `split` CSS ship; `scrolly` and `stepper` are not built. | Owner, in their words: "a combination of split and stacked, depending on the size and ideally a button to enlarge the interactive element — or maybe a configuration. Ideally stacked so it's easier to read." Recorded in `sp.config.ts` `layout` and `docs/implementation-plan.md` §4.1. |
| D2 | Why `hybrid` over a single layout | Preview §7.3 trade-offs: `split` shrinks diagram sub-labels to ~8px in a ~470px column at L3–L5; `stacked` keeps diagrams legible and prints well but leaves whitespace on wide screens. `hybrid` reads like `stacked` by default and uses the width when it exists; Expand covers the small-figure case. The breakpoint is config, not code (`hybrid.wideMinPx`). | `docs/preview-guide.md` §7.3 |
| D3 | Quick Read label | UI copy says **"Summary"**, never "Principal Engineer Summary" or any label naming the audience's seniority. Applies to headings, aria-labels, OG text, LinkedIn copy, audio scripts and `llms.txt`. | `ai-guidelines/voice-and-quality.md`; `src/components/ui/QuickRead.astro` |
| D4 | Prototype numbers | Every preview number was treated as illustrative and replaced from primary sources; nothing was copied from v1/v2 into production data. | Plan §8 6.1 |
| D5 | Site-wide WIP banner | **Kept.** The "Work in progress" banner in `src/layouts/BaseLayout.astro` stays until the owner removes it; agents don't remove it. | Owner |

## Research-driven redesigns (6.1 → 6.8 → 6.2)

The research pass changed the design, not only the numbers. Each change below is reflected in `data/evolution.json` and cited on the page.

| Level | Preview design | Finding (primary source) | Production design |
| :--- | :--- | :--- | :--- |
| L0 | A static redirect map served by the CDN | CloudFront has no declarative redirect rules; S3 website routing rules stop at 50 per configuration; S3 website endpoints don't serve HTTPS; a CloudFront Function's code is capped at 10 KB | Zero-byte S3 objects with `x-amz-website-redirect-location` (always 301) behind CloudFront; Amplify Hosting or Cloudflare Bulk Redirects when 302s matter |
| L3 | Bloom filter at the edge | A 10M-slug filter at 1% FP ≈ 12 MB (9.585 bits/key, k = 7; Broder & Mitzenmacher §2.1). KVS allows a 1 KB value and a 5 MB store; CloudFront Functions allow 10 KB of code and 2 MB of memory (quotas re-confirmed against `cloudfront-limits.html`) | Filter runs in-process in the regional Fargate service in front of DynamoDB; the edge keeps the KVS hot set and caches 404s; Lambda@Edge listed as the alternative at $0.60 vs $0.10 per 1M requests with no KVS access |
| L4 | Firehose → S3 → Athena with an illustrative cost formula | Firehose bills each record rounded up to 5 KB, so a ~250 B click line bills at 20× its size | Aggregate before Firehose; the cost model shows the unaggregated worst case and says so; standard logs to S3 when minutes of delay are fine |
| L5 | Active-active Regions on global tables | DynamoDB global tables default to last-writer-wins, replicating "typically within a second or less" | One write Region per tenant; strong-consistency mode deferred until a tenant contract requires zero data loss |
| Lab | Ownership FTE (0.05 / 0.25 / 0.5 × $18k/month) and "~2–3× faster first drafts" (V12) | No primary source | Dropped from the cost model; the enterprise discount range (25–40%) stays, labelled ASSUMPTION |

Cost tiers are one per level (`l0`…`l5`, E7). Prices are `us-east-1` list as of 2026-11-23; volumes are labelled modelling assumptions.

## Audio

| # | Decision | Why |
| :--- | :--- | :--- |
| A1 | Loudness chain: `alimiter` (limit 0.2) before both `loudnorm` passes | Kokoro output has a ~20 dB peak-to-loudness ratio; without the limiter `loudnorm` falls back to dynamic mode and lands at −17.1 LUFS (fails −16 ± 1). With it, −16.3 LUFS. Plan §8 4.3. |
| A2 | Never `npm run audio -- --force` casually | Kokoro synthesis is not deterministic; the lock skip protects the committed MP3. |
| A3 | `audio/script.json` follows the evolution: ladder → L0–L1 → L2 → L3 → L4 → L5 → lab | Plan §8 6.4 amendment; chapters jump to `evolution-ladder`, `stage-l<n>` and the lab's `topology-simulator`. Spoken numbers and units are expanded in `spoken`; acronyms go through the lexicon. |
| A4 | `features.audio` stays `false` until the pipeline has produced `episode.mp3` + `chapters.json` | `ai-guidelines/workflows/article-media.md` |

## Social

- `social/linkedin.md` drafted (≤ 1,300 characters, one link, two hashtags); hook is the 200-object starting point, the surprising fact is that the 12 MB Bloom filter can't live in edge KV.
- `social/linkedin.json`: `drafted`, synced to article version 1. The owner posts manually.

## Open items

- Run `npm run visuals`, `npm run audio`, `npm run pdf` on the owner's machine, then flip `features.audio` / `features.pdf`.
- `tests/article.e2e.ts` (6.5) and hardened CI (6.7).
- Lab page prose still carries a `TODO(S6)` placeholder line under "Topology simulator".
