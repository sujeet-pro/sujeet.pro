#!/usr/bin/env node
// Branded PDF renderer (implementation plan, Stage 4.4).
//
//   node scripts/render-pdf.mjs [--slug <slug>] [--force] [--port <n>]
//
// Articles: every article with features.pdf === true, or exactly --slug (whatever its features.pdf).
// Per article: inputHash over the article inputs + print code + tool versions; skip when the lock entry
// for exports/<slug>.pdf matches and the file still has the recorded outputHash (unless --force).
// Otherwise: one `SP_PDF_RENDER=1 astro dev --port 4329` child (registers the local-only
// /print-export/[slug] route, P2) -> Playwright Chromium page.pdf(A4, header/footer) -> pdf-lib
// deterministic metadata (Title/Author/Subject/Producer/Creator, CreationDate = ModDate = updatedAt,
// no XMP stream, no trailer /ID) -> exports/<slug>.pdf -> generated.lock.json (merged; other pipelines'
// entries are kept).
//
// Plain Node (P13): sp.config.ts and schema.ts load via native type stripping. Never run in CI.

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { PDFDocument, PDFName } from 'pdf-lib';

import { spConfig } from '../sp.config.ts';
import { GeneratedLockSchema } from '../src/lib/articles/schema.ts';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'src/articles');
const ASTRO_BIN = path.join(REPO_ROOT, 'node_modules/astro/bin/astro.mjs');
/** Print-path source files: a change to any of them re-renders every PDF. */
const PRINT_SOURCES = [
  'src/layouts/PrintLayout.astro',
  'src/components/print/PrintIslands.astro',
  'src/internal-routes/print-export.astro',
  'src/lib/print.ts',
  'scripts/render-pdf.mjs',
];
const PDF = spConfig.pdf;
const log = (msg) => process.stderr.write(`[render-pdf] ${msg}\n`);

// ---------------------------------------------------------------------------
// Pure helpers (exported so validate.mjs can recompute inputHash identically)
// ---------------------------------------------------------------------------

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const pkgVersion = (name) => readJson(path.join(REPO_ROOT, 'node_modules', name, 'package.json')).version;

/** toolVersion = "playwright@<v>+chromium@<browserVersion>+pdf-lib@<v>+astro@<v>" */
export function computeToolVersion() {
  const browsers = readJson(path.join(REPO_ROOT, 'node_modules/playwright-core/browsers.json')).browsers;
  const chromiumVersion = browsers.find((b) => b.name === 'chromium')?.browserVersion ?? 'unknown';
  return `playwright@${pkgVersion('playwright-core')}+chromium@${chromiumVersion}+pdf-lib@${pkgVersion('pdf-lib')}+astro@${pkgVersion('astro')}`;
}

const listFiles = (dir, re) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => re.test(f) && fs.statSync(path.join(dir, f)).isFile())
        .sort()
    : [];

/**
 * inputHash = sha256(JSON.stringify([[rel, sha256(bytes)]…, spConfig.pdf, toolVersion])) over
 * article.json, pages/*.mdx, data/*.json, diagrams/*.webp (figures embedded in the PDF), and PRINT_SOURCES.
 */
