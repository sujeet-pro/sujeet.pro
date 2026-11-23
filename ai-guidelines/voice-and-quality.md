# Voice and quality

Accuracy is priority #1. Everything else in this file serves it.

## Register

- Write like a senior engineer briefing peers (Directors, VPs, Staff+ engineers): formal but conversational, direct, no hand-holding on fundamentals.
- Lead with the decision or the number, then the reasoning. Prefer tables, bullets and diagrams over paragraphs (see the visual-first rule in [archetypes-and-standards.md](archetypes-and-standards.md)).
- Light wit is fine where natural; never in incident or failure narratives.
- Push back with evidence. Name trade-offs and failure modes; no cheerleading.

## UI copy never names the audience

The register is for the writing, not a label. UI strings never mention the reader's seniority or role.

| Do | Don't |
| :--- | :--- |
| `Summary` (the Quick Read label in `src/components/ui/QuickRead.astro`) | `Principal Engineer Summary`, `For Senior Engineers`, `Staff+ takeaways` |
| A plain description of the content | `Principal-level deep dive` |

This applies to headings, aria-labels, page titles, OG text, LinkedIn copy, audio scripts and `llms.txt`.

## Banned filler

Never use these words or phrases in prose, UI copy, commit messages, PR text or agent output:

`in conclusion`, `it's worth noting`, `robust`, `seamless` / `seamlessly`, `leverage` (as a verb), `delve`.

Also cut: throat-clearing intros ("In today's fast-paced world…"), restating the question, empty intensifiers ("very", "truly", "incredibly"), and closing summaries that repeat the bullets above them.

## Citation gate

| Claim type | Requirement |
| :--- | :--- |
| Cloud quotas, limits, latencies, prices (AWS, Cloudflare, vendors) | Official documentation or pricing page URL, inline or in `cost-models.json` `sources[]`; set `pricingAsOf` to the research date |
| Algorithms / math (e.g. Bloom-filter false-positive rate) | Primary paper or textbook source |
| Codebase facts | `path:line` |
| Anything not sourceable | Remove it, or keep it with text beginning **`ASSUMPTION:`** (data files: the `assumption` field; prose/UI: visible label) |

- Never invent links, limits, metrics, version numbers or CLI flags. If you could not open the source, say so.
- Ranges that are judgement calls (enterprise discount %, ownership FTE, "faster first drafts") are owner assumptions and must be labelled as such in the UI.
- Do not copy numbers from the prototypes into production content; prototype numbers are illustrative (plan §8 6.1, V1–V12).

## Quality bar for content

- Every stage of an evolution article passes "right-size each level" ([archetypes-and-standards.md](archetypes-and-standards.md)).
- Keep claims falsifiable: say what would change the decision.
- Prefer one precise sentence over three hedged ones. Hedge only when the evidence is actually uncertain, and say what is uncertain.

## Agent output

- Reports to the owner: concise, tables over prose, `path:line` references, assumptions listed explicitly.
- Never claim a command passed without running it; paste the decisive output lines.
- Commits only when the owner asks. Conventional commits.
