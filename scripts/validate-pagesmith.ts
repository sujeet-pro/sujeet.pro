/**
 * sujeet.pro project validation.
 *
 * Strategy: do not re-implement the generic "do my links resolve / are my
 * images themed correctly / does my output have the standard files" rules.
 * Import the published validators from `@pagesmith/site` (they re-export
 * `@pagesmith/core`'s content rules), point them at this project's
 * `content.config.ts`, then layer on project-specific cross-reference checks
 * that no other Pagesmith user needs:
 *
 *   - `meta.json5` series → article/blog slug references
 *   - `home.json5` featured-articles / featured-series references
 *   - `redirects.json5` internal targets resolve to real routes
 *
 * Run with `npm run validate:full`.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  formatContentValidationReport,
  loadContentSchemaMap,
  validateContent,
  withBasePath,
  type FileSchemaEntry,
} from "@pagesmith/site";
import { validateBuildOutput } from "@pagesmith/site/build-validator";
import { loadSiteConfig, resolveBasePath } from "../lib/site-config.ts";
import {
  loadHomeData,
  loadRedirectConfig,
  loadSectionEntries,
  loadSectionMeta,
} from "../theme/lib/content.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const siteConfig = loadSiteConfig();
const basePath = resolveBasePath();
const trailingSlash = siteConfig.trailingSlash ?? false;
const contentDir = resolve(projectRoot, siteConfig.contentDir ?? "content");
const outDir = resolve(projectRoot, siteConfig.outDir ?? "dist");
const publicDir = resolve(projectRoot, siteConfig.publicDir ?? "public");

const checkBuild = !process.argv.includes("--content");
const checkContent = !process.argv.includes("--build");

let totalErrors = 0;
let totalWarnings = 0;

// ── 1. Markdown content validation (delegated to @pagesmith/site) ────
if (checkContent) {
  console.log(`\n[content] ${contentDir}`);

  const additionalRoots: Array<{ prefix: string; dir: string }> = [];
  if (existsSync(publicDir)) additionalRoots.push({ prefix: "/", dir: publicDir });
  if (existsSync(outDir)) {
    additionalRoots.push({ prefix: "/", dir: outDir });
    if (basePath) additionalRoots.push({ prefix: basePath, dir: outDir });
  }

  const loaded = await loadContentSchemaMap([projectRoot]);
  const schemaByFile: Map<string, FileSchemaEntry> | undefined = loaded?.schemaByFile;
  if (loaded) {
    console.log(
      `  loaded content.config from ${loaded.configPath} ` +
        `(${schemaByFile?.size} markdown files mapped across ${
          Object.keys(loaded.collections).length
        } collections)`,
    );
  }

  const summary = await validateContent({
    contentDir,
    collectionName: "sujeet.pro",
    resolveFrontmatterSchema: schemaByFile
      ? (filePath) => schemaByFile.get(filePath)?.schema
      : undefined,
    linkValidator: {
      rootDir: contentDir,
      basePath,
      additionalRoots,
      // sujeet.pro deliberately wants the strict "links must resolve to
      // markdown" rule because the article/blog content tree is the only
      // first-class navigation surface here.
      internalLinksMustBeMarkdown: true,
      requireAltText: true,
      forbidHtmlImgTag: true,
      requireThemeVariantPairs: true,
    },
  });

  const report = formatContentValidationReport(summary);
  if (report.trim()) console.log(report);
  totalErrors += summary.errors;
  totalWarnings += summary.warnings;
}

// ── 2. Build-output validation (delegated to @pagesmith/site) ────────
if (checkBuild) {
  console.log(`\n[build] ${outDir}`);

  if (!existsSync(outDir)) {
    console.log(`  skipped — outDir does not exist (run \`npm run build\` first)`);
  } else {
    const buildResult = validateBuildOutput({
      outDir,
      basePath,
      trailingSlash,
      requireThemeVariants: true,
      requireRasterModernFormats: false,
      checkInPageAnchors: true,
      requireBothTrailingSlashForms: false,
      requiredFiles: [
        ["favicon.svg", "favicon.ico"],
        "sitemap.xml",
        "robots.txt",
        "llms.txt",
        "llms-full.txt",
        "404.html",
        ".nojekyll",
      ],
    });
    for (const w of buildResult.warnings) console.log(`  ⚠ ${w.file}: ${w.message}`);
    for (const e of buildResult.errors) console.log(`  ✗ ${e.file}: ${e.message}`);
    console.log(
      `  ${buildResult.htmlFileCount} HTML files, ${buildResult.imageFileCount} images, ` +
        `${buildResult.errors.length} errors, ${buildResult.warnings.length} warnings`,
    );
    totalErrors += buildResult.errors.length;
    totalWarnings += buildResult.warnings.length;
  }
}

// ── 3. Project-specific cross-reference checks ──────────────────────
if (checkContent) {
  console.log(`\n[cross-references]`);
  const articles = loadSectionEntries("articles", basePath);
  const blogs = loadSectionEntries("blogs", basePath);
  const articleMeta = loadSectionMeta("articles");
  const blogMeta = loadSectionMeta("blogs");
  const homeData = loadHomeData();
  const redirects = loadRedirectConfig();

  const articleSlugs = new Set(articles.map((entry) => entry.slug));
  const blogSlugs = new Set(blogs.map((entry) => entry.slug));
  const articleSeriesSlugs = new Set((articleMeta?.series ?? []).map((series) => series.slug));
  const knownRoutes = new Set<string>([
    withBasePath(basePath, "/"),
    withBasePath(basePath, "/articles"),
    withBasePath(basePath, "/blogs"),
    ...articles.map((entry) => entry.path),
    ...blogs.map((entry) => entry.path),
  ]);

  const projectErrors: string[] = [];

  for (const series of articleMeta?.series ?? []) {
    for (const slug of series.articles) {
      if (!articleSlugs.has(slug)) {
        projectErrors.push(
          `content/articles/meta.json5 references missing article slug "${slug}" in "${series.slug}".`,
        );
      }
    }
  }
  for (const series of blogMeta?.series ?? []) {
    for (const slug of series.articles) {
      if (!blogSlugs.has(slug)) {
        projectErrors.push(
          `content/blogs/meta.json5 references missing blog slug "${slug}" in "${series.slug}".`,
        );
      }
    }
  }
  for (const slug of homeData.featuredArticles) {
    if (!articleSlugs.has(slug)) {
      projectErrors.push(`content/home.json5 references unknown featured article "${slug}".`);
    }
  }
  for (const slug of homeData.featuredSeries) {
    if (!articleSeriesSlugs.has(slug)) {
      projectErrors.push(`content/home.json5 references unknown featured series "${slug}".`);
    }
  }
  for (const redirect of redirects.redirects) {
    if (!redirect.to.startsWith("/")) continue;
    const target = withBasePath(basePath, redirect.to);
    if (!knownRoutes.has(target)) {
      projectErrors.push(
        `content/redirects.json5 points to unknown internal target "${redirect.to}".`,
      );
    }
  }

  if (projectErrors.length === 0) {
    console.log(
      `  meta/home/redirects all reference live content (${articles.length} articles, ${blogs.length} blogs).`,
    );
  } else {
    for (const message of projectErrors) console.log(`  ✗ ${message}`);
  }
  totalErrors += projectErrors.length;
}

console.log(
  `\nSummary: ${totalErrors} error(s), ${totalWarnings} warning(s) — ${
    totalErrors === 0 ? "PASSED" : "FAILED"
  }`,
);
process.exit(totalErrors === 0 ? 0 : 1);

// Suppress unused-warning for `dirname` import on platforms where it is not
// transitively used; keeps the script self-contained without a separate
// lint suppression comment in package consumers.
void dirname;
