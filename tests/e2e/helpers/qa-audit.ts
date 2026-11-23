/**
 * Stage 5.3 QA helpers shared by every spec and article E2E.
 *
 * - `test` / `expect`: Playwright's, extended with an auto `qa` fixture that attaches error collectors to
 *   the default `page` and fails the test on any console error, page error, failed request, HTTP >= 400
 *   response or broken image (P18 hard gates). Tests that intentionally request a missing URL call
 *   `qa.allow(/pattern/)` first.
 * - `measureCls` / `measureLcp`: PerformanceObservers injected with `addInitScript` (before any page script).
 *   CLS is a hard gate everywhere; LCP is warn-only when `CI` is set (P18).
 * - `assertSeo`, `pressKey`, `withPrintMedia`, `setScheme`, `blurActive`: small, shared building blocks.
 */
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { spConfig } from '../../../sp.config';

export { expect };

export const FLAGSHIP = 'design-url-redirection-service';
export const DRAFT = 'bloom-filter-building-block';
export const PRIMARY_SERIES = 'system-design';
export const EDGE_SERIES = 'edge-and-traffic-architecture';
export const SITE = spConfig.siteUrl;
export const PREFS_KEY = spConfig.storageKey;
export const NAV_KEY = spConfig.navSessionKey;
export const BUDGETS = spConfig.qaBudgets;

// ---------------------------------------------------------------------------------------------------------
// Error collectors
// ---------------------------------------------------------------------------------------------------------

export interface ErrorCollector {
  /** Every issue seen so far (console errors, page errors, failed requests, HTTP errors, broken images). */
  readonly issues: string[];
  /** Ignore issues whose text matches (use only for URLs a test requests on purpose). */
  allow(pattern: RegExp): void;
  /** Scan the current document for broken images (`complete && naturalWidth === 0`). */
  scanImages(): Promise<void>;
  /** Issues not covered by `allow()`. */
  unexpected(): string[];
}

export function attachErrorCollectors(page: Page): ErrorCollector {
  const issues: string[] = [];
  const allowed: RegExp[] = [];
  const at = () => {
    try {
      return new URL(page.url()).pathname;
    } catch {
      return page.url();
    }
  };
  page.on('console', (m) => {
    // `location().url` names the failing resource for "Failed to load resource" messages.
    if (m.type() === 'error') issues.push(`console.error @ ${at()}: ${m.text()} [${m.location().url}]`);
  });
  page.on('pageerror', (e) => issues.push(`pageerror @ ${at()}: ${e.message}`));
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? 'unknown';
    // Requests cancelled by a navigation (ClientRouter swap, page.goto while loading) or by the media
    // element switching source are not failures of the site.
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(why)) return;
    issues.push(`requestfailed @ ${at()}: ${r.method()} ${r.url()} (${why})`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) issues.push(`http ${r.status()} @ ${at()}: ${r.request().method()} ${r.url()}`);
  });
  return {
    issues,
    allow: (p) => void allowed.push(p),
    async scanImages() {
      if (page.isClosed()) return;
      const broken = await page
        .evaluate(() =>
          Array.from(document.images)
            .filter((img) => img.complete && (img.currentSrc || img.getAttribute('src')) && img.naturalWidth === 0)
            .map((img) => img.currentSrc || img.getAttribute('src') || ''),
        )
        .catch(() => [] as string[]);
      for (const src of broken) issues.push(`broken image @ ${at()}: ${src}`);
    },
    unexpected: () => issues.filter((i) => !allowed.some((p) => p.test(i))),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Performance observers
// ---------------------------------------------------------------------------------------------------------

declare global {
  interface Window {
    __spQa?: { cls: number; shifts: { value: number; at: number }[]; lcp: number };
  }
}

const installedCls = new WeakSet<Page>();
const installedLcp = new WeakSet<Page>();

export interface ClsMeter {
  /** Summed `layout-shift` value without `hadRecentInput` since load or the last `reset()`. */
  read(): Promise<number>;
  reset(): Promise<void>;
}

/** Install a layout-shift observer before page scripts run (call before `goto`). */
export async function measureCls(page: Page): Promise<ClsMeter> {
  if (!installedCls.has(page)) {
    installedCls.add(page);
    await page.addInitScript(() => {
      const qa = (window.__spQa ??= { cls: 0, shifts: [], lcp: 0 });
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (e.hadRecentInput) continue;
            qa.cls += e.value;
            qa.shifts.push({ value: e.value, at: Math.round(e.startTime) });
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        /* unsupported */
      }
    });
  }
  return {
    read: () => page.evaluate(() => window.__spQa?.cls ?? 0),
    reset: () => page.evaluate(() => {
      if (window.__spQa) {
        window.__spQa.cls = 0;
        window.__spQa.shifts = [];
      }
    }),
  };
}

/** Install an LCP observer before page scripts run (call before `goto`). */
export async function measureLcp(page: Page): Promise<{ read(): Promise<number> }> {
  if (!installedLcp.has(page)) {
    installedLcp.add(page);
    await page.addInitScript(() => {
      const qa = (window.__spQa ??= { cls: 0, shifts: [], lcp: 0 });
      try {
        new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1);
          if (last) qa.lcp = last.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {
        /* unsupported */
      }
    });
  }
  return { read: () => page.evaluate(() => window.__spQa?.lcp ?? 0) };
}

