#!/usr/bin/env node
// Visuals pipeline (implementation plan, Stage 4.1).
//
//   node scripts/render-visuals.mjs [--slug <slug>] [--force] [--articles-dir <dir>] [--port <n>]
//
// Articles: every article with data/evolution.json, or exactly --slug.
// Artifacts per article (paths relative to the article folder):
//   diagrams/<visual>-{light,dark}.webp   every stage figure, 1600×(1600·vh/vw) px (topology.viewBox aspect)
//   social/thumbnail-{light,dark}.webp    800×450
//   social/thumbnail.png                  800×450, light
//   social/linkedin-card.png              1200×628, light, must be < 5 MB
//
// Rendering goes through the site itself: one `SP_VISUALS_RENDER=1 astro dev` child registers the local-only
// /visuals-export/[slug]/ route (src/lib/integrations/visuals-route.ts, P2), which draws each figure with
// SystemTopology (`static`, same drawing code as the interactive view) and the social cards from site tokens.
// Playwright Chromium screenshots each `[data-sp-shot]` element at DPR 2 with `data-sp-scheme` light/dark,
// then Sharp encodes WebP q82 / PNG.
//
// Skip: an artifact is fresh when its generated.lock.json entry (pipeline 'visuals') has the current
// inputHash and the file on disk still hashes to outputHash. An article with every artifact fresh starts
// no server and touches no file. Files whose re-rendered bytes are identical are not rewritten. The lock
// is merged (other pipelines' entries kept), key-sorted and validated with GeneratedLockSchema.
//
// Plain Node (P13): schema.ts loads via native type stripping. Never run in CI.

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import sharp from 'sharp';

import { GeneratedLockSchema } from '../src/lib/articles/schema.ts';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const ASTRO_BIN = path.join(REPO_ROOT, 'node_modules/astro/bin/astro.mjs');
/** Template + drawing code: a change to any of them re-renders every visual. */
export const TEMPLATE_SOURCES = [
  'scripts/render-visuals.mjs',
  'src/internal-routes/visuals-export.astro',
  'src/lib/integrations/visuals-route.ts',
  'src/components/interactive/SystemTopology.tsx',
  'src/components/interactive/interactive.css',
  'src/components/evolution/evolution.css',
  'src/components/evolution/labels.ts',
  'src/lib/articles/evolution.ts',
  'src/styles/global.css',
];
const DATA_FILES = ['data/evolution.json', 'data/topology.json', 'data/cost-models.json'];
const WEBP_QUALITY = 82;
const DPR = 2;
const LINKEDIN_MAX_BYTES = 5 * 1024 * 1024;
const PIPELINE = 'visuals';
const log = (msg) => process.stderr.write(`[render-visuals] ${msg}\n`);

// ---------------------------------------------------------------------------
// Pure helpers (exported so validate.mjs can recompute inputHash identically)
// ---------------------------------------------------------------------------

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const pkgVersion = (name) => readJson(path.join(REPO_ROOT, 'node_modules', name, 'package.json')).version;

/** toolVersion = "playwright@<v>+chromium@<v>+sharp@<v>+libvips@<v>+astro@<v>+react-dom@<v>" */
export function computeToolVersion() {
  const browsers = readJson(path.join(REPO_ROOT, 'node_modules/playwright-core/browsers.json')).browsers;
  const chromiumVersion = browsers.find((b) => b.name === 'chromium')?.browserVersion ?? 'unknown';
  return [
    `playwright@${pkgVersion('playwright-core')}`,
    `chromium@${chromiumVersion}`,
    `sharp@${sharp.versions.sharp ?? pkgVersion('sharp')}`,
    `libvips@${sharp.versions.vips}`,
    `astro@${pkgVersion('astro')}`,
    `react-dom@${pkgVersion('react-dom')}`,
  ].join('+');
}

/**
 * inputHash = sha256(JSON.stringify([data files (raw text, null if absent), manifest title fields,
 * template sources as [path, sha256], toolVersion])). One hash per article; every artifact of the article shares it.
 */
export function computeVisualsInputHash(articleDir, toolVersion, repoRoot = REPO_ROOT) {
  const data = DATA_FILES.map((rel) => {
    const p = path.join(articleDir, rel);
    return [rel, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null];
  });
  const m = readJson(path.join(articleDir, 'article.json'));
  const manifest = { slug: m.slug, title: m.title, subtitle: m.subtitle, archetype: m.archetype };
  const template = TEMPLATE_SOURCES.map((rel) => [rel, sha256(fs.readFileSync(path.join(repoRoot, rel)))]);
  return sha256(JSON.stringify([data, manifest, template, toolVersion]));
}

