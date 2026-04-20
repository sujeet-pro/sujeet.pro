---
name: prj-validate
description: Run the full validation suite for sujeet.pro — config, content collections, diagrams, build output, dist integrity, and project-specific cross-references. Use when the user asks to validate, audit, or verify the repo before merging or releasing.
---

# prj-validate — full validation suite

This skill orchestrates every validation script the repo exposes. Each one is thin glue around either:

- `@pagesmith/site` published validators (`validateContent`, `validateBuildOutput`, `loadContentSchemaMap`, `formatContentValidationReport`), **or**
- the `diagramkit validate` CLI (SVG structure + `<img>` embed safety + WCAG 2.2 AA).

The repo deliberately composes these published validators rather than reinventing them; project-specific cross-reference checks (`meta.json5` series → article slugs, `home.json5` featured slugs, `redirects.json5` targets) sit on top.

## Read first

1. `ai-guidelines/README.md` — task map and validation commands.
2. `ai-guidelines/packages.md` — current Pagesmith / diagramkit integration map.
3. `node_modules/@pagesmith/site/REFERENCE.md` — `pagesmith-site validate` flag set, build-validator behavior, content-validator options.
4. `node_modules/@pagesmith/core/REFERENCE.md` — built-in validators (`linkValidator`, `headingValidator`, `codeBlockValidator`).
5. `node_modules/@pagesmith/core/skills/pagesmith-core-setup/references/errors.md` — error catalogue.
6. `node_modules/@pagesmith/core/skills/pagesmith-core-write-validator/SKILL.md` — when to add a project-specific validator.
7. `node_modules/diagramkit/REFERENCE.md` and `node_modules/diagramkit/skills/diagramkit-review/SKILL.md` — diagram audit playbook.

## Command map