export function computePdfInputHash(articleDir, toolVersion) {
  const entries = [['article.json', sha256(fs.readFileSync(path.join(articleDir, 'article.json')))]];
  for (const [sub, re] of [
    ['pages', /\.mdx$/],
    ['data', /\.json$/],
    ['diagrams', /\.webp$/],
  ]) {
    for (const f of listFiles(path.join(articleDir, sub), re)) entries.push([`${sub}/${f}`, sha256(fs.readFileSync(path.join(articleDir, sub, f)))]);
  }
  for (const rel of PRINT_SOURCES) entries.push([`@repo/${rel}`, sha256(fs.readFileSync(path.join(REPO_ROOT, rel)))]);
  return sha256(JSON.stringify([entries, PDF, toolVersion]));
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Chromium header/footer templates: own font size (default is 0), no external resources. */
export function templates(manifest) {
  const base = `font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;font-size:8px;color:#6B7280;width:100%;padding:0 14mm;display:flex;justify-content:space-between;gap:12px;`;
  const host = new URL(spConfig.siteUrl).host;
  return {
    headerTemplate: `<div style="${base}"><span>${escHtml(PDF.headerBrand)} · ${escHtml(manifest.title)}</span></div>`,
    footerTemplate:
      `<div style="${base}"><span>${escHtml(PDF.footerAuthor)} · ${escHtml(host)}/${escHtml(manifest.slug)}/</span>` +
      `<span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`,
  };
}

/** Deterministic metadata + strip the per-render bits Chromium writes (XMP stream, trailer /ID). */
export async function finalizePdf(bytes, manifest, toolVersion) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const date = new Date(`${manifest.updatedAt}T00:00:00Z`);
  doc.setTitle(manifest.title, { showInWindowTitleBar: true });
  doc.setAuthor(spConfig.author.name);
  doc.setSubject(manifest.subtitle ?? manifest.summary);
  doc.setKeywords([...(manifest.tags ?? [])]);
  doc.setProducer(`${spConfig.author.handle} render-pdf (pdf-lib)`);
  doc.setCreator(`${spConfig.author.handle} PrintLayout (${toolVersion})`);
  doc.setCreationDate(date);
  doc.setModificationDate(date);
  doc.catalog.delete(PDFName.of('Metadata'));
  delete doc.context.trailerInfo.ID;
  return Buffer.from(await doc.save({ useObjectStreams: false, addDefaultPage: false }));
}

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------

function readLock(lockPath) {
  if (!fs.existsSync(lockPath)) return { schemaVersion: 1, artifacts: {} };
  return GeneratedLockSchema.parse(readJson(lockPath));
}

/** Re-reads the lock right before writing so entries other pipelines wrote meanwhile are kept. */
function upsertLock(lockPath, rel, entry) {
  const lock = readLock(lockPath);
  const prev = lock.artifacts[rel];
  const same = prev && prev.inputHash === entry.inputHash && prev.outputHash === entry.outputHash && prev.toolVersion === entry.toolVersion;
  lock.artifacts[rel] = { ...entry, generatedAt: same ? prev.generatedAt : entry.generatedAt };
  const sorted = { schemaVersion: 1, artifacts: Object.fromEntries(Object.entries(lock.artifacts).sort(([a], [b]) => (a < b ? -1 : 1))) };
  GeneratedLockSchema.parse(sorted);
  const text = JSON.stringify(sorted, null, 2) + '\n';
  if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf8') === text) return false;
  fs.writeFileSync(lockPath, text);
  return true;
}

const outRel = (slug) => `exports/${slug}.pdf`;

function isFresh(articleDir, slug, inputHash) {
  const e = readLock(path.join(articleDir, 'generated.lock.json')).artifacts[outRel(slug)];
  const p = path.join(articleDir, outRel(slug));
  return !!e && e.pipeline === 'pdf' && e.inputHash === inputHash && fs.existsSync(p) && sha256(fs.readFileSync(p)) === e.outputHash;
}

// ---------------------------------------------------------------------------
// Dev server (foreground child, killed at the end)
// ---------------------------------------------------------------------------

function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', () => reject(new Error(`port ${port} is busy; stop the other server or pass --port`)));
    srv.listen(port, '127.0.0.1', () => srv.close(resolve));
  });
}

