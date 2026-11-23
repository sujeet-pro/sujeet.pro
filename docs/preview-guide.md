# Preview Guide — `prototypes/v1.html` and `prototypes/v2.html`

> **Two previews.** `v1.html` (§1–§6) shows the platform shell. `v2.html` (§7) keeps that shell and replaces the article body with the evolution-first L0–L5 design, in four switchable stage layouts. **Your next decision is which layout to use (§7.4).**

Stage 1 artifact for the `sujeet.pro` v8 rebuild. One self-contained HTML file (inline CSS + JS, no build, no network dependencies) that demonstrates the reading shell, multi-series navigation, the `⌘K` palette, the Design X lab, the audio companion and the print guard before any Astro code is written.

| Item | Value |
| :--- | :--- |
| File | `src/articles/design-url-redirection-service/prototypes/v1.html` (~4.8k lines) |
| Status | Done, reviewed (Stage 1 of `docs/implementation-plan.md`) |
| Indexing | `<meta name="robots" content="noindex, nofollow">` (already in file; keep it) |
| Production URL (after Stage 2) | `/design-url-redirection-service/prototype/` (latest) and `/design-url-redirection-service/prototype/v1/` |

---

## 1. Open it

| Context | How |
| :--- | :--- |
| Now (no platform yet) | Double-click the file, or `open src/articles/design-url-redirection-service/prototypes/v1.html` (macOS). Runs from `file://`. |
| Specific view | Append a hash route: `…/v1.html#/explore` |
| With query flags on `file://` | Put flags inside the hash: `…/v1.html#/article?ctx=series:edge-and-traffic-architecture`, `…/v1.html#/?drafts=true`. Real query strings (`?drafts=true`) also work when served over HTTP. |
| After Stage 2 | `npm run dev` → `http://localhost:4321/design-url-redirection-service/prototype/v1/` (served by `src/pages/[slug]/prototype/[...variant].astro`, `noindex`, preview banner). |
| Share with friends | After Stage 2 is deployed: push, then share `https://sujeet.pro/design-url-redirection-service/prototype/`. URL is `noindex` and never linked from public HTML. |

The pill bar at the very top (**Article Reader / Homepage & ?drafts / Explore Graph**) is a prototype-only view switcher. It does not ship to production.

## 2. Routes and query flags

| Route | View |
| :--- | :--- |
| `#/` (or `#/home`) | Homepage: thumbnail cards, archetype filters, series package card, `?drafts` toggle |
| `#/article` (or empty hash) | Article reader, **Overview & Production Guide** tab |
| `#/article/lab` | Article reader, **Interactive Architecture Lab** tab |
| `#/explore` | Knowledge Graph Explorer (filters + SVG graph + preview pane) |

| Flag | Behaviour |
| :--- | :--- |
| `?drafts=true` | Opens the client-only **Unlisted Drafts & Prototypes** tray (`#draftsTray`) on the homepage. |
| `?ctx=series:system-design` | Activates the System Design breadcrumb + Prev/Next (the `primarySeries`). |
| `?ctx=series:edge-and-traffic-architecture` | Activates Edge & Traffic breadcrumb + Prev/Next and stores it in `sessionStorage["sp-v8-nav-series"]`. |
| `?ctx=series:bogus` | Falls back to `primarySeries` (`system-design`). An invalid `ctx` deliberately ignores any stored session value. |
| no `ctx` | Uses `sessionStorage["sp-v8-nav-series"]` if it is a valid membership, else `primarySeries`. |

Resolution happens in a pre-paint `<head>` script that sets `html[data-sp-nav-series]`. Both breadcrumb/Prev-Next variants are pre-rendered and toggled by CSS (`[data-sp-series-variant]`). This is the zero-CLS pattern Stage 3 must keep.

## 3. Keyboard cheat-sheet

Open the in-page sheet with `?`. Single-key shortcuts are ignored while typing in `input`/`textarea`/`select`/contenteditable, during IME composition, while a dialog is open (except palette navigation), and when the WCAG 2.1.4 switch is off.

| Key | Action |
| :--- | :--- |
| `⌘K` / `Ctrl+K` | Toggle unified command palette (works even when single-key shortcuts are disabled) |
| `/` | Open palette in Search mode |
| `>` | Open palette in Commands-only mode (pre-fills `> `) |
| `?` | Keyboard shortcuts overlay (contains the WCAG 2.1.4 toggle `#wcagShortcutToggle`) |
| `t` | Cycle theme Auto → Light → Dark |
| `p` | Play / pause companion audio |
| `[` / `]` | Seek −15 s / +15 s |
| `j` / `k` | Next / previous `h2[id]` in the active tab |
| `1` / `2` | Overview tab / Lab tab |
| `l` | Copy AI Prompt (clipboard, else modal with selectable text) |
| `g` then `h` | Go home (900 ms chord window) |
| `g` then `e` | Go to Explore |
| `↑` `↓` `↵` | Navigate / run palette rows |
| `Esc` | Close print preview → dialog → series menu / display popover, restoring focus |

