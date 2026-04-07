import { createSiteContentLayer } from "#lib/collections";

const layer = createSiteContentLayer();
const results = await layer.validate();

let totalErrors = 0;
let totalWarnings = 0;

for (const result of results) {
  totalErrors += result.errors;
  totalWarnings += result.warnings;

  if (result.errors > 0 || result.warnings > 0) {
    console.log(`\n${result.collection}: ${result.errors} errors, ${result.warnings} warnings`);
    for (const entry of result.entries) {
      if (entry.issues.length === 0) continue;
      console.log(`  ${entry.filePath || entry.slug}:`);
      for (const issue of entry.issues) {
        const icon = issue.severity === "error" ? "✗" : "⚠";
        console.log(`    ${icon} ${issue.message}`);
      }
    }
  }
}

console.log(`\nValidation: ${totalErrors} errors, ${totalWarnings} warnings`);
process.exit(totalErrors > 0 ? 1 : 0);
