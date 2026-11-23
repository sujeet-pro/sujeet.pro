# Session 001 — draft stub (2026-11-23)

| # | Decision | Why |
| :--- | :--- | :--- |
| B1 | Phase `discussing`, archetype `building-block`, no `primarySeries`, not in `src/series/series.json` | Plan §8 6.6: this draft proves the unlisted tier. It is reachable by direct URL only (`noindex, nofollow`) and listed only by `/drafts-index.json`. |
| B2 | The flagship references it only through `<ArticleRef slug="bloom-filter-building-block" />` in L3 and its `relations[]` entry | A draft target renders as a "Coming Soon" card with no `href` and no slug attribute (`src/components/ui/ArticleRefCard.tsx`). No other page may link here until it is published. |
| B3 | `pages/index.mdx` is an outline: value proposition, sizing formula, placement vs memory and edge limits, deletes, TODO list | Sizing cites Broder & Mitzenmacher §2.1; edge limits reuse the flagship's verified CloudFront quotas. Everything else is a TODO until it has a primary source. |
| B4 | Social `not-started`; no `llms.txt` entry | Drafts never appear in `/llms.txt`; the post waits for `building`. |

## Next

- Move to `prototyping`: decide on an interactive sizer (n, p → m, k, memory) and a placement matrix.
- Research pass for counting filters, cuckoo/quotient filters and cache-module Bloom options (primary sources only).
