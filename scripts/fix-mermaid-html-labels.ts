/**
 * One-shot fix: add `%%{init: {'htmlLabels': false}}%%` to every .mermaid /
 * .mmd / .mmdc source under content/ that does not already declare it.
 *
 * The directive MUST appear before the first diagram keyword
 * (`flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram`, `stateDiagram-v2`,
 *  `erDiagram`, `gantt`, `gitGraph`, `mindmap`, `timeline`, `C4Context`, `pie`,
 *  `quadrantChart`, `sankey-beta`, `xychart-beta`, `block-beta`,
 *  `architecture-beta`, `kanban`, `journey`, `packet-beta`, `radar-beta`,
 *  `requirementDiagram`).
 *
 * It MAY follow:
 *   - `%% …` line comments (e.g. `%% Diagram: …`, `%% Type: …`)
 *   - an existing `%%{init: …}%%` block (in which case we leave the file alone
 *     and rely on the upstream skill's "flat form" guidance, since rewriting
 *     someone's existing init payload is risky).
 *
 * The rule is mostly relevant to flowchart / sequence / class / state / ER,
 * but injecting the flat directive on other types is harmless because Mermaid
 * just ignores it on diagrams that don't have HTML labels.
 *
 * Run with: tsx scripts/fix-mermaid-html-labels.ts
 *           tsx scripts/fix-mermaid-html-labels.ts --dry-run
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = "content";
const EXTS = new Set([".mermaid", ".mmd", ".mmdc"]);
const DIRECTIVE = "%%{init: {'htmlLabels': false}}%%";

const dryRun = process.argv.includes("--dry-run");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (EXTS.has(extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

const sources = walk(ROOT);
let updated = 0;
let alreadyOk = 0;
let hasOtherInit = 0;
let untouched = 0;

for (const file of sources) {
  const original = readFileSync(file, "utf8");
  const lines = original.split(/\r?\n/);

  if (/htmlLabels\s*:\s*false/.test(original)) {
    alreadyOk++;
    continue;
  }

  if (/%%\s*\{\s*init\s*:/.test(original)) {
    hasOtherInit++;
    continue;
  }

  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || trimmed.startsWith("%%")) {
      insertAt = i + 1;
      continue;
    }
    break;
  }

  if (insertAt === lines.length) {
    untouched++;
    continue;
  }

  const next = [...lines.slice(0, insertAt), DIRECTIVE, ...lines.slice(insertAt)].join("\n");

  if (next === original) {
    untouched++;
    continue;
  }

  if (!dryRun) {
    writeFileSync(file, next);
  }
  updated++;
}

console.log(
  `mermaid sources: ${sources.length} | updated: ${updated} | already ok: ${alreadyOk} | has other init (manual review): ${hasOtherInit} | untouched: ${untouched}${
    dryRun ? " (dry-run)" : ""
  }`,
);

void statSync;
