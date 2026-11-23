# Workflow: `article-prototype` — standalone HTML previews

Use to build `src/articles/<slug>/prototypes/vN.html`: a clickable, self-contained preview to iterate on UX and interactive mechanics before production code. Read first: [../interactive-ux.md](../interactive-ux.md), [../voice-and-quality.md](../voice-and-quality.md).

## Rules

| Rule | Detail |
| :--- | :--- |
| Self-contained | One HTML file, all CSS and JS inline. No network requests, no CDN, no build. Must run from `file://` |
| Indexing | `<meta name="robots" content="noindex, nofollow">` in the file. Never add `data-pagefind-body` |
| Versioning | Numeric: `v1.html`, `v2.html`, … The route serves the latest by **numeric** sort at `/<slug>/prototype/` and each at `/<slug>/prototype/vN/` |
| Frozen versions | Once a version is reviewed it is frozen. Iterate by copying to `v(N+1).html`. Flagship `v1.html` and `v2.html` are frozen now |
| Tokens | `sp-` prefix for classes, storage keys and attributes; `--sp-*` tokens copied from the current `src/styles/global.css` |
| Container | Uniform container rules apply to prototypes too (`--sp-container: 1140px`, text runs at `--sp-measure`) |
| Routing | Hash routes (`#/`, `#/article`, `#/explore`); query flags inside the hash work on `file://` |
| Copy | UI copy follows [../voice-and-quality.md](../voice-and-quality.md): e.g. the Quick Read label is `Summary` |
| Facts | Prototype numbers are illustrative. Mark them so in the prototype if a reader could mistake them for sourced figures |

## Multi-variant prototypes

When the layout is undecided, build **one file with several variants over identical content**, as flagship `v2.html` does:

- `?layout=<variant>` query switcher (also inside the hash on `file://`), a key to cycle variants, and a `⌘K` command "Layout → …".
- A small pinned switcher UI. The production route injects a bottom-left "Prototype vN · unlisted" banner (`sp-proto-unlisted`); keep your switcher clear of it.
- Record the owner's pick in `logs/session-NNN.md` and, for stage layouts, in `sp.config.ts` `layout` (owner sign-off required).
- Prototype-only controls (layout key, view switcher) are not ported to production shortcuts.

## Smoke test before handing over

Follow `docs/preview-guide.md` §6 (re-running the smoke tests): a throwaway Playwright harness **outside the repo** (never committed) loading the `file://` URL at 1280×800 and 390×844, checking the assertions listed there. Minimum:

1. Opens from `file://` with zero console errors in Chromium, Light and Dark.
2. Keyboard: `⌘K`, `/`, `>`, `?` work; focus returns to the opener on Esc.
3. 390px width: no horizontal overflow (`scrollWidth <= clientWidth`).
4. 1280px: container edges align within ±1px.
5. Each layout variant (if any) renders the same content.

Report the results with the exact checks you ran.