/** Every artifact the article must have: `{ rel, shot, scheme, format, width, height }`. */
export function plannedArtifacts(articleDir) {
  const evolution = readJson(path.join(articleDir, 'data/evolution.json'));
  const [, , vw, vh] = readJson(path.join(articleDir, 'data/topology.json')).viewBox;
  const figW = 800 * DPR;
  const figH = Math.round((800 * vh) / vw) * DPR;
  const out = [];
  const seen = new Set();
  for (const s of evolution.stages) {
    for (const f of s.figures) {
      if (seen.has(f.visual)) continue;
      seen.add(f.visual);
      for (const scheme of ['light', 'dark']) {
        out.push({ rel: `diagrams/${f.visual}-${scheme}.webp`, shot: `diagrams/${f.visual}`, scheme, format: 'webp', width: figW, height: figH });
      }
    }
  }
  out.push(
    { rel: 'social/thumbnail-light.webp', shot: 'social/thumbnail', scheme: 'light', format: 'webp', width: 800, height: 450 },
    { rel: 'social/thumbnail-dark.webp', shot: 'social/thumbnail', scheme: 'dark', format: 'webp', width: 800, height: 450 },
    { rel: 'social/thumbnail.png', shot: 'social/thumbnail', scheme: 'light', format: 'png', width: 800, height: 450 },
    { rel: 'social/linkedin-card.png', shot: 'social/linkedin-card', scheme: 'light', format: 'png', width: 1200, height: 628 },
  );
  return out;
}

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------

function readLock(lockPath) {
  if (!fs.existsSync(lockPath)) return { schemaVersion: 1, artifacts: {} };
  return GeneratedLockSchema.parse(readJson(lockPath));
}

/** Re-reads the lock right before writing so entries other pipelines wrote meanwhile are kept. */
function upsertLock(lockPath, entries) {
  const lock = readLock(lockPath);
  for (const [rel, entry] of Object.entries(entries)) {
    const prev = lock.artifacts[rel];
    const same = prev && prev.pipeline === entry.pipeline && prev.inputHash === entry.inputHash && prev.outputHash === entry.outputHash && prev.toolVersion === entry.toolVersion;
    lock.artifacts[rel] = { ...entry, generatedAt: same ? prev.generatedAt : entry.generatedAt };
  }
  const sorted = { schemaVersion: 1, artifacts: Object.fromEntries(Object.entries(lock.artifacts).sort(([a], [b]) => (a < b ? -1 : 1))) };
  GeneratedLockSchema.parse(sorted);
  const text = JSON.stringify(sorted, null, 2) + '\n';
  if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf8') === text) return false;
  fs.writeFileSync(lockPath, text);
  return true;
}

