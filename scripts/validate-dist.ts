/**
 * Repo-local `dist/` integrity check.
 *
 * The bulk of this script now delegates to `@pagesmith/site`'s
 * `validateBuildOutput`, which supersedes the previously hand-rolled
 * link-resolution, bundled-asset, sitemap-consistency, and required-file
 * logic. Only the checks the upstream validator does NOT cover remain here:
 *
 *   KEPT (repo-specific, not in build-validator):
 *     - HTML document integrity: empty-file, <!DOCTYPE html> presence /
 *       uniqueness / first-node, and <html>/<head>/<body> element presence.
 *       build-validator validates links and assets but not document shape.
 *     - Pagefind search-output directory presence (a directory, not a file,
 *       so it can't ride `requiredFiles`).
 *
 *   DELEGATED to validateBuildOutput:
 *     - required files (index.html, 404.html, sitemap.xml, rss.xml,
 *       robots.txt, .nojekyll)          → `requiredFiles`
 *     - bundled CSS/JS discovery + resolution → `checkBundledAssets`
 *     - sitemap ↔ HTML cross-check      → `checkSitemap`
 *     - internal link / srcset resolution, "exists in assets/" mismatch
 *       warnings, asset content-hash enforcement, SVG well-formedness (all
 *       on by default in the upstream validator).
 *
 *   DROPPED:
 *     - the old `checkBasePath` absolute-path-prefix warning. It was a no-op
 *       at this repo's `basePath: ""`, and the upstream link resolver already
 *       resolves base-path-prefixed hrefs correctly.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { validateBuildOutput } from "@pagesmith/site/build-validator";
import { loadSiteConfig, resolveBasePath } from "../lib/site-config.ts";

const siteConfig = loadSiteConfig();
const DIST = resolve(process.env.DIST_DIR || siteConfig.outDir);
const basePath = resolveBasePath();
const trailingSlash = siteConfig.trailingSlash ?? false;

type Issue = { file: string; message: string };
const errors: Issue[] = [];
const warnings: Issue[] = [];

// ── Repo-specific checks ──────────────────────────────────────────────

function walkHtml(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "pagefind") continue;
      results.push(...walkHtml(full));
    } else if (extname(entry.name) === ".html") {
      results.push(full);
    }
  }
  return results;
}

function isRedirect(content: string): boolean {
  return /http-equiv=["']?refresh["']?/i.test(content);
}

/** Document-shape checks the upstream build-validator does not perform. */
function checkHtmlIntegrity(): void {
  for (const path of walkHtml(DIST)) {
    const content = readFileSync(path, "utf-8");
    const rel = relative(DIST, path);
    if (content.trim().length === 0) {
      errors.push({ file: rel, message: "Empty HTML file" });
      continue;
    }
    const doctypeMatches = content.match(/<!doctype html>/gi) ?? [];
    if (doctypeMatches.length === 0) {
      errors.push({ file: rel, message: "Missing <!DOCTYPE html>" });
    } else if (doctypeMatches.length > 1) {
      errors.push({ file: rel, message: "Duplicate <!DOCTYPE html>" });
    }
    if (!content.trimStart().toLowerCase().startsWith("<!doctype html>")) {
      errors.push({ file: rel, message: "<!DOCTYPE html> must be the first node" });
    }
    if (isRedirect(content)) continue;
    if (!/<html[\s>]/i.test(content)) errors.push({ file: rel, message: "Missing <html> element" });
    if (!/<head[\s>]/i.test(content)) errors.push({ file: rel, message: "Missing <head> element" });
    if (!/<body[\s>]/i.test(content)) errors.push({ file: rel, message: "Missing <body> element" });
  }
}

/** Pagefind emits a directory, so it cannot ride build-validator's requiredFiles. */
function checkSearchOutput(): void {
  if (siteConfig.search.enabled && !existsSync(join(DIST, "pagefind"))) {
    errors.push({ file: "pagefind/", message: "Search output missing" });
  }
}

// ── Run ────────────────────────────────────────────────────────────────

console.log(`Validating dist: ${DIST}`);
if (basePath) console.log(`BasePath: ${basePath}`);
console.log(`TrailingSlash: ${trailingSlash}`);

if (!existsSync(DIST)) {
  console.error(`\nDist directory not found: ${DIST}`);
  console.error("Run 'npm run build' first.");
  process.exit(1);
}

const result = validateBuildOutput({
  outDir: DIST,
  basePath,
  trailingSlash,
  requiredFiles: ["index.html", "404.html", "sitemap.xml", "rss.xml", "robots.txt", ".nojekyll"],
  checkBundledAssets: true,
  checkSitemap: true,
});

for (const e of result.errors) errors.push({ file: e.file, message: e.message });
for (const w of result.warnings) warnings.push({ file: w.file, message: w.message });

console.log(`Found ${result.htmlFileCount} HTML files`);

checkHtmlIntegrity();
checkSearchOutput();

const assetMismatches = warnings.filter((w) => w.message.startsWith("Asset path mismatch"));
const otherWarnings = warnings.filter((w) => !w.message.startsWith("Asset path mismatch"));

if (assetMismatches.length > 0) {
  const byFile = new Map<string, number>();
  for (const w of assetMismatches) byFile.set(w.file, (byFile.get(w.file) ?? 0) + 1);
  console.log(`\n${assetMismatches.length} asset path mismatch(es) across ${byFile.size} file(s):`);
  for (const [file, count] of byFile) console.log(`  ⚠ ${file} (${count})`);
}

if (otherWarnings.length > 0) {
  console.log(`\n${otherWarnings.length} warning(s):`);
  for (const w of otherWarnings) console.log(`  ⚠ ${w.file}: ${w.message}`);
}

if (errors.length > 0) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors) console.log(`  ✗ ${e.file}: ${e.message}`);
}

console.log(`\nValidation: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length > 0 ? 1 : 0);
