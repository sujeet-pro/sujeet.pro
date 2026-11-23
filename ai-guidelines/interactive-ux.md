# Interactive UX rules

Keyboard-first, zero-CLS, readable without JS. Budgets come from `sp.config.ts` `qaBudgets`.

## De-clutter

- Reading pages ship no graph library JS. The Connections panel is static Astro; `/explore/` is the only graph view.
- Commands for features that are not built (or not available on this page) are **hidden**, not shown dead.
- One clear primary action per surface. No decorative motion.

## Uniform container (plan §6.1)

| Rule | Detail |
| :--- | :--- |
| One token | `--sp-container: 1140px`, `padding-inline: 20px`, `max-width: calc(var(--sp-container) + 40px)`, `margin-inline: auto` |
| Applies to | Top bar inner row, breadcrumb bar, article header, Quick Read, Evolution Ladder, stage blocks, lab, Connections panel, footer, audio bar inner row (full-bleed backgrounds allowed; inner row uses the container) |
| Text runs | Left-aligned, `max-width: var(--sp-measure)` (`68ch`); never centred |
| Forbidden | `--sp-breakout`, centred prose columns, per-component max-widths. Gate: `rg -n 'sp-breakout' src/ -g '!**/prototypes/**'` returns nothing |
| Acceptance | At 1280px container left/right edges equal within ±1px; at 390px `scrollWidth <= clientWidth` in Light and Dark |

`--sp-container` / `--sp-measure` in `src/styles/global.css` must equal `spConfig.layout.containerPx` / `measureCh`.

## Stage layout: owner pick `hybrid`

From `sp.config.ts` `layout`: `stageVariant: 'hybrid'`, `hybrid: { base: 'stacked', wide: 'split', wideMinPx: 1200 }`, `figureExpand: true`.

- One DOM per stage. `base` arrangement by default, `wide` only inside `@media screen and (min-width: 1200px)` emitted at build time (`src/components/evolution/layout.ts`). No JS measurement, CLS 0.
- Print and `data-sp-export="pdf"` always use `base`.
- Only `stacked` and `split` CSS ship. `scrolly` and `stepper` are not built (if ever revisited, P25 applies).
- **Expand**: every stage figure has an Expand control opening a full-viewport Radix dialog (image or interactive); Esc restores focus to the opener.
- **Image ⇄ Interactive toggle** (P27): fixed-aspect frame for both modes (CLS delta 0); the topology island hydrates only on intent (`client:visible` gated by the toggle, or dynamic import on click). No `@xyflow/react` in stage figures.

## Keyboard

- **One dispatcher** (`src/lib/keyboard/dispatcher.ts`) owns the single `keydown` listener. Islands call `on(action, handler)`. Never add another global `keydown` listener — this includes stage navigation (`j`/`k`, P23).
- Bindings live only in `sp.config.ts` `shortcuts` (`mod+k`, `/`, `>`, `?`, `t`, `p`, `[`, `]`, `j`, `k`, `l`, `g h`, `g e`). No bare `d` key.
- Ignore when `ev.isComposing`, target is `input`/`textarea`/`select`/`[contenteditable]`/range/`[role=slider]`, or inside `.react-flow`. Ignore meta/ctrl/alt except `mod+k`. **Allow Shift**; match on `ev.key` (P14).
- **WCAG 2.1.4**: single-key shortcuts are user-toggleable (`singleKeyShortcuts` in `sp-v8-prefs`; toggle in the `?` sheet). `mod+k` always works.
- While a Radix dialog is open, the dispatcher only handles `mod+k`; Radix owns Tab trap, Esc and arrow keys.

## Dialogs and floating UI

- Radix `Dialog` for every modal (palette, shortcuts, figure Expand). Always include a (visually hidden if needed) `Dialog.Title` / `Description`.
- Esc and close restore focus to the opener; blur focused descendants before hiding (P15).
- Popovers and menus clamp to the viewport on open **and** on `resize` (P16).

## Command palette

- `cmdk` with `shouldFilter={false}`; filter structural rows yourself.
- Fixed group order: **Series → Articles & Tabs → Sections → Full-Text Matches → Commands**. `>` mode shows Commands only.
- Dedupe Pagefind hits by `canonicalPathname + '#' + fragment`; discard stale responses; debounce (≈480 ms cold, 160 ms warm).
- In `astro dev`, Pagefind is absent: show "Full-text search available after build".

## Theme and preferences

- Pre-paint inline script sets `data-sp-scheme` (resolved `light|dark`), `data-sp-scheme-pref`, `data-sp-contrast`, `data-sp-text`, `data-sp-nav-series`; no FOUC.
- Re-apply after `ClientRouter` swaps (`astro:after-swap`), re-sync on `astro:page-load` (P11).
- Everything themed keys off `data-sp-scheme` (Tailwind variant, Expressive Code, `ThemedVisual`), never `prefers-color-scheme` directly.

## Audio persistence

- One `<audio>` element persisted across article tabs via `ClientRouter` + `transition:persist`; `currentTime` must be monotonic across navigation and Back.
- Keys: `p` play/pause, `[` / `]` seek ∓15 s. Jump to Section scrolls to `#id` on the target tab.

## Print guard

- When an article has a PDF, `@media print` hides interactive DOM and prints a single Print Notice pointing at `/<slug>/<slug>.pdf` and the live URL.
- Scope print-guard CSS with `:root:not([data-sp-export="pdf"])` so the PDF renderer is not blocked (P2).

## Core Web Vitals budgets (`sp.config.ts` `qaBudgets`)

| Metric | Budget | Gate |
| :--- | :--- | :--- |
| CLS | < 0.05 | Hard in CI and locally |
| LCP (lab, cold mobile) | < 2,500 ms | Warn-only in CI, strict locally via `article-qa` |
| INP (field target) | ≤ 200 ms | Warn-only in CI |
| First palette open | < 200 ms | Local QA |
| `graph-index` size | < 25 KB gzipped | Local QA |