async function startDevServer(port, probeSlug) {
  await assertPortFree(port);
  // `--ignore-lock`: stay in the foreground (Astro 7 auto-backgrounds `astro dev` when it detects a coding
  // agent) and never touch, or wait on, the lock file of a dev server the developer already runs.
  const child = spawn(process.execPath, [ASTRO_BIN, 'dev', '--port', String(port), '--host', '127.0.0.1', '--ignore-lock'], {
    cwd: REPO_ROOT,
    env: { ...process.env, SP_PDF_RENDER: '1', ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const keep = (d) => {
    output = (output + d.toString()).slice(-8000);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  let exited = null;
  child.once('exit', (code, signal) => (exited = { code, signal }));

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`astro dev exited early (${JSON.stringify(exited)}):\n${output}`);
    try {
      const res = await fetch(`${base}/print-export/${probeSlug}/`);
      if (res.status === 200) return { child, base };
      if (res.status === 404) throw new Error('print-export route not registered (SP_PDF_RENDER=1 ignored?)');
      await new Promise((r) => setTimeout(r, 300)); // let the server flush its error log
      throw new Error(`print route returned HTTP ${res.status}; astro dev output:\n${output}`);
    } catch (e) {
      if (!(e instanceof TypeError)) {
        child.kill('SIGTERM');
        throw e;
      }
      await new Promise((r) => setTimeout(r, 500)); // not listening yet
    }
  }
  child.kill('SIGTERM');
  throw new Error(`astro dev not ready after 120 s:\n${output}`);
}

async function stopDevServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise((r) => child.once('exit', r));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await done;
  clearTimeout(timer);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

async function renderPdf(browser, base, manifest) {
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
  try {
    const res = await page.goto(`${base}/print-export/${manifest.slug}/`, { waitUntil: 'load' });
    if (!res || res.status() !== 200) throw new Error(`${manifest.slug}: print route HTTP ${res?.status()}`);
    await page.evaluate(async () => {
      document.querySelectorAll('astro-dev-toolbar, vite-error-overlay').forEach((el) => el.remove());
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images, (img) =>
          img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))),
        ),
      );
    });
    const broken = await page.evaluate(() => Array.from(document.images).filter((i) => !i.naturalWidth).map((i) => i.src));
    if (broken.length) throw new Error(`${manifest.slug}: images failed to load: ${broken.join(', ')}`);
    const overlay = await page.$('vite-error-overlay');
    if (overlay) throw new Error(`${manifest.slug}: Vite error overlay present`);
    return await page.pdf({
      format: PDF.format,
      printBackground: true,
      displayHeaderFooter: true,
      ...templates(manifest),
      margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
      outline: true,
      tagged: true,
    });
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { slug: null, force: false, port: 4329 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') o.force = true;
    else if (a === '--slug') o.slug = argv[++i];
    else if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '-h' || a === '--help') {
      process.stdout.write('Usage: node scripts/render-pdf.mjs [--slug <slug>] [--force] [--port <n>]\n');
      process.exit(0);
    } else throw new Error(`unknown argument: ${a}`);
    if ((a === '--slug' || a === '--port') && !argv[i]) throw new Error(`${a} needs a value`);
  }
  if (!Number.isInteger(o.port) || o.port <= 0) throw new Error('--port must be a positive integer');
  return o;
}

function selectArticles(slug) {
  if (slug) {
    const dir = path.join(ARTICLES_DIR, slug);
    if (!fs.existsSync(path.join(dir, 'article.json'))) throw new Error(`${slug}: no article.json in ${dir}`);
    return [dir];
  }
  return fs
    .readdirSync(ARTICLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(ARTICLES_DIR, d.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'article.json')) && readJson(path.join(dir, 'article.json')).features?.pdf === true)
    .sort();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const toolVersion = computeToolVersion();
  log(`toolVersion ${toolVersion}`);
  const jobs = selectArticles(opts.slug)
    .map((dir) => ({ dir, manifest: readJson(path.join(dir, 'article.json')), inputHash: computePdfInputHash(dir, toolVersion) }))
    .filter(({ dir, manifest, inputHash }) => {
      if (!opts.force && isFresh(dir, manifest.slug, inputHash)) {
        log(`${manifest.slug}: up to date (inputHash ${inputHash.slice(0, 12)}), skipped`);
        return false;
      }
      return true;
    });
  if (jobs.length === 0) {
    log('nothing to render');
    return;
  }

  const { child, base } = await startDevServer(opts.port, jobs[0].manifest.slug);
  let browser;
  try {
    browser = await chromium.launch();
    for (const { dir, manifest, inputHash } of jobs) {
      const raw = await renderPdf(browser, base, manifest);
      const bytes = await finalizePdf(raw, manifest, toolVersion);
      const rel = outRel(manifest.slug);
      const outPath = path.join(dir, rel);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const unchanged = fs.existsSync(outPath) && fs.readFileSync(outPath).equals(bytes);
      if (!unchanged) fs.writeFileSync(outPath, bytes);
      const lockChanged = upsertLock(path.join(dir, 'generated.lock.json'), rel, {
        pipeline: 'pdf',
        inputHash,
        outputHash: sha256(bytes),
        toolVersion,
        generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      });
      log(`${manifest.slug}: ${unchanged ? 'bytes unchanged' : 'wrote'} ${rel} (${(bytes.length / 1024).toFixed(0)} KiB); lock ${lockChanged ? 'updated' : 'unchanged'}`);
    }
  } finally {
    await browser?.close();
    await stopDevServer(child);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((e) => {
    log(`ERROR: ${e.message}`);
    process.exit(1);
  });
}