The WCAG 2.1.4 switch persists as `singleKeyShortcuts` inside `localStorage["sp-v8-prefs"]` alongside `scheme`, `contrast` and `textSize`.

## 4. What is real and what is simulated

| Feature | In the preview | Real in production (stage) |
| :--- | :--- | :--- |
| Theme / contrast / text size | **Real**. Persisted to `sp-v8-prefs`, pre-paint, sets `data-sp-scheme` / `data-sp-contrast` / `data-sp-text` | Same contract (2) |
| Multi-series breadcrumb + Prev/Next | **Real** logic (`?ctx`, `sessionStorage`, primary fallback, CSS variants). Series data is hard-coded. | Data from `src/series/series.json` (3) |
| Palette structural groups (Series, Articles & Tabs, Sections) | **Real** substring filter over a hard-coded index | `graph-index.<hash>.json` (2–3) |
| Palette **Full-Text Matches** | **Simulated**. Fake body-text corpus, debounce 480 ms cold / 160 ms warm to mimic lazy Pagefind | Pagefind (`/* @vite-ignore */`) (2) |
| Palette commands | **Real** actions. Matched via a separate `match` string so the long "Cycle Theme" label does not steal `dark`/`light` queries. | Same (2) |
| Topology failure injection | **Real** state machine (select node → Healthy / 10× latency / Outage → blast-radius metrics, fallback path, reset) | `SystemTopology.tsx` (3) |
| Scale tier + Generic ↔ AWS toggle | **Real** UI. Topology and costs re-render. | `ScaleVariantSwitcher.tsx` (3) |
| Cost numbers | **Illustrative only**. Hard-coded per-1M multipliers, enterprise range 25–40 %, SaaS range, ownership FTE 0.05/0.25/0.5 × $18k/mo. None of these are verified against AWS pricing. | `data/cost-models.json` with `pricingAsOf` + `sources[]` (3, 6) |
| "~2–3× faster first drafts" (AI-era note) | **Unverified assumption**, labelled as such in the copy | Must be sourced or kept as an explicit assumption (6) |
| Audio player | **Simulated**. A `setInterval` clock over a 9:15 (555 s) fake duration; 5 chapters, transcript, speed, Auto-Follow, Jump to Section. No audio file. | `AudioPlayer.tsx` + real `episode.mp3` / `chapters.json` (3, 4) |
| PDF download | **Simulated**. Opens a modal (`#pdfModal`) describing the branded PDF. | `npm run pdf` → `/<slug>/<slug>.pdf` (4) |
| Print guard | **Real** `@media print` notice (`#printNotice`) + an on-screen preview via the palette command "Preview Browser Print Notice". | `PrintNotice.astro` (2) |
| Copy AI Prompt | **Real** clipboard write with modal fallback | `CopyAiPrompt.tsx` (4) |
| Drafts tray | **Real** toggle; list is hard-coded | `/drafts-index.json` fetched client-side (3) |
| Explore graph | **Real** filters (series, archetype), click-to-preview; positions hard-coded | Build-time layout in `ExploreGraph.tsx` (3) |

## 5. Owner review checklist

Tick these and write feedback into `src/articles/design-url-redirection-service/logs/session-001.md` (created in Stage 6) or a `prototypes/v2.html` iteration.

- [ ] Typography and measure: 68ch prose column, 1140px lab breakout, Inter/system + JetBrains Mono feel right.
- [ ] Light, Dark, Auto and High Contrast palettes; Large text mode does not break the lab layout.
- [ ] 56px top bar is the only chrome; no clutter competing with prose.
- [ ] Breadcrumb `[System Design ▾]` switcher: label wording, "Also in:" chip, Prev/Next per series.
- [ ] `?ctx=series:edge-and-traffic-architecture` behaviour and the bogus-ctx fallback.
- [ ] Quick Read box: length, tone, the tier bullets.
- [ ] Palette: group order, empty states, no row jumping while typing `bloom filter`, `>` mode.
- [ ] Shortcut set: any key you want removed or remapped (PDF intentionally has no single key).
- [ ] Lab: tier labels, node set per tier, inspector copy, metric names (edge P99, miss P99, origin 404 %, availability).
- [ ] Cost explorer: which rows/assumptions you want in the real `cost-models.json`; whether SaaS and people-cost lines belong.
- [ ] Audio bar: collapsed vs expanded state, chapter titles, Auto-Follow default OFF.
- [ ] Connections & Backlinks panel content and the "Coming Soon" Bloom Filter card.
- [ ] Explore graph: node layout, edge legend, whether the matrix/list view is enough without the SVG.
- [ ] Print notice copy and the PDF modal description.
- [ ] Mobile width (≤ 400px): top bar, breadcrumb menu, audio bar, lab.