/** LCP budget: hard locally, warn-only (annotation) in CI (P18). */
export async function assertLcpBudget(page: Page, testInfo: TestInfo, budgetMs: number = BUDGETS.maxLabLcpMs) {
  const lcp = await page.evaluate(() => window.__spQa?.lcp ?? 0);
  const msg = `LCP ${Math.round(lcp)} ms (budget ${budgetMs} ms)`;
  testInfo.annotations.push({ type: 'lcp', description: msg });
  if (process.env.CI) {
    if (lcp > budgetMs) testInfo.annotations.push({ type: 'warning', description: `LCP over budget (warn-only in CI): ${msg}` });
    return lcp;
  }
  expect(lcp, msg).toBeGreaterThan(0);
  expect(lcp, msg).toBeLessThan(budgetMs);
  return lcp;
}

// ---------------------------------------------------------------------------------------------------------
// SEO, keyboard, media, prefs
// ---------------------------------------------------------------------------------------------------------

/** Exactly one canonical (absolute, no query string, equal to `canonical` when given); robots noindex as expected. */
export async function assertSeo(page: Page, opts: { canonical?: string; noindex: boolean }) {
  const canonicals = await page.locator('link[rel="canonical"]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  expect(canonicals, 'exactly one canonical').toHaveLength(1);
  const href = canonicals[0];
  expect(href, 'canonical has no query string').not.toContain('?');
  expect(() => new URL(href)).not.toThrow();
  if (opts.canonical) expect(href).toBe(opts.canonical);
  const robots = (await page.locator('meta[name="robots"]').evaluateAll((els) => els.map((e) => e.getAttribute('content') ?? ''))).join(',');
  if (opts.noindex) {
    expect(robots).toMatch(/noindex/);
    expect(robots).toMatch(/nofollow/);
  } else {
    expect(robots).not.toMatch(/noindex/);
  }
}

/**
 * Press a shortcut in `sp.config.ts` notation: `mod+k` (Meta on macOS, Control elsewhere — the dispatcher
 * accepts either), chords like `g h`, or single keys (`t`, `?`, `>`, `[`).
 */
export async function pressKey(page: Page, combo: string) {
  if (combo.startsWith('mod+')) {
    await page.keyboard.press(`ControlOrMeta+${combo.slice(4)}`);
    return;
  }
  for (const k of combo.split(' ')) await page.keyboard.press(k);
}

/** Move focus off any widget so single-key shortcuts reach the dispatcher. */
export async function blurActive(page: Page) {
  await page.evaluate(() => {
    const a = document.activeElement;
    if (a instanceof HTMLElement || a instanceof SVGElement) a.blur();
  });
}

/** Run `fn` with `@media print` emulated, then restore screen media. */
export async function withPrintMedia<T>(page: Page, fn: () => Promise<T>): Promise<T> {
  await page.emulateMedia({ media: 'print' });
  try {
    return await fn();
  } finally {
    await page.emulateMedia({ media: 'screen' });
  }
}

export type Scheme = 'auto' | 'light' | 'dark';

/** Seed `sp-v8-prefs` before first paint for every page in the context (call before `goto`). */
export async function seedPrefs(page: Page, prefs: Partial<{ scheme: Scheme; singleKeyShortcuts: boolean; contrast: string; textSize: string }>) {
  await page.addInitScript(
    ([key, p]) => {
      try {
        if (sessionStorage.getItem('__spSeeded') === '1') return; // seed once per tab, keep later changes
        sessionStorage.setItem('__spSeeded', '1');
        const cur = JSON.parse(localStorage.getItem(key) || '{}');
        localStorage.setItem(key, JSON.stringify({ ...cur, ...p }));
      } catch {
        /* storage unavailable */
      }
    },
    [PREFS_KEY, prefs] as const,
  );
}

/** Wait until the Astro island containing `selector` has hydrated (no `ssr` attribute left). */
export async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const island = el.closest('astro-island');
      return !island || !island.hasAttribute('ssr');
    },
    selector,
    { timeout: 15_000 },
  );
}

/** Wait until the global keyboard dispatcher is listening (it is installed by the palette island). */
export async function waitForShortcuts(page: Page) {
  await page.waitForFunction(
    () =>
      (window as Window & { __spDispatcherInstalled?: boolean }).__spDispatcherInstalled === true &&
      Array.from(document.querySelectorAll('astro-island')).every(
        (i) => !/CommandPalette|ShortcutsModal/.test(i.getAttribute('component-url') ?? '') || !i.hasAttribute('ssr'),
      ),
    null,
    { timeout: 15_000 },
  );
}

export const isMobileProject = (testInfo: TestInfo) => testInfo.project.name.startsWith('mobile');

// ---------------------------------------------------------------------------------------------------------
// Extended test: every test gets error collectors + CLS/LCP observers on the default page.
// ---------------------------------------------------------------------------------------------------------

export const test = base.extend<{ qa: ErrorCollector & { cls: ClsMeter } }>({
  qa: [
    async ({ page }, use, testInfo) => {
      const collector = attachErrorCollectors(page);
      const cls = await measureCls(page);
      await measureLcp(page);
      await use(Object.assign(collector, { cls }));
      if (testInfo.status !== testInfo.expectedStatus) return; // already failing: don't mask the real error
      await collector.scanImages();
      const bad = collector.unexpected();
      expect(bad, `QA collectors (console/page errors, failed requests, broken images):\n${bad.join('\n')}`).toEqual([]);
    },
    { auto: true },
  ],
});
