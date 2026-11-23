#!/usr/bin/env node
// Post-build validator (implementation plan, Stage 5.2).
//
//   node scripts/validate-dist.mjs [--dist <dir>]      (npm run validate:dist; default dir: dist)
//
// Run after `astro build && npx pagefind --site <dir>`. Crawls <dir>/**/*.html with node-html-parser and
// checks: internal href/src/srcset resolve to files; #fragments exist on their target page; no duplicate
// ids; relations[].targetSection and chapters.json targetSectionId/targetVisualId exist on their pages;
// exactly one query-free canonical; noindex on draft/prototype pages; no draft/prototype URL in any
// attribute or JSON-LD of a published page; no draft URL in sitemap <loc>, RSS <link>/<guid>,
// graph-index URL fields, llms.txt URLs or Pagefind fragments; no print-export path/attribute anywhere;
// each PDF opens, contains its title + tab headings and lacks the Print Notice text.
//
// Leak checks match URL forms only (`/<slug>/`, parsed attributes, parsed feed fields), never free text:
// prose and the unlinked "Coming Soon" card may legitimately mention a draft title.
// Tiers (§3): published, draft (`/<draft-slug>/…`), prototype (`/<slug>/prototype/…`, unlisted, frozen
// HTML: canonical optional, must be noindex, may mention the draft slug in text, never linked from published).
//
// Output: findings grouped by file as `file:field  message [rule]`. Exit 1 on any error.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { parse } from 'node-html-parser';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'src/articles');

const argv = process.argv.slice(2);
const distArg = argv.includes('--dist') ? argv[argv.indexOf('--dist') + 1] : 'dist';
if (!distArg) {
  console.error('usage: validate-dist.mjs [--dist <dir>]');
  process.exit(2);
}
const DIST = path.resolve(process.cwd(), distArg);
if (!fs.existsSync(DIST)) {
  console.error(`validate-dist: ${DIST} does not exist (build first)`);
  process.exit(2);
}

// sp.config.ts via type stripping (P13); only siteUrl is needed.
const { spConfig } = await import('../sp.config.ts');
const SITE = new URL(spConfig.siteUrl);

/** Print Notice phrases (src/components/ui/PrintNotice.astro) that must never appear in a PDF. */
const PRINT_NOTICE_PHRASES = ['do not render accurately when printed', 'Please download the formatted'];

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const findings = new Map();
const drel = (p) => path.relative(DIST, p).split(path.sep).join('/');
function add(level, group, field, message, rule) {
  if (!findings.has(group)) findings.set(group, []);
  findings.get(group).push({ level, field, message, rule });
}
const error = (g, f, m, r = '') => add('error', g, f, m, r);
const warn = (g, f, m, r = '') => add('warning', g, f, m, r);

// ---------------------------------------------------------------------------
// Articles (source of truth for tiers)
// ---------------------------------------------------------------------------

const articles = new Map();
for (const d of fs.existsSync(ARTICLES_DIR) ? fs.readdirSync(ARTICLES_DIR) : []) {
  const mf = path.join(ARTICLES_DIR, d, 'article.json');
  if (!fs.existsSync(mf)) continue;
  try {
    const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    articles.set(m.slug, { manifest: m, published: m.phase === 'published' });
  } catch {
    /* validate.mjs reports manifest errors */
  }
}
const draftSlugs = [...articles.values()].filter((a) => !a.published).map((a) => a.manifest.slug);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tier of a site path (decoded pathname). */
function tierOf(pathname) {
  if (/^\/[^/]+\/prototype(\/|$)/.test(pathname)) return 'prototype';
  const first = pathname.split('/')[1];
  if (draftSlugs.includes(first)) return 'draft';
  return 'published';
}
const isPrintExport = (s) => s.includes('print-export');

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const allFiles = walk(DIST);
const fileSet = new Set(allFiles.map(drel));
const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));

for (const f of allFiles) {
  if (isPrintExport(drel(f))) error(drel(f), '(path)', 'print-export file under dist/ (local-only route leaked)', 'print-export');
}

/** dist-relative HTML file -> site URL path */
const urlOf = (file) => {
  const r = drel(file);
  if (r === 'index.html') return '/';
  if (r.endsWith('/index.html')) return `/${r.slice(0, -'index.html'.length)}`;
  return `/${r}`;
};

