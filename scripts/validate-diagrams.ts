/**
 * Repo-local wrapper around `diagramkit validate` that scopes the audit to
 * actual `**\/diagrams/` folders under `content/`. The bare CLI (`diagramkit
 * validate ./content --recursive`) also walks `assets/` SVGs (hand-authored,
 * legacy drawio exports), which produces false-positive `CONTAINS_FOREIGN_OBJECT`
 * and `EXTERNAL_RESOURCE` warnings unrelated to the diagramkit render pipeline.
 *
 * This script:
 *   - finds every `content/<...>/diagrams/` folder
 *   - calls the locally installed `diagramkit validate <dir> --recursive --json`
 *     once per folder, collecting results
 *   - emits a single summary (and JSON when `--json` is passed)
 *   - exits non-zero on any structural error (the same severity policy
 *     `diagramkit validate` enforces)
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve("content");
const DK_BIN = resolve("node_modules/.bin/diagramkit");
const wantJson = process.argv.includes("--json");

function findDiagramDirs(start: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(start, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = join(start, e.name);
    if (e.name === "diagrams") {
      out.push(full);
    } else {
      findDiagramDirs(full, out);
    }
  }
  return out;
}

const dirs = findDiagramDirs(ROOT);
if (!dirs.length) {
  console.log("No diagrams folders under content/.");
  process.exit(0);
}

let totalFiles = 0;
let totalValid = 0;
let totalInvalid = 0;
const issueCounts: Record<string, number> = {};
const allResults: unknown[] = [];

for (const dir of dirs) {
  const r = spawnSync(DK_BIN, ["validate", dir, "--recursive", "--json"], {
    encoding: "utf8",
  });
  if (r.status !== 0 && r.status !== 1) {
    // diagramkit exits 1 when invalid files are found — that is normal here;
    // any other non-zero code is an unexpected failure.
    console.error(`diagramkit failed for ${dir}: code ${r.status}`);
    if (r.stderr) console.error(r.stderr);
    process.exit(2);
  }
  let payload;
  try {
    payload = JSON.parse(r.stdout);
  } catch {
    console.error(`Could not parse JSON for ${dir}`);
    process.exit(2);
  }
  totalFiles += payload.files ?? 0;
  totalValid += payload.valid ?? 0;
  totalInvalid += payload.invalid ?? 0;
  for (const result of payload.results ?? []) {
    allResults.push(result);
    for (const issue of result.issues ?? []) {
      issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
    }
  }
}

if (wantJson) {
  console.log(
    JSON.stringify(
      {
        files: totalFiles,
        valid: totalValid,
        invalid: totalInvalid,
        issueCounts,
        results: allResults,
      },
      null,
      2,
    ),
  );
  process.exit(totalInvalid > 0 ? 1 : 0);
}

console.log(`Validated ${totalFiles} SVG file(s) across ${dirs.length} diagrams folder(s).`);
console.log(`  valid: ${totalValid}`);
console.log(`  invalid: ${totalInvalid}`);
const codes = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]);
if (codes.length) {
  console.log("Issue counts:");
  for (const [code, n] of codes) console.log(`  ${code}: ${n}`);
} else {
  console.log("No issues.");
}
process.exit(totalInvalid > 0 ? 1 : 0);

void statSync;