function staleArtifacts(articleDir, artifacts, inputHash) {
  const lock = readLock(path.join(articleDir, 'generated.lock.json'));
  return artifacts.filter((a) => {
    const e = lock.artifacts[a.rel];
    const p = path.join(articleDir, a.rel);
    return !(e && e.pipeline === PIPELINE && e.inputHash === inputHash && fs.existsSync(p) && sha256(fs.readFileSync(p)) === e.outputHash);
  });
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
  // `--ignore-lock`: stay in the foreground and never touch the lock of a dev server the developer already runs.
  const child = spawn(process.execPath, [ASTRO_BIN, 'dev', '--port', String(port), '--host', '127.0.0.1', '--ignore-lock'], {
    cwd: REPO_ROOT,
    env: { ...process.env, SP_VISUALS_RENDER: '1', ASTRO_TELEMETRY_DISABLED: '1' },
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
      const res = await fetch(`${base}/visuals-export/${probeSlug}/`);
      if (res.status === 200) return { child, base };
      if (res.status === 404) throw new Error('visuals-export route not registered (SP_VISUALS_RENDER=1 ignored?)');
      await new Promise((r) => setTimeout(r, 300));
      throw new Error(`visuals route returned HTTP ${res.status}; astro dev output:\n${output}`);
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

const counters = { renders: 0, written: 0, unchanged: 0, skipped: 0 };

async function encode(png, a) {
  const img = sharp(png);
  const { width, height } = await img.metadata();
  if (width !== a.width || height !== a.height) throw new Error(`${a.rel}: screenshot is ${width}×${height}, expected ${a.width}×${a.height}`);
  return a.format === 'webp'
    ? img.webp({ quality: WEBP_QUALITY, effort: 6 }).toBuffer()
    : img.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function renderArticle(browser, base, articleDir, artifacts, inputHash, toolVersion) {
  const slug = path.basename(articleDir);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: DPR });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  const entries = {};
  try {
    const res = await page.goto(`${base}/visuals-export/${slug}/`, { waitUntil: 'load' });
    if (!res || res.status() !== 200) throw new Error(`${slug}: visuals route HTTP ${res?.status()}`);
    await page.evaluate(async () => {
      document.querySelectorAll('astro-dev-toolbar, vite-error-overlay').forEach((el) => el.remove());
      await document.fonts.ready;
    });
    if (await page.$('vite-error-overlay')) throw new Error(`${slug}: Vite error overlay present`);
    // The dev toolbar is injected asynchronously; the route also hides it with CSS. Let it settle first.
    await page.waitForLoadState('networkidle');
    const now = new Date().toISOString();
    for (const scheme of ['light', 'dark']) {
      const todo = artifacts.filter((a) => a.scheme === scheme);
      if (!todo.length) continue;
      await page.evaluate((s) => {
        document.documentElement.dataset.spScheme = s;
        document.documentElement.dataset.spSchemePref = s;
      }, scheme);
      await page.evaluate(() => {
        document.querySelectorAll('astro-dev-toolbar').forEach((el) => el.remove());
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      for (const a of todo) {
        const loc = page.locator(`[data-sp-shot="${a.shot}"]`);
        if ((await loc.count()) !== 1) throw new Error(`${slug}: expected one [data-sp-shot="${a.shot}"] in the visuals route`);
        const png = await loc.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', scale: 'device' });
        counters.renders++;
        const bytes = await encode(png, a);
        if (a.rel === 'social/linkedin-card.png' && bytes.length >= LINKEDIN_MAX_BYTES) {
          throw new Error(`${slug}: ${a.rel} is ${bytes.length} bytes (limit 5 MB)`);
        }
        const out = path.join(articleDir, a.rel);
        const outputHash = sha256(bytes);
        if (fs.existsSync(out) && sha256(fs.readFileSync(out)) === outputHash) {
          counters.unchanged++;
          log(`${slug}: ${a.rel} bytes unchanged`);
        } else {
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, bytes);
          counters.written++;
          log(`${slug}: wrote ${a.rel} (${a.width}×${a.height}, ${(bytes.length / 1024).toFixed(1)} KiB)`);
        }
        entries[a.rel] = { pipeline: PIPELINE, inputHash, outputHash, toolVersion, generatedAt: now };
      }
    }
    if (errors.length) throw new Error(`${slug}: console/page errors in the visuals route:\n  ${errors.join('\n  ')}`);
  } finally {
    await page.close();
  }
  const changed = upsertLock(path.join(articleDir, 'generated.lock.json'), entries);
  log(`${slug}: lock ${changed ? 'updated' : 'unchanged'}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { slug: null, force: false, articlesDir: path.join(REPO_ROOT, 'src/articles'), port: 4331 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') o.force = true;
    else if (a === '--slug') o.slug = argv[++i];
    else if (a === '--articles-dir') o.articlesDir = path.resolve(argv[++i]);
    else if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '-h' || a === '--help') {
      process.stdout.write('Usage: node scripts/render-visuals.mjs [--slug <slug>] [--force] [--articles-dir <dir>] [--port <n>]\n');
      process.exit(0);
    } else throw new Error(`unknown argument: ${a}`);
    if (['--slug', '--articles-dir', '--port'].includes(a) && !argv[i]) throw new Error(`${a} needs a value`);
  }
  return o;
}

function selectArticles({ slug, articlesDir }) {
  if (slug) {
    const dir = path.join(articlesDir, slug);
    if (!fs.existsSync(path.join(dir, 'data/evolution.json'))) throw new Error(`${slug}: no data/evolution.json in ${dir}`);
    return [dir];
  }
  return fs
    .readdirSync(articlesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(articlesDir, d.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'article.json')) && fs.existsSync(path.join(dir, 'data/evolution.json')))
    .sort();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const toolVersion = computeToolVersion();
  log(`toolVersion ${toolVersion}`);
  const work = [];
  for (const dir of selectArticles(opts)) {
    const slug = path.basename(dir);
    const artifacts = plannedArtifacts(dir);
    const inputHash = computeVisualsInputHash(dir, toolVersion);
    const stale = opts.force ? artifacts : staleArtifacts(dir, artifacts, inputHash);
    if (stale.length === 0) {
      counters.skipped += artifacts.length;
      log(`${slug}: up to date (${artifacts.length} artifacts, inputHash ${inputHash.slice(0, 12)}); skipping`);
      continue;
    }
    counters.skipped += artifacts.length - stale.length;
    log(`${slug}: ${stale.length}/${artifacts.length} artifact(s) to render (inputHash ${inputHash.slice(0, 12)})`);
    work.push({ dir, stale, inputHash });
  }
  if (work.length) {
    const { child, base } = await startDevServer(opts.port, path.basename(work[0].dir));
    let browser;
    try {
      browser = await chromium.launch();
      for (const w of work) await renderArticle(browser, base, w.dir, w.stale, w.inputHash, toolVersion);
    } finally {
      await browser?.close();
      await stopDevServer(child);
    }
  }
  log(`done: renders=${counters.renders}, written=${counters.written}, bytes-unchanged=${counters.unchanged}, skipped=${counters.skipped}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((e) => {
    log(`ERROR: ${e.message}`);
    process.exit(1);
  });
}