/** Site pathname -> dist-relative file (or undefined). */
function fileFor(pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch {
    p = pathname;
  }
  const r = p.replace(/^\/+/, '');
  if (p.endsWith('/')) return fileSet.has(`${r}index.html`) ? `${r}index.html` : undefined;
  if (fileSet.has(r)) return r;
  if (fileSet.has(`${r}/index.html`)) return `${r}/index.html`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Parse HTML pages
// ---------------------------------------------------------------------------

const pages = new Map(); // dist-relative file -> { url, tier, root, ids:Set }
for (const file of htmlFiles) {
  const root = parse(fs.readFileSync(file, 'utf8'), { comment: false });
  const url = urlOf(file);
  const ids = new Map();
  for (const el of root.querySelectorAll('[id]')) {
    const id = el.getAttribute('id');
    ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  for (const el of root.querySelectorAll('a[name]')) if (!ids.has(el.getAttribute('name'))) ids.set(el.getAttribute('name'), 1);
  pages.set(drel(file), { url, tier: tierOf(url), root, ids });
}

/** Resolve an attribute value to a same-site URL (or null for external / non-navigational values). */
function resolve(value, baseUrl) {
  const v = (value ?? '').trim();
  if (!v || /^(mailto|tel|javascript|data|blob|about|sms):/i.test(v)) return null;
  let u;
  try {
    u = new URL(v, new URL(baseUrl, SITE));
  } catch {
    return null;
  }
  if (u.origin !== SITE.origin) return null;
  return u;
}
const srcsetUrls = (v) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().split(/\s+/)[0])
    .filter(Boolean);

// URL-bearing attributes per element (resolved + existence-checked).
const URL_ATTRS = [
  ['a', ['href']],
  ['area', ['href']],
  ['link', ['href']],
  ['script', ['src']],
  ['img', ['src', 'srcset']],
  ['source', ['src', 'srcset']],
  ['audio', ['src']],
  ['video', ['src', 'poster']],
  ['track', ['src']],
  ['iframe', ['src']],
  ['embed', ['src']],
  ['object', ['data']],
  ['form', ['action']],
];
const META_URL_NAMES = new Set(['og:image', 'og:url', 'twitter:image', 'og:image:secure_url', 'sp-graph-url', 'og:audio', 'og:video']);
const SKIP_LINK_RELS = /\b(preconnect|dns-prefetch)\b/;

/** Draft/prototype URL form inside an arbitrary attribute value or string (URL forms only). */
const draftUrlRe = draftSlugs.length
  ? new RegExp(`(?:^|["'\\s(=,\\[]|https?://[^/"'\\s]+)/(${draftSlugs.map(escRe).join('|')})(?=/|$|["'?#\\s)\\],])`)
  : null;
const protoUrlRe = /(?:^|["'\s(=,[]|https?:\/\/[^/"'\s]+)\/[a-z0-9-]+\/prototype(?=\/|$|["'?#\s)\],])/;

function leakIn(str) {
  if (draftUrlRe) {
    const m = draftUrlRe.exec(str);
    if (m) return `draft URL /${m[1]}/`;
  }
  if (protoUrlRe.test(str)) return 'prototype URL';
  return null;
}

for (const [file, page] of pages) {
  const { url, tier, root, ids } = page;
  const isProto = tier === 'prototype';
  // Frozen prototype HTML: structural findings are warnings (cannot be edited); leak + noindex stay errors.
  const structural = isProto ? warn : error;

  // Duplicate ids
  for (const [id, n] of ids) if (n > 1) structural(file, `#${id}`, `Duplicate id (${n}×)`, 'dup-id');

  // Canonical
  const canon = root.querySelectorAll('link').filter((l) => /\bcanonical\b/i.test(l.getAttribute('rel') ?? ''));
  if (canon.length !== 1) {
    if (isProto && canon.length === 0) warn(file, 'link[rel=canonical]', 'Prototype page has no canonical (frozen HTML; noindex applies)', 'canonical');
    else error(file, 'link[rel=canonical]', `Expected exactly one canonical, found ${canon.length}`, 'canonical');
  }
  for (const c of canon) {
    const href = c.getAttribute('href') ?? '';
    let cu;
    try {
      cu = new URL(href);
    } catch {
      error(file, 'link[rel=canonical]', `Not an absolute URL: "${href}"`, 'canonical');
      continue;
    }
    if (cu.search || href.includes('?')) error(file, 'link[rel=canonical]', `Canonical has a query string: ${href}`, 'canonical');
    if (cu.hash) error(file, 'link[rel=canonical]', `Canonical has a fragment: ${href}`, 'canonical');
    if (cu.origin !== SITE.origin) error(file, 'link[rel=canonical]', `Canonical origin ${cu.origin} ≠ ${SITE.origin}`, 'canonical');
    else if (file !== '404.html' && cu.pathname !== url) error(file, 'link[rel=canonical]', `Canonical ${cu.pathname} ≠ page URL ${url}`, 'canonical');
  }

  // noindex on draft/prototype pages; no data-pagefind-body there.
  if (tier !== 'published') {
    const robots = root.querySelectorAll('meta').filter((m) => (m.getAttribute('name') ?? '').toLowerCase() === 'robots');
    if (!robots.some((m) => /\bnoindex\b/i.test(m.getAttribute('content') ?? ''))) {
      error(file, 'meta[name=robots]', `${tier} page without noindex`, 'noindex');
    }
    if (root.querySelector('[data-pagefind-body]')) error(file, '[data-pagefind-body]', `${tier} page is marked for Pagefind indexing`, 'pagefind');
  }

  // Links: resolve, fragments, print-export, published -> draft/prototype leaks.
  const check = (el, attr, raw) => {
    const field = `${el.rawTagName}[${attr}="${raw.length > 80 ? raw.slice(0, 77) + '…' : raw}"]`;
    if (isPrintExport(raw)) error(file, field, 'print-export reference', 'print-export');
    if (raw.startsWith('#')) {
      const frag = safeDecode(raw.slice(1));
      if (frag && frag !== 'top' && !ids.has(frag)) structural(file, field, `Fragment #${frag} not found on this page`, 'anchor');
      return;
    }
    const u = resolve(raw, url);
    if (!u) return;
    const pathname = safeDecode(u.pathname);
    if (tier === 'published') {
      const t = tierOf(pathname);
      if (t !== 'published') error(file, field, `Published page references a ${t} URL (${pathname})`, 'leak');
    }
    const target = fileFor(u.pathname);
    if (!target) {
      // 404.html self-references /404/ (canonical, og:url); GitHub Pages serves it only as the error page.
      if (file === '404.html' && pathname === '/404/') {
        warn(file, field, 'Self-reference to /404/ does not resolve (404.html); harmless on a noindex error page', 'broken-ref');
        return;
      }
      structural(file, field, `Does not resolve to a file in dist (${pathname})`, 'broken-ref');
      return;
    }
    if (u.hash && u.hash !== '#') {
      const frag = safeDecode(u.hash.slice(1));
      const tp = pages.get(target);
      if (tp && frag !== 'top' && !tp.ids.has(frag)) structural(file, field, `Fragment #${frag} not found on ${target}`, 'anchor');
    }
  };

  for (const [tag, attrs] of URL_ATTRS) {
    for (const el of root.querySelectorAll(tag)) {
      if (tag === 'link' && SKIP_LINK_RELS.test(el.getAttribute('rel') ?? '')) continue;
      for (const attr of attrs) {
        const v = el.getAttribute(attr);
        if (v == null) continue;
        for (const raw of attr === 'srcset' ? srcsetUrls(v) : [v.trim()]) check(el, attr, raw);
      }
    }
  }
  for (const el of root.querySelectorAll('meta')) {
    const key = (el.getAttribute('property') ?? el.getAttribute('name') ?? '').toLowerCase();
    if (META_URL_NAMES.has(key) && el.getAttribute('content')) check(el, 'content', el.getAttribute('content').trim());
  }

  if (tier === 'published') {
    // Any other attribute value (island props, data-*) carrying a draft/prototype URL form.
    for (const el of root.querySelectorAll('*')) {
      for (const [attr, val] of Object.entries(el.attributes)) {
        if (!val || ['href', 'src', 'srcset', 'poster'].includes(attr)) continue;
        const leak = leakIn(val);
        if (leak) error(file, `${el.rawTagName}[${attr}]`, `Published page carries a ${leak} in an attribute`, 'leak');
      }
    }
    // JSON-LD of published pages.
    for (const s of root.querySelectorAll('script')) {
      if ((s.getAttribute('type') ?? '').toLowerCase() !== 'application/ld+json') continue;
      let data;
      try {
        data = JSON.parse(s.textContent);
      } catch (e) {
        error(file, 'script[type=application/ld+json]', `Invalid JSON-LD: ${e.message}`, 'jsonld');
        continue;
      }
      for (const str of strings(data)) {
        const u = /^(https?:)?\/\//.test(str) || str.startsWith('/') ? resolve(str, url) : null;
        if (!u) continue;
        const t = tierOf(safeDecode(u.pathname));
        if (t !== 'published') error(file, 'script[type=application/ld+json]', `JSON-LD references a ${t} URL (${u.pathname})`, 'leak');
      }
    }
  }
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
function* strings(v) {
  if (typeof v === 'string') yield v;
  else if (Array.isArray(v)) for (const x of v) yield* strings(x);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) yield* strings(x);
}

// ---------------------------------------------------------------------------
// Section targets: relations[].targetSection, chapters.json targetSectionId/targetVisualId
// ---------------------------------------------------------------------------

const pageFileOf = (slug, pageSlug) => (pageSlug ? `${slug}/${pageSlug}/index.html` : `${slug}/index.html`);
for (const [slug, a] of articles) {
  const src = `src/articles/${slug}/article.json`;
  (a.manifest.relations ?? []).forEach((r, i) => {
    if (!r.targetSection) return;
    const target = pageFileOf(r.targetSlug, r.targetPage);
    const tp = pages.get(target);
    if (!tp) error(src, `relations.${i}.targetPage`, `Target page ${target} not in dist`, 'section-ref');
    else if (!tp.ids.has(r.targetSection)) error(src, `relations.${i}.targetSection`, `#${r.targetSection} not found on ${target}`, 'section-ref');
  });
  const chaptersFile = path.join(DIST, slug, 'audio/chapters.json');
  if (fs.existsSync(chaptersFile)) {
    let ch;
    try {
      ch = JSON.parse(fs.readFileSync(chaptersFile, 'utf8'));
    } catch (e) {
      error(drel(chaptersFile), '(root)', `Invalid JSON: ${e.message}`, 'chapters');
      continue;
    }
    (ch.chapters ?? []).forEach((c, i) => {
      const target = pageFileOf(slug, c.targetPage);
      const tp = pages.get(target);
      for (const key of ['targetSectionId', 'targetVisualId']) {
        if (!c[key]) continue;
        if (!tp) error(drel(chaptersFile), `chapters.${i}.targetPage`, `Target page ${target} not in dist`, 'chapters');
        else if (!tp.ids.has(c[key])) error(drel(chaptersFile), `chapters.${i}.${key}`, `#${c[key]} not found on ${target}`, 'chapters');
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Feeds and indexes: parse each format, check URL fields only
// ---------------------------------------------------------------------------

function checkFeedUrl(group, field, raw) {
  let u;
  try {
    u = new URL(raw.trim(), SITE);
  } catch {
    return;
  }
  if (u.origin !== SITE.origin) return;
  const p = safeDecode(u.pathname);
  if (isPrintExport(p)) error(group, field, `print-export URL ${p}`, 'print-export');
  const t = tierOf(p);
  if (t !== 'published') error(group, field, `${t} URL ${p}`, 'leak');
  else if (!fileFor(u.pathname)) error(group, field, `URL ${p} does not resolve to a file in dist`, 'broken-ref');
}
const xmlText = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').trim();

for (const f of [...fileSet].filter((f) => /^sitemap-.*\.xml$/.test(f))) {
  const xml = fs.readFileSync(path.join(DIST, f), 'utf8');
  for (const m of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)) checkFeedUrl(f, `<loc>${xmlText(m[1])}`, xmlText(m[1]));
}
if (fileSet.has('rss.xml')) {
  const xml = fs.readFileSync(path.join(DIST, 'rss.xml'), 'utf8');
  for (const m of xml.matchAll(/<(link|guid)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) checkFeedUrl('rss.xml', `<${m[1]}>${xmlText(m[2])}`, xmlText(m[2]));
} else warn('rss.xml', '(file)', 'Missing', 'feeds');

for (const f of [...fileSet].filter((f) => /^graph-index\.[^/]+\.json$/.test(f))) {
  let g;
  try {
    g = JSON.parse(fs.readFileSync(path.join(DIST, f), 'utf8'));
  } catch (e) {
    error(f, '(root)', `Invalid JSON: ${e.message}`, 'graph');
    continue;
  }
  const walkJson = (v, p) => {
    if (Array.isArray(v)) v.forEach((x, i) => walkJson(x, `${p}.${i}`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === 'string' && /(^|[a-z])(url|href)$/i.test(k)) checkFeedUrl(f, `${p}.${k}`.replace(/^\./, ''), x);
        else walkJson(x, `${p}.${k}`);
      }
    }
  };
  walkJson(g, '');
  (g.articles ?? []).forEach((a, i) => {
    if (draftSlugs.includes(a.slug)) error(f, `articles.${i}.slug`, `Draft article "${a.slug}" in graph-index`, 'leak');
  });
  (g.edges ?? []).forEach((e, i) => {
    if (draftSlugs.includes(e?.to?.article)) error(f, `edges.${i}.to.article`, `Edge to draft "${e.to.article}"`, 'leak');
  });
}

if (fileSet.has('llms.txt')) {
  const txt = fs.readFileSync(path.join(DIST, 'llms.txt'), 'utf8');
  txt.split('\n').forEach((line, i) => {
    const urls = [...line.matchAll(/https?:\/\/[^\s)<>\]`"']+/g)].map((m) => m[0]);
    urls.push(...[...line.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]));
    for (const u of urls) {
      if (u.includes('<') || u.includes('>')) continue;
      checkFeedUrl('llms.txt', `line ${i + 1}`, u.replace(/[.,;:]+$/, ''));
    }
  });
} else warn('llms.txt', '(file)', 'Missing', 'feeds');

for (const slug of draftSlugs) {
  if (fileSet.has(`${slug}/llms-full.txt`)) error(`${slug}/llms-full.txt`, '(file)', 'llms-full.txt emitted for a draft', 'leak');
}

// Pagefind: fragments are gzipped "pagefind_dcd" + JSON; check every `url`.
{
  const fragDir = path.join(DIST, 'pagefind/fragment');
  if (!fs.existsSync(fragDir)) warn('pagefind/', '(dir)', 'No pagefind/fragment (run `npx pagefind --site <dist>`); Pagefind leak check skipped', 'pagefind');
  else {
    let n = 0;
    for (const f of fs.readdirSync(fragDir)) {
      const group = `pagefind/fragment/${f}`;
      let json;
      try {
        const text = zlib.gunzipSync(fs.readFileSync(path.join(fragDir, f))).toString('utf8');
        json = JSON.parse(text.slice(text.indexOf('{')));
      } catch (e) {
        error(group, '(file)', `Cannot decode fragment: ${e.message}`, 'pagefind');
        continue;
      }
      n++;
      checkFeedUrl(group, `url=${json.url}`, json.url ?? '');
    }
    if (n === 0) warn('pagefind/', '(dir)', 'Pagefind indexed no pages', 'pagefind');
  }
}

// ---------------------------------------------------------------------------
// PDFs (pdfjs-dist, only when PDFs exist)
// ---------------------------------------------------------------------------

const pdfs = [...fileSet].filter((f) => f.endsWith('.pdf'));
if (pdfs.length) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const norm = (s) => s.replace(/\s+/g, '').toLowerCase();
  for (const f of pdfs) {
    const slug = f.split('/')[0];
    const a = articles.get(slug);
    let text = '';
    try {
      const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(DIST, f))), isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
      const doc = await task.promise;
      for (let i = 1; i <= doc.numPages; i++) {
        const c = await (await doc.getPage(i)).getTextContent();
        text += c.items.map((it) => it.str ?? '').join(' ') + '\n';
      }
      await task.destroy();
    } catch (e) {
      error(f, '(file)', `PDF does not open: ${e.message}`, 'pdf');
      continue;
    }
    const t = norm(text);
    if (!t) error(f, '(text)', 'PDF has no extractable text', 'pdf');
    if (!a) {
      warn(f, '(file)', 'PDF not under an article folder; content checks skipped', 'pdf');
      continue;
    }
    if (!t.includes(norm(a.manifest.title))) error(f, '(text)', `Missing article title "${a.manifest.title}"`, 'pdf');
    for (const p of a.manifest.pages ?? []) {
      if (p.slug && !t.includes(norm(p.title))) error(f, '(text)', `Missing tab heading "${p.title}"`, 'pdf');
    }
    for (const phrase of PRINT_NOTICE_PHRASES) if (t.includes(norm(phrase))) error(f, '(text)', `Contains Print Notice text "${phrase}"`, 'pdf');
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

let nErr = 0;
let nWarn = 0;
for (const group of [...findings.keys()].sort()) {
  const list = findings.get(group).sort((x, y) => (x.level === y.level ? 0 : x.level === 'error' ? -1 : 1));
  console.log(`\n${group}`);
  for (const i of list) {
    if (i.level === 'error') nErr++;
    else nWarn++;
    console.log(`  ${i.level === 'error' ? 'ERROR' : 'warn '} ${group}:${i.field}  ${i.message}${i.rule ? ` [${i.rule}]` : ''}`);
  }
}
const tiers = [...pages.values()].reduce((acc, p) => ((acc[p.tier] = (acc[p.tier] ?? 0) + 1), acc), {});
console.log(
  `\nvalidate-dist: ${distArg} — ${pages.size} HTML page(s) (${Object.entries(tiers)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ')}), ${pdfs.length} PDF(s) — ${nErr} error(s), ${nWarn} warning(s)`,
);
process.exit(nErr > 0 ? 1 : 0);