**Known minor nit (accepted in v1, fixed in v2):** the series switcher menu (`#seriesSwitcherMenu`) is clamped to the viewport only when opened (`clampSeriesMenu()`), not re-clamped on `resize` while it stays open. v2 re-clamps on `resize`; the production `ArticleLayout` switcher must do the same.

## 6. Re-running the smoke tests

The Stage 1 smoke scripts lived in `/tmp/sp-pw` and are throwaway. To rebuild a scratch harness outside the repo:

```bash
mkdir -p /tmp/sp-pw && cd /tmp/sp-pw && npm init -y && npm i playwright && npx playwright install chromium
```

Then write a small script that loads `file:///Users/sujeet/workspace/sujeet.pro/src/articles/design-url-redirection-service/prototypes/v1.html` in headless Chromium at desktop (1280×800) and mobile (390×844) and checks the assertions below. Do not add this harness to the repo. Stage 5 turns these assertions into real specs under `tests/e2e/`.

### Assertions a future Playwright E2E should reproduce

| # | Assertion |
| :--- | :--- |
| 1 | Zero `console.error`, zero `pageerror` for every route (`#/`, `#/article`, `#/article/lab`, `#/explore`) in Light and Dark. |
| 2 | `<meta name="robots">` contains `noindex, nofollow`. |
| 3 | Pressing `t` cycles `html[data-sp-scheme-pref]` through `auto → light → dark` and updates `localStorage["sp-v8-prefs"].scheme` to match. `html[data-sp-scheme]` is the resolved `light` or `dark` value (it is never `auto`), so it changes only when the pref is `dark` or `light`, or when the OS scheme changes while the pref is `auto`. A reload keeps the scheme applied before first paint. |
| 4 | `Meta+K` (or `Control+K`) opens `#cmdModal` with focus in `#cmdInput`; `Escape` closes it and restores focus to the opener. |
| 5 | Typing `bloom` shows groups in order Series → Articles & Tabs → Sections → Full-Text Matches → Commands; the structural rows' text and order are identical before and after full-text results arrive. |
| 6 | `>` opens the palette showing only the Commands group; typing `dark` selects **Theme → Dark** as the first row. |
| 7 | `?` opens `#shortcutsModal`; turning off `#wcagShortcutToggle` makes `t`, `p`, `j` no-ops while `⌘K` still works; the setting persists in `sp-v8-prefs`. |
| 8 | Typing `t` inside `#cmdInput` or the cost sliders does not change the theme. |
| 9 | Tab focus stays inside an open dialog (focus trap). |
| 10 | `#/article?ctx=series:edge-and-traffic-architecture` sets `html[data-sp-nav-series="edge-and-traffic-architecture"]` and shows that Prev/Next variant; `ctx=series:bogus` yields `system-design`. |
| 11 | Selecting a series in `#seriesSwitcherMenu` updates the label, Prev/Next and `sessionStorage["sp-v8-nav-series"]`; CLS stays below 0.05. |
| 12 | On `#/article/lab`, clicking a topology node (`[data-node-id]`) and injecting an outage changes the inspector and metrics; reset restores Healthy. |
| 13 | Switching `[data-tier]` and `[data-cloud]` re-renders `#topologySvg` and `#costTableBody`; moving `#discountSlider` changes `#costEnterprisePoint`. |
| 14 | `p` starts the simulated clock (`#audioCurrentTime` advances); `]` adds 15 s; the transcript and chapter drawers open; **Jump to Section** scrolls to the chapter's section id on the correct tab. |
| 15 | `page.emulateMedia({ media: 'print' })` shows `#printNotice` (`.sp-print-notice`) and hides `.sp-app-shell` and `.sp-audio-bar`. |
| 16 | `#/?drafts=true` opens `#draftsTray`; the tray is closed without the flag. |
| 17 | On `#/explore`, series/archetype filters hide non-matching nodes in `#exploreGraphSvg`; clicking a node fills `#explorePreview`. |
| 18 | `l` copies the prompt (grant `clipboard-write`) or, when the clipboard is denied, opens `#aiPromptModal` with selectable `#aiPromptText`. |

