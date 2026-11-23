# Archetypes and editorial standards

## Editorial thesis: evolution-first, right-sized design

Interview answers jump to the planet-scale design; real companies rarely need it. Design X, Building Block and Business Story articles **evolve the system incrementally**: start with the simplest thing that works, and unlock each level with an explicit **trigger** (growth, a scale threshold, an incident, a feature request, cost, or an org change). Each level shows only what is required, what is **deliberately deferred**, and when the design must be **replaced** rather than extended. The articles demonstrate judgement, not maximal architecture.

Source: `.junie/plans/interactive-articles-platform.md` (Editorial thesis, FR 10).

## Visual-first explanation

- Write short **key-point bullets paired with figures**. Long prose paragraphs are the exception.
- A static image (WebP, light + dark) shows the one case discussed; the reader can switch it to an **interactive view** covering the other cases (other levels, failures, configurations).
- A stage may carry several figures when it helps.

## The four archetypes (`article.json` `archetype`)

| Archetype | Value | Shape |
| :--- | :--- | :--- |
| Standard visual article | `standard` | Crisp prose + Summary (Quick Read) + light/dark visuals + Expressive Code |
| Design X system design guide | `design-x` | Evolution Ladder + stages L0…Ln from `data/evolution.json` + `data/topology.json`; interactive topology with failure/slowdown injection, level picker, Generic ↔ AWS toggle, sourced build-vs-buy cost model |
| Business strategy & migration story | `business-story` | Constraint/trade-off configurators for real migrations (e.g. CMS swap, SSG → SSR, multi-region, multi-tenant); evolution-first where useful |
| System design building block | `building-block` | One primitive (CDN, KV store, pub/sub, Bloom filter): when/why, tuning by workload, vendor trade-offs, internals, how to build one; evolution-first where useful |

`design-x` must ship `data/evolution.json` + `data/topology.json` passing E1–E10, every stage figure WebP, and a cost tier per `costTierId` (publish gate, plan §11).

## Right-size each level (mandatory for every evolution article)

Every stage must have:

1. A **concrete trigger** (`trigger.kind` + headline + scenario). Level 0 is the `baseline` launch.
2. The **minimum design** that satisfies that trigger, and nothing more.
3. A **deferred list** (`decision.defer[{ item, until }]`) naming what is deliberately not built yet and the condition that would bring it in.
4. **Exit criteria** (`exitCriteria[]`): the observable signal that forces the next level. Required on every stage except the last.
5. A **build-vs-buy verdict** (`buildVsBuy.verdict`: `configure` | `buy` | `build`, with options and rationale).
6. A **cost band** (`costTierId` → `data/cost-models.json`), sourced or labelled `ASSUMPTION:`.

And:

- **No component may appear before the level whose trigger justifies it.** If a node shows up in a figure, lab scenario or decision before the stage that `add`s it, the design is over-built.
- Mark a stage `mode: 'replace'` when a design is swapped rather than extended, and list what it retires in `decision.remove` (non-empty).
- Put the qualifier in the title when replacing (e.g. "replace (store)", "replace (matcher)").

### Mechanical enforcement: E1–E10 (plan §4.2.1)

| # | Rule | Enforced in |
| :--- | :--- | :--- |
| E1 | Stage `id`s unique | `EvolutionSchema` `superRefine` (`src/lib/articles/schema.ts`) |
| E2 | `stages[i].level === i` (contiguous from 0, array order) | `superRefine` |
| E3 | `stages[0].mode === 'baseline'` | `superRefine` |
| E4 | `trigger` required when `level > 0` | `superRefine` |
| E5 | `decision.remove` non-empty when `mode === 'replace'` | `superRefine` |
| E6 | `exitCriteria` non-empty on every stage but the last | `superRefine` |
| E7 | `costTierId` exists in `data/cost-models.json` `tiers[].id` | `checkEvolutionRefs()` (`src/lib/articles/evolution.ts`) |
| E8 | Every `decision.add/change/remove` id exists in `data/topology.json` `nodes[].id` | `checkEvolutionRefs()` |
| E9 | `figures[].visual` → `diagrams/<visual>-{light,dark}.webp` exist (warning before `generated.lock.json` exists / before publish; error after) | `checkEvolutionRefs()` |
| E10 | No node before the stage that adds it: `add` ids not already active; `change`/`remove` ids active in the previous stage; figure/lab references inside the stage's active set | `checkEvolutionRefs()` |

Never reimplement E7–E10 elsewhere; import `checkEvolutionRefs` (P24). The `article-reviewer` checklist covers the judgement part that code cannot (is the trigger concrete? is the deferred list honest?).

## AI-era economics and real-world bottlenecks

Every design accounts for what AI tooling changes and what it does not:

| Cheaper now (say so) | Still the bottleneck (say so) |
| :--- | :--- |
| Throwaway deterministic tools and bridges (rule compilers, codemods, shadow-replay verifiers) | Cross-team ownership and coordination |
| First drafts of code, tests and docs; high-coverage test generation | Migration adoption friction, DNS cutover, SEO sign-off |
| Automated upgrades | Timeline sequencing, staffing, contract and operational cost |

Speed-up claims for AI tooling are owner assumptions unless sourced; label them `ASSUMPTION:`.

## Generic ↔ AWS mapping

Design X articles present a cloud-agnostic design and an AWS-specific mapping (toggle in the lab). AWS specifics must cite official AWS docs/pricing (`us-east-1` unless stated). Prices: on-demand list price as the fact; negotiated enterprise discount only as a labelled assumption range.

## Article lifecycle (`article.json` `phase`)

`idea → discussing → prototyping → building → review → published`. Exit criteria per phase live in [workflows/article.md](workflows/article.md).
