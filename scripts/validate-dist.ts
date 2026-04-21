import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, extname, relative } from "node:path";
import { loadSiteConfig, resolveBasePath } from "../lib/site-config.ts";

const siteConfig = loadSiteConfig();
const DIST = process.env.DIST_DIR || siteConfig.outDir;
const basePath = resolveBasePath();
const trailingSlash = siteConfig.trailingSlash ?? false;

type Issue = { file: string; message: string };
const errors: Issue[] = [];
const warnings: Issue[] = [];

function walkFiles(dir: string, ext?: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, ext));
    } else if (!ext || extname(entry.name) === ext) {
      results.push(full);
    }
  }
  return results;
}

function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isRedirect(content: string): boolean {
  return /http-equiv=["']?refresh["']?/i.test(content);
}

/**
 * Check whether a resolved path corresponds to an existing file.
 * Handles both trailing-slash (path/index.html) and flat (path.html) modes.
 * Mirrors @pagesmith/site build-validator's resolvedPathExists.
 */
function resolvedPathExists(resolved: string): boolean {
  if (fileExists(resolved)) return true;
  if (fileExists(join(resolved, "index.html"))) return true;
  if (!trailingSlash && !extname(resolved) && fileExists(`${resolved}.html`)) return true;
  return false;
}

// ── 1. Required files ────────────────────────────────────────────────

const REQUIRED_FILES = [
  "index.html",
  "404.html",
  "sitemap.xml",
  "rss.xml",
  "robots.txt",
  ".nojekyll",
];

function checkRequiredFiles(): void {
  for (const file of REQUIRED_FILES) {
    if (!fileExists(join(DIST, file))) {
      errors.push({ file, message: "Required file missing" });
    }
  }

  if (siteConfig.search.enabled && !existsSync(join(DIST, "pagefind"))) {
    errors.push({ file: "pagefind/", message: "Search output missing" });
  }
}

function checkBundledAssets(): void {
  const entryHtmlPath = join(DIST, "index.html");
  if (!fileExists(entryHtmlPath)) {
    return;
  }

  const html = readFileSync(entryHtmlPath, "utf-8");
  const assetRefs = Array.from(html.matchAll(/\b(?:href|src)=["']([^"']+\.(?:css|js))["']/gi)).map(
    (match) => match[1]!,
  );
  const cssRefs = assetRefs.filter((ref) => /\.css(?:[?#].*)?$/i.test(ref));
  const jsRefs = assetRefs.filter((ref) => /\.js(?:[?#].*)?$/i.test(ref));

  if (cssRefs.length === 0) {
    errors.push({ file: "index.html", message: "No bundled CSS asset discovered" });
  }

  if (jsRefs.length === 0) {
    errors.push({ file: "index.html", message: "No bundled JS asset discovered" });
  }

  for (const ref of [...cssRefs, ...jsRefs]) {
    const resolved = resolveLocalHref(ref, entryHtmlPath);
    if (!resolved) continue;

    if (!resolvedPathExists(resolved)) {
      errors.push({ file: "index.html", message: `Bundled asset missing: ${ref}` });
    }
  }
}

// ── 2. HTML integrity ────────────────────────────────────────────────

function checkHtmlIntegrity(files: Map<string, string>): void {
  for (const [path, content] of files) {
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

// ── 3. Internal link resolution ──────────────────────────────────────

function resolveLocalHref(href: string, htmlFile: string): string | null {
  if (/^(https?:|\/\/|#|data:|mailto:|tel:|javascript:)/i.test(href)) return null;
  if (href.trim() === "") return null;

  const clean = href.split(/[?#]/)[0];

  if (clean.startsWith("/")) {
    let local = clean;
    if (basePath && local.startsWith(basePath + "/")) {
      local = local.slice(basePath.length);
    } else if (basePath && local === basePath) {
      local = "/";
    }
    return join(DIST, local);
  }

  return join(dirname(htmlFile), clean);
}

function stripCodeContent(html: string): string {
  return html.replace(/<(pre|code)[\s>][\s\S]*?<\/\1>/gi, "");
}

function checkLinks(files: Map<string, string>): void {
  const assetsDir = join(DIST, "assets");
  for (const [path, content] of files) {
    if (isRedirect(content)) continue;
    const rel = relative(DIST, path);
    const stripped = stripCodeContent(content);
    const pattern = /\b(?:href|src)=["']([^"'\s]+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(stripped)) !== null) {
      const href = m[1];
      if (href === "..." || href === "…") continue;
      const resolved = resolveLocalHref(href, path);
      if (!resolved) continue;

      if (!resolvedPathExists(resolved)) {
        const basename = resolved.split("/").pop()!;
        if (fileExists(join(assetsDir, basename))) {
          warnings.push({ file: rel, message: `Asset path mismatch: ${href} (exists in assets/)` });
        } else {
          errors.push({ file: rel, message: `Broken link: ${href}` });
        }
      }
    }
  }
}

// ── 4. BasePath correctness ──────────────────────────────────────────

function checkBasePath(files: Map<string, string>): void {
  if (!basePath) return;
  for (const [path, content] of files) {
    if (isRedirect(content)) continue;
    const rel = relative(DIST, path);
    const stripped = stripCodeContent(content);
    const pattern = /\b(?:href|src)=["'](\/[^"']*?)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(stripped)) !== null) {
      const href = m[1];
      if (!href.startsWith(basePath + "/") && href !== basePath) {
        warnings.push({ file: rel, message: `Absolute path missing basePath prefix: ${href}` });
      }
    }
  }
}

// ── 5. Sitemap consistency ───────────────────────────────────────────

function checkSitemap(files: Map<string, string>): void {
  const sitemapPath = join(DIST, "sitemap.xml");
  if (!fileExists(sitemapPath)) return;

  const sitemap = readFileSync(sitemapPath, "utf-8");
  const locPattern = /<loc>([^<]+)<\/loc>/g;
  const sitemapPaths = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = locPattern.exec(sitemap)) !== null) {
    try {
      const parsed = new URL(m[1]);
      let p = parsed.pathname.replace(/\/+$/, "") || "/";
      if (basePath && p.startsWith(basePath)) {
        p = p.slice(basePath.length) || "/";
      }
      sitemapPaths.add(p);
    } catch {
      warnings.push({ file: "sitemap.xml", message: `Invalid URL: ${m[1]}` });
    }
  }

  for (const p of sitemapPaths) {
    const indexPath = p === "/" ? join(DIST, "index.html") : join(DIST, p, "index.html");
    const flatPath = p === "/" ? null : join(DIST, `${p}.html`);
    if (!fileExists(indexPath) && !(flatPath && fileExists(flatPath))) {
      errors.push({ file: "sitemap.xml", message: `No file for sitemap entry: ${p}` });
    }
  }

  for (const [path, content] of files) {
    if (isRedirect(content)) continue;
    if (path === join(DIST, "404.html")) continue;

    const rel = relative(DIST, path);
    const slug =
      rel === "index.html" ? "/" : "/" + rel.replace(/\/index\.html$/, "").replace(/\.html$/, "");
    if (!sitemapPaths.has(slug)) {
      warnings.push({ file: rel, message: `HTML file not in sitemap: ${slug}` });
    }
  }
}

// ── Run ──────────────────────────────────────────────────────────────

console.log(`Validating dist: ${DIST}`);
if (basePath) console.log(`BasePath: ${basePath}`);
console.log(`TrailingSlash: ${trailingSlash}`);

if (!existsSync(DIST)) {
  console.error(`\nDist directory not found: ${DIST}`);
  console.error("Run 'npm run build' first.");
  process.exit(1);
}

checkRequiredFiles();
checkBundledAssets();

const htmlPaths = walkFiles(DIST, ".html");
const htmlFiles = new Map<string, string>();
for (const p of htmlPaths) {
  htmlFiles.set(p, readFileSync(p, "utf-8"));
}
console.log(`Found ${htmlFiles.size} HTML files`);

checkHtmlIntegrity(htmlFiles);
checkLinks(htmlFiles);
checkBasePath(htmlFiles);
checkSitemap(htmlFiles);

const assetMismatches = warnings.filter((w) => w.message.startsWith("Asset path mismatch"));
const otherWarnings = warnings.filter((w) => !w.message.startsWith("Asset path mismatch"));

if (assetMismatches.length > 0) {
  const byFile = new Map<string, number>();
  for (const w of assetMismatches) byFile.set(w.file, (byFile.get(w.file) ?? 0) + 1);
  console.log(`\n${assetMismatches.length} asset path mismatch(es) across ${byFile.size} file(s):`);
  console.log("  These files exist in assets/ but are referenced via relative ./diagrams/ paths.");
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