---

## 7. `prototypes/v2.html` — evolution-first body, four stage layouts

| Item | Value |
| :--- | :--- |
| File | `src/articles/design-url-redirection-service/prototypes/v2.html` (~5.5k lines; v1 unchanged) |
| Status | Done (Stage 1b of `docs/implementation-plan.md`); **waiting for your layout pick** |
| Indexing | `noindex, nofollow`; banner "Prototype v2 · layout variants · noindex" |
| Production URL (after Stage 2) | `/design-url-redirection-service/prototype/` (latest = v2) and `/design-url-redirection-service/prototype/v2/` |

### 7.1 Open it (one link per layout)

```text
file:///Users/sujeet/workspace/sujeet.pro/src/articles/design-url-redirection-service/prototypes/v2.html#/article?layout=split
file:///Users/sujeet/workspace/sujeet.pro/src/articles/design-url-redirection-service/prototypes/v2.html#/article?layout=scrolly
file:///Users/sujeet/workspace/sujeet.pro/src/articles/design-url-redirection-service/prototypes/v2.html#/article?layout=stacked
file:///Users/sujeet/workspace/sujeet.pro/src/articles/design-url-redirection-service/prototypes/v2.html#/article?layout=stepper
```

The lab with the level picker is at `…/v2.html#/article/lab`. To jump to a stage, click its row in the Evolution Ladder. All v1 routes and flags (§2) still work.

### 7.2 What changed versus v1

| Area | v2 behaviour | Where to look |
| :--- | :--- | :--- |
| Width | Every row (top bar, breadcrumb, header, Quick Read, Ladder, stages, lab, Connections, footer, audio bar) shares `--sp-container: 1140px` + 20px gutter; text runs are left-aligned at `--sp-measure: 68ch`. No centred prose column, no breakout width. | Compare left/right edges at 1280px |
| Article body | Quick Read (4 bullets) → **Evolution Ladder** `#evolutionLadder` (one row per level: mode, trigger, decision, cost band) → six stage sections `#stage-l0` … `#stage-l5` → Connections | Overview tab |
| Stage block | Trigger card (kind + headline + scenario), requirement chips, 2–5 key points, Add / Change / Remove / Defer-until, build-vs-buy verdict, cost band, "Move up when…" | Any `.sp-stage` |
| Figure | `.sp-fig-frame` (16:9) with an `[ Image \| Interactive ]` toggle (`.sp-fig-toggle [data-fig-mode]`). Image = static snapshot of that level (stands in for the printable WebP). Interactive = diff vs the previous level (`[data-diff="added"]` / `[data-diff="removed"]`) + click a node → Healthy / 10× latency / Outage inspector. L3 has a 2-figure gallery (`‹ ›`, "Fig 3.1 · 1/2"). | L3 is the richest |
| Layout switch | `?layout=split\|scrolly\|stacked\|stepper`, the `v` key (cycles), `⌘K` → "Layout → …", or the floating `#layoutSwitcher` pill. Sets `html[data-sp-layout]` and persists to `sp-v8-prefs.layout`. | Bottom-right pill |
| Stepper | Rail `#stageRail` (L0…L5); `←`/`→` and `j`/`k` move between levels; hidden levels stay in the DOM (`.sp-stage-hidden`) for search, print and SEO | `?layout=stepper` |
| `⌘K` | The Sections group lists the stages, e.g. `bloom` → "L3 · Bloom-filter miss guard"; Enter scrolls to or activates it | `⌘K`, type `bloom` |
| Lab | Tier switcher replaced by a level picker `#labLevelPicker [data-lab-level]` (L0–L5) driving the same topology data; Generic↔AWS, failure injection and the cost explorer remain | `#/article/lab` |
| Audio mock | Six chapters, one per stage (`targetSectionId: stage-lN`); Jump to Section activates the stage | `p`, then Chapters |
| Series menu | Re-clamped on `resize` while open (v1 nit fixed) | 1280 → 390 with the menu open |

### 7.3 The four layouts at a glance

