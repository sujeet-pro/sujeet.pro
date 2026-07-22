/**
 * Repo-local wrapper around `diagramkit validate`.
 *
 * Collapsed onto the diagramkit CLI's native directory walk: a single
 *
 *   diagramkit validate . --recursive --scope-dir diagrams --fail-on <codes>
 *
 * `--scope-dir diagrams` restricts the audit to SVGs under `diagrams/`
 * folders, skipping hand-authored / legacy `assets/` SVGs that would
 * otherwise raise false-positive CONTAINS_FOREIGN_OBJECT / EXTERNAL_RESOURCE
 * warnings. This replaces the previous hand-rolled per-folder loop.
 *
 * `--json` passes through (`validate:diagrams:json`); the CLI's JSON payload
 * is emitted verbatim. The CLI's `--fail-on` policy sets the process exit
 * code (nonzero when a fatal code is present), so this wrapper just inherits
 * it.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

// ── Fatal-code policy ────────────────────────────────────────────────
//
// Ecosystem embed-safety set: these codes indicate an SVG that is unsafe or
// broken to inline as an <img> and must never ship. Always fatal.
const FATAL_CODES = ["CONTAINS_FOREIGN_OBJECT", "CONTAINS_SCRIPT", "EXTERNAL_RESOURCE"];

// LOW_CONTRAST_TEXT policy (Render phase). ENFORCED as fatal: a fresh
// `validate:diagrams` over the full 2602-SVG corpus returns 0 LOW_CONTRAST_TEXT
// findings, so the gate is on (FAIL_ON_LOW_CONTRAST = true).
//
// LOW_CONTRAST_TEXT history on the full 2602-SVG corpus:
//   - Baseline (pre-fix):                                   84 findings / 72 SVGs
//   - After diagramkit RENDER_PIPELINE_VERSION 3 re-render: 24 findings / 16 SVGs
//   - After per-source tail fixes + diagramkit v4:           8 findings /  6 SVGs
//   - After diagramkit scanner fix + crit-bar source fixes:  0 findings /  0 SVGs
//
// ROOT CAUSES FIXED UPSTREAM (in the linked diagramkit, released via the
// ecosystem upgrade — see diagramkit CHANGELOG [Unreleased]):
//   - v3: injected Mermaid sequence-autonumber + xychart-beta text colors
//     (light + dark), and the dark post-processor stopped *darkening*
//     `<text>`/`<tspan>` glyph fills. Cleared the ~48 systematic
//     sequence/xychart findings.
//   - v4: the dark post-processor now also *lightens* near-black glyph fills
//     (luminance < 0.15). Cleared the gantt/timeline dark-mode axis-tick
//     labels, which Mermaid hardcodes as `fill="#000"` (no theme variable
//     overrides them) — invisible on the `#111111` canvas.
//   - Scanner background resolution (`src/color/wcag.ts`, validation-only, no
//     pipeline bump): the contrast walker no longer mis-attributes gantt
//     off-bar labels (`taskTextOutside*`/`sectionTitle*`/`milestoneText`/
//     `titleText`) to the last dark task rect, resolves timeline section labels
//     against their section block (painted in a sibling subtree), and parses
//     multi-ancestor descendant CSS (`.edgeLabel .label text/rect`) so ER
//     edge/entity labels stop self-matching. Cleared the 8 former
//     false-positives below.
//
// FIXED PER-SOURCE (all preserve each diagram's design intent):
//   - Dropbox flowcharts (cdc-vs-fixed-chunking, chunk-dedup-flow,
//     conflict-resolution-decision): pastel classDef fills (#ffe5e5 / #e5f5e5 /
//     #fff5e5) that dark mode kept light -> AA mid-tone palette + white text
//     (#B43A3A / #2D7A2D / #8B5E15). Semantic red/green/amber preserved.
//   - Slack flowcharts (architecture-overview, cellular-az-drain,
//     feb-2022-cascade, flannel-edge-flow): per-node `style` directives ->
//     `classDef` (the diagramkit-mermaid SKILL best practice).
//   - Gantt (auth-capture-settle-timeline, defer-async-module-timeline,
//     freebusy-intersection): `%%{init: themeVariables}%%` for the flagged task
//     fills (taskBkgColor #1F6E68, doneTaskBkgColor #5A5A5A). All three also set
//     critBkgColor #B43A3A / critBorderColor #8E2828 so white in-bar task text
//     on crit bars is a genuine 5.82:1 (Mermaid's default red crit bar rendered
//     #fff-on-#ff0000 = 3.99:1, a real sub-AA failure the old scanner masked by
//     mis-resolving in-bar text against a neighbouring task rect).
//   - Timeline (vitess-migration-timeline): cScale* mid-tone section fills +
//     white cScaleLabel* so year/event labels are AA in both modes.
//
// GATE STATE: fatal (merge-blocking). Every genuine low-contrast defect is fixed
// at source or upstream, and the former scanner false-positives are fixed in the
// diagramkit scanner itself — so enforcement rests on an accurate scan, not on
// suppressing non-issues. If a future audit regresses a diagram, `validate:all`
// now fails until it is fixed. The fatal embed-safety codes above stay enforced
// unconditionally alongside this.
const FAIL_ON_LOW_CONTRAST = true;

const failOnCodes = [...FATAL_CODES];
if (FAIL_ON_LOW_CONTRAST) {
  failOnCodes.push("LOW_CONTRAST_TEXT");
}

const DK_BIN = resolve("node_modules/.bin/diagramkit");
const wantJson = process.argv.includes("--json");

const cliArgs = [
  "validate",
  ".",
  "--recursive",
  "--scope-dir",
  "diagrams",
  "--fail-on",
  failOnCodes.join(","),
];
if (wantJson) {
  cliArgs.push("--json");
}

const child = spawn(DK_BIN, cliArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  console.error(`Failed to launch diagramkit: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