| Script                           | Wraps                                                                         | Use for                                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run validate`               | `tsx scripts/validate.ts`                                                     | Fast path: load every collection, render markdown, walk `meta.json5` / `home.json5` / `redirects.json5` cross-refs. **Run after any content edit.**                                       |
| `npm run validate:content`       | `tsx scripts/validate-pagesmith.ts --content`                                 | `@pagesmith/site` content validators (alt text, link integrity, theme variant pairs, frontmatter schema) plus project cross-refs. No build output required.                               |
| `npm run validate:build`         | `tsx scripts/validate-pagesmith.ts --build`                                   | `@pagesmith/site` build-output validator (`validateBuildOutput`) — needs `npm run build` first.                                                                                           |
| `npm run validate:full`          | `tsx scripts/validate-pagesmith.ts`                                           | All of the above in one pass. **Run before any release.**                                                                                                                                 |
| `npm run validate:diagrams`      | `diagramkit validate ./content --recursive`                                   | SVG structure + `<img>` embed safety + low-contrast text per WCAG 2.2 AA, recursing through every `content/<...>/diagrams/` folder.                                                       |
| `npm run validate:diagrams:json` | `diagramkit validate ./content --recursive --json`                            | JSON form for CI / programmatic post-processing.                                                                                                                                          |
| `npm run validate:dist`          | `tsx scripts/validate-dist.ts`                                                | Repo-local dist walker — required files, bundled-asset references, HTML integrity, internal link resolution, base-path correctness, sitemap consistency. **Needs `npm run build` first.** |
| `npm run validate:orphans`       | `tsx scripts/check-orphans.ts`                                                | Find unreferenced assets and diagrams.                                                                                                                                                    |
| `npm run validate:all`           | `validate` + `validate:diagrams` + `validate:full`                            | All non-build validators in one go. Convenient for content-only PRs.                                                                                                                      |
| `npm run check:ci`               | `vp check` + `validate:all` + `test` + `build` + `validate:dist` + `test:e2e` | Full CI gate.                                                                                                                                                                             |

## Recommended order

For a content-only change set:

```bash
npm run diagrams                       # ensure rendered SVGs match sources
npm run validate                       # fast cross-ref check
npm run validate:diagrams              # diagram health (force a re-audit if any source changed)
npm run validate:content               # content validators
```

For a release / pre-merge gate:

```bash
vp check                               # format + lint + type-check
npm run validate:all                   # validate + validate:diagrams + validate:full
npm run build                          # vite build + postbuild
npm run validate:dist                  # dist integrity
npm run validate:full                  # re-runs build validator with the freshly built dist/
npm run test:e2e                       # only when SSG output is in scope
```

## Severity policy

- `validateContent` errors block CI; warnings are visible but don't fail by default. The repo runs strict mode for the cases that matter — `requireAltText: true`, `forbidHtmlImgTag: true`, `requireThemeVariantPairs: true`, `internalLinksMustBeMarkdown: true`. Any of those failing is a blocker.
- `diagramkit validate` errors (e.g. `NO_VISUAL_ELEMENTS`, `MISSING_SVG_CLOSE`, `EMPTY_FILE`, `CONTAINS_SCRIPT`) block.
- `LOW_CONTRAST_TEXT` warnings are **always** fixed in this repo — accessibility regressions are not optional. Hand them off to `node_modules/diagramkit/skills/diagramkit-review/SKILL.md`.
- `CONTAINS_FOREIGN_OBJECT` warnings (Mermaid HTML labels) are blockers because every diagram is embedded via `<img>` (auto-merged from consecutive markdown images).
- Build-validator and dist-validator warnings should be triaged but rarely block a merge alone.

## Common findings and fixes

| Finding                                                   | Fix                                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `meta.json5 references missing slug "<x>"`                | Either add the article/blog or remove the slug from `content/<section>/meta.json5`.    |
| `home.json5 references unknown featured article "<x>"`    | Sync `content/home.json5` with the live article slugs.                                 |
| `redirects.json5 points to unknown internal target "<x>"` | Either add the target route or fix the redirect in `content/redirects.json5`.          |
| `MISSING_ALT_TEXT`                                        | Add alt text to every markdown image.                                                  |
| `THEME_VARIANT_PAIR` mismatch                             | Ensure both `-light` and `-dark` variants exist and sit consecutively in the markdown. |
| `INTERNAL_LINK_NOT_MARKDOWN`                              | Use `./relative/path.md` to a real entry instead of bare paths.                        |
| `HTML_IMG_TAG`                                            | Switch to markdown image syntax.                                                       |
| `linkValidator` bare-URL                                  | Wrap as `[text](url)`.                                                                 |
| `headingValidator` skip                                   | Add the missing heading or restructure.                                                |
| `codeBlockValidator` no-lang                              | Always specify a language on code fences.                                              |
| `LOW_CONTRAST_TEXT` on a diagram                          | Hand off to `diagramkit-review`; do not edit the SVG.                                  |
| `NO_VISUAL_ELEMENTS` / `MISSING_SVG_CLOSE`                | Source-level engine error — fix the source per its engine SKILL.md and re-render.      |
| Bundled asset missing in `dist/`                          | Re-run `npm run build`; check `index.html` references.                                 |
| HTML file not in sitemap                                  | `scripts/postbuild.ts` regenerates the sitemap during build — re-build.                |

## When to add a new validator

If a recurring failure mode is not covered, add a project-specific validator:

1. Follow `node_modules/@pagesmith/core/skills/pagesmith-core-write-validator/SKILL.md`.
2. Implement under `validators/` (create the folder if needed) returning `ValidationIssue[]`.
3. Attach to the relevant collection in `content.config.ts` via `validators: [...]`.
4. Verify with a seeded failing fixture, then run `npm run validate:full`.

If the new check is a project cross-reference (e.g. another companion `*.json5`), extend `scripts/validate-pagesmith.ts` instead — the script's docstring explicitly invites that.

## Operating rules

- Always run `npm run validate:full` (or at least `npm run validate:all`) before declaring a content change "done".
- Always run `npm run validate:diagrams` after any diagram source change. It is cheap and catches cosmetic regressions early.
- Never silence a validator by deleting / disabling it. Fix the content or the validator's input. The only acceptable silencing is `disableBuiltinValidators: true` on a collection where you intentionally replace a built-in with a stricter custom rule.
- Treat the validators as the source of truth for "is this content shippable" — do not eyeball it.