| Layout | Reads like | Strengths | Costs / risks seen in the preview |
| :--- | :--- | :--- | :--- |
| `split` (default) | Text left, figure right | Claim and visual side by side; compact; stacks below 900px | The figure column is ~470px, so diagram sub-labels get small (~8px) at L3–L5 |
| `scrolly` | Pinned figure that morphs as you scroll | Most immersive; one figure tracks the narrative | Most JS (IntersectionObserver, sticky frame); same small-figure issue as split; needs a static fallback for print/no-JS; swaps instantly under `prefers-reduced-motion` |
| `stacked` | Trigger → bullets → full-width figure → decision strip | Diagrams fully legible; simplest to build; best for print/PDF and LinkedIn crops | Most scrolling; whitespace right of the 68ch text on desktop |
| `stepper` | Interview whiteboard, one level at a time | Least scrolling; strongest "evolution" feel; keyboard-friendly | Hides other levels until you step; scroll-skimmers see one level at a time |

A hybrid is also possible, e.g. `stacked` in the article plus `stepper` on the Lab tab.

### 7.4 Owner review checklist (v2)

- [ ] **Pick the stage layout** (`split` / `scrolly` / `stacked` / `stepper`, or a hybrid). It goes into `spConfig.layout.stageVariant` and the master plan before Stage 3.
- [ ] Uniform width: header, breadcrumb, Ladder, stages and footer share edges; left-aligned 68ch text feels right.
- [ ] Evolution content: are the triggers, deferred items and "Move up when…" exits right for L0–L5? Is anything introduced too early?
- [ ] Build-vs-buy verdicts and cost bands per level (all **assumptions** until checked against AWS pricing; see claims V1–V12 in Stage 6.1 of `docs/implementation-plan.md`).
- [ ] Figure toggle: is "Image by default, Interactive on demand" the right default? Are the + added / − removed tags clear in Light and Dark?
- [ ] L3 gallery (Fig 3.1 topology, Fig 3.2 Bloom miss-flow): is one extra figure per stage the right density?
- [ ] Ladder placement: full width below Quick Read (chosen so all edges align) versus beside it.
- [ ] Floating layout pill: prototype-only; it can cover a line of text above the audio bar and does not ship.
- [ ] Lab level picker replacing the old scale tiers.
- [ ] Mobile (390px): stage blocks, chips, figure toggle, stepper rail.

### 7.5 Simulated or assumed in v2

- All requirement numbers, cost bands and edge KV limits ("assumption: verify KVS size limits") are illustrative and flagged in the page.
- The "Image" view is a themed inline SVG; production uses rendered `diagrams/stage-l<n>-{light,dark}.webp`.
- `?layout=` and the `v` key are preview-only. Production ships the one chosen layout.

### 7.6 Assertions a future `layout-and-evolution.spec.ts` should reproduce

The throwaway harness `/tmp/sp-pw/v2.mjs` (244 checks, all passing on 2026-11-23) covered these. Recreate it with the §6 recipe if `/tmp` was cleared.

| # | Assertion |
| :--- | :--- |
| E1 | For every layout × {1280×800, 390×844} × {Light, Dark}: zero console errors/warnings, zero page errors, zero non-`file:`/`data:` requests. |
| E2 | At 1280px the left/right edges of the top bar inner row, context bar, article header, `#evolutionLadder`, every visible `.sp-stage`, Connections and footer are equal within ±1px. |
| E3 | At 390px `scrollWidth <= clientWidth`, including with `#seriesSwitcherMenu` open and after resizing 1280→390 while it is open. |
| E4 | Toggling `[data-fig-mode]` leaves the `.sp-fig-frame` box unchanged and the `layout-shift` total < 0.01 during toggles and node clicks. |
| E5 | The L3 interactive diff contains ≥1 `[data-diff="added"]` and ≥1 `[data-diff="removed"]`; node → Outage changes state and inspector text. |
| E6 | `?layout=stepper`: `←`/`→` and `j`/`k` change the active level; six `#stage-l*` sections exist in the DOM; following `#stage-l4` activates L4. |
| E7 | `⌘K` `bloom` lists L3 first in Sections with group order unchanged; Enter activates L3. |
| E8 | `v` cycles `html[data-sp-layout]` and persists `sp-v8-prefs.layout`; it is ignored in inputs and when the WCAG toggle is off; `>layout stacked` + Enter sets stacked. |
| E9 | `?layout=scrolly` with `reducedMotion: 'reduce'`: scrolling to L4 updates `#scrollyFigureHost[data-level]` without errors. |
| E10 | `#labLevelPicker [data-lab-level]` re-renders the lab topology; costs, Generic↔AWS and failure injection still work. |
| E11 | Audio Jump to Section activates the matching `#stage-lN`. |
| E12 | Focus stays trapped in the `⌘K`, shortcuts and PDF dialogs. |
| E13 | The in-page evolution self-check (no node before the stage that adds it) emits no warnings. |
