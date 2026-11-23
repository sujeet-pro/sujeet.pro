# Workflow: `article-qa` — real-browser QA pass

Use before moving an article from `building` to `review`, and again before `published`. QA runs against a **production build** in real Chromium, not `astro dev`. Read first: [../interactive-ux.md](../interactive-ux.md), [../architecture.md](../architecture.md).

## Setup

```bash
npm run validate:junie && npx astro check && npm run build
npx astro preview --port 4322     # or `npm run preview`; stop it when done
```

Use Playwright (or a browser automation tool) against `http://localhost:4322/`. Run desktop (1280×800) and mobile (390×844), Light and Dark. Once Stage 5 lands, `npm run validate`, `npm run validate:dist` and `npm run test:e2e` are part of this pass.

## Checklist

| Area | Check |
| :--- | :--- |
| Errors | Zero `console.error`, `pageerror`, failed requests, broken images on every page of the article, homepage, `/explore/`, series hub |
| Keyboard | Keyboard-only walkthrough: `⌘K` / `/` / `>` / `?`, `t`, `j`/`k`, `g h` / `g e`, tabs, lab controls, dialogs. Focus visible; Esc restores focus to the opener |
| WCAG 2.1.4 | Turn off single-key shortcuts in the `?` sheet: `t`, `p`, `j` become no-ops, `⌘K` still works, setting persists in `sp-v8-prefs` |
| Typing safety | Typing letters in the palette input or a slider never fires shortcuts |
| Theme | No flash on reload in Dark; Light ⇄ Dark across a tab switch keeps `data-sp-*` (P11); diagrams switch with the toggle, not the OS |
| Container edges | At 1280px, top bar inner row, breadcrumb bar, article header, Summary, Evolution Ladder, every `#stage-l<n>`, Connections panel, footer (and audio bar inner row) share `left`/`right` within **±1px** |
| Overflow | At 390px, `document.documentElement.scrollWidth <= clientWidth` on the article pages, homepage and `/explore/`, Light and Dark |
| Stage layout | Below 1200px stages are stacked; at ≥ 1200px split; print/PDF always stacked |
| Image ⇄ Interactive | For **every** stage figure: Image → Interactive → Image sums to **CLS 0**; the topology chunk is requested only after the first toggle; diff markers (add/change/remove) match `evolution.json`; failure injection changes the inspector/metrics and reset restores healthy |
| Expand | Each figure's Expand opens the full-viewport dialog; Esc restores focus |
| Palette | Group order Series → Articles & Tabs → Sections → Full-Text Matches → Commands; stage rows (`L<n> · …`) land on `#stage-l<n>`; structural rows do not jump when full-text results arrive |
| Audio (if `features.audio`) | One `<audio>` element; playback continues across tabs and Back; `currentTime` monotonic; Jump to Section lands on the right tab and id; `p`, `[`, `]` work |
| Print | `emulateMedia({ media: 'print' })` shows the Print Notice (when a PDF exists) and hides interactive DOM |
| PDF (if `features.pdf`) | `/<slug>/<slug>.pdf` returns 200 `application/pdf`; contains every stage in level order; no Print Notice text |
| CWV | CLS < 0.05 (hard); LCP < 2,500 ms cold mobile (local, strict); first palette open < 200 ms |
| SEO / AEO | One canonical per page, no query string; JSON-LD present on published pages; `noindex, nofollow` on drafts and prototypes |
| Leaks | No draft or prototype URL in published HTML `href`/`src`, sitemap `<loc>`, RSS, Pagefind, `graph-index`, `/llms.txt`; no `print-export` path or attribute in `dist/` (match URL forms, never free text) |
| Copy | No banned filler; UI labels never name the audience (Quick Read label is `Summary`); WIP banner still present |

## Report

A table of every check with pass/fail and the evidence (command output, measured value, screenshot path). Failures go back to `building` with a file path and a one-line fix suggestion.
