/**
 * Stage 5.7 — uniform container (§6.1), overflow, stage layout variant, Image ⇄ Interactive toggle (P27),
 * figure Expand (P15) and the ⌘K "bloom" → #stage-l3 path. Runs on both projects, Light and Dark.
 *
 * Variant-specific blocks read `spConfig.layout.stageVariant`; only the shipped arrangement runs. The
 * owner pick is `hybrid` (base `stacked`, `split` from `wideMinPx`), so `split` + `stacked` + Expand run and
 * `scrolly` / `stepper` (not built, §4.1 rule d) are skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { spConfig } from '../../sp.config';
import { test, expect, BUDGETS, FLAGSHIP, assertLcpBudget, isMobileProject, measureCls, pressKey, seedPrefs, waitForShortcuts, waitForHydration } from './helpers/qa-audit';

const ART = `/${FLAGSHIP}/`;
const LAB = `/${FLAGSHIP}/interactive-lab/`;
const evolution = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src/articles', FLAGSHIP, 'data/evolution.json'), 'utf8'),
) as { stages: { level: number; title: string }[] };
const LEVELS = evolution.stages.map((s) => s.level);
const LAYOUT = spConfig.layout;
const VARIANT = LAYOUT.stageVariant as 'split' | 'scrolly' | 'stacked' | 'stepper' | 'hybrid';
const BASE: 'stacked' | 'split' = VARIANT === 'hybrid' ? LAYOUT.hybrid.base : VARIANT === 'split' ? 'split' : 'stacked';
const WIDE: 'stacked' | 'split' = VARIANT === 'hybrid' ? LAYOUT.hybrid.wide : BASE;
const WIDE_MIN = LAYOUT.hybrid.wideMinPx;
const SHIPS = (a: 'split' | 'stacked') => BASE === a || WIDE === a;

/** Containers that must share left/right edges (§6.1). `.sp-container` rows compare their content box. */
const EDGE_SELECTORS = [
  '.sp-topbar-inner',
  '.sp-ctx-bar',
  '.sp-article-header',
  '.sp-quickread',
  '#evolution-ladder',
  'section.sp-stage',
  '.sp-connections',
  '.sp-site-footer-inner',
  '.sp-audio-inner',
];

async function edges(page: Page) {
  return page.evaluate((sels) => {
    const out: { key: string; sel: string; left: number; right: number }[] = [];
    for (const sel of sels) {
      document.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
        if (getComputedStyle(el).display === 'none') return;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const content = el.classList.contains('sp-container');
        const left = r.left + (content ? parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) : 0);
        const right = r.right - (content ? parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth) : 0);
        out.push({ key: sel, sel: `${sel}${el.id ? `#${el.id}` : i ? `[${i}]` : ''}`, left: Math.round(left * 10) / 10, right: Math.round(right * 10) / 10 });
      });
    }
    return out;
  }, EDGE_SELECTORS);
}

/** Where a stage's figure sits relative to its bullets. */
async function arrangement(page: Page, level: number): Promise<'split' | 'stacked' | 'other'> {
  return page.evaluate((lv) => {
    const sec = document.getElementById(`stage-l${lv}`)!;
    const main = sec.querySelector('.sp-stage-main')!.getBoundingClientRect();
    const fig = sec.querySelector('.sp-stage-figwrap')!.getBoundingClientRect();
    if (fig.left >= main.right - 1 && fig.top < main.bottom) return 'split';
    if (fig.top >= main.bottom - 1) return 'stacked';
    return 'other';
  }, level);
}

const noOverflow = (page: Page) =>
  page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`container + overflow (${scheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await seedPrefs(page, { scheme });
    });

    test(`container edges are equal within ±1px at the project viewport (${scheme})`, async ({ page }) => {
      await page.goto(ART);
      await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', scheme);
      const e = await edges(page);
      const found = new Set(e.map((x) => x.key));
      for (const required of EDGE_SELECTORS.filter((s) => s !== '.sp-audio-inner')) expect(found, `${required} rendered`).toContain(required);
      expect(e.filter((x) => x.key === 'section.sp-stage').length).toBe(LEVELS.length);
      const ref = e[0];
      const off = e.filter((x) => Math.abs(x.left - ref.left) > 1 || Math.abs(x.right - ref.right) > 1);
      expect(off, `reference ${ref.sel} [${ref.left}, ${ref.right}]`).toEqual([]);
    });

    test(`lab sections span the same container (${scheme})`, async ({ page }) => {
      await page.goto(LAB);
      const e = await page.evaluate(() => {
        const h = document.querySelector('.sp-article-header')!.getBoundingClientRect();
        return Array.from(document.querySelectorAll('.sp-lab')).map((l) => {
          const b = l.getBoundingClientRect();
          return [b.left - h.left, b.right - h.right];
        });
      });
      expect(e.length).toBeGreaterThan(0);
      for (const [dl, dr] of e) {
        expect(Math.abs(dl)).toBeLessThanOrEqual(1);
        expect(Math.abs(dr)).toBeLessThanOrEqual(1);
      }
    });

    for (const url of [ART, LAB, '/', '/explore/']) {
      test(`no horizontal overflow at 390px on ${url} (${scheme})`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        // Let client:visible islands (lab, explore graph) hydrate before measuring.
        for (let y = 0; y < 30; y++) {
          const done = await page.evaluate(() => {
            window.scrollBy(0, innerHeight);
            return innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
          });
          if (done) break;
        }
        await page.waitForLoadState('networkidle');
        const o = await noOverflow(page);
        expect(o.sw, JSON.stringify(o)).toBeLessThanOrEqual(o.cw);
      });
    }
  });
}

test.describe('stage layout variant', () => {
  test.describe('split', () => {
    test.skip(!SHIPS('split'), `stageVariant=${VARIANT} ships no split arrangement`);

    test(`at ≥ ${WIDE_MIN}px stages are split (figure beside the bullets)`, async ({ page }, testInfo) => {
      test.skip(isMobileProject(testInfo), 'phone viewport is below the wide breakpoint');
      test.skip(WIDE !== 'split', 'split is not the wide arrangement');
      await page.setViewportSize({ width: Math.max(1280, WIDE_MIN), height: 800 });
      await page.goto(ART);
      for (const lv of LEVELS) expect(await arrangement(page, lv), `L${lv}`).toBe('split');
    });

    test('at 899px the figure renders below the bullets', async ({ page }) => {
      await page.setViewportSize({ width: 899, height: 800 });
      await page.goto(ART);
      for (const lv of LEVELS) expect(await arrangement(page, lv), `L${lv}`).toBe('stacked');
    });
  });

  test.describe('stacked', () => {
    test.skip(!SHIPS('stacked'), `stageVariant=${VARIANT} ships no stacked arrangement`);

    test(`below ${WIDE_MIN}px stages are stacked (${BASE} base)`, async ({ page }) => {
      test.skip(BASE !== 'stacked', 'base arrangement is not stacked');
      await page.setViewportSize({ width: WIDE_MIN - 1, height: 800 });
      await page.goto(ART);
      for (const lv of LEVELS) expect(await arrangement(page, lv), `L${lv}`).toBe('stacked');
    });

    test('print and data-sp-export="pdf" always use the base arrangement', async ({ page }) => {
      test.skip(BASE !== 'stacked', 'base arrangement is not stacked');
      await page.setViewportSize({ width: Math.max(1280, WIDE_MIN), height: 800 });
      await page.goto(ART);
      await page.emulateMedia({ media: 'print' });
      expect(await arrangement(page, 3)).toBe('stacked');
      await expect(page.locator('#stage-l3 .sp-fig-bar')).toBeHidden(); // controls never print
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(() => document.documentElement.setAttribute('data-sp-export', 'pdf'));
      expect(await arrangement(page, 3)).toBe('stacked');
    });
  });

  test.describe('scrolly', () => {
    test.skip(VARIANT !== 'scrolly', `stageVariant=${VARIANT}: scrolly is not built (§4.1 rule d)`);
    test('pinned figure swaps per stage without transitions under reduced motion', async () => {
      // Intentionally empty until a scrolly arrangement ships (P25).
    });
  });

  test.describe('stepper', () => {
    test.skip(VARIANT !== 'stepper', `stageVariant=${VARIANT}: stepper is not built (§4.1 rule d)`);
    test('ArrowRight/ArrowLeft and j/k change the active level; /#stage-l2 activates L2', async () => {
      // Intentionally empty until a stepper arrangement ships (P23).
    });
  });

  test('without JavaScript every stage and its static figure is visible in flow', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(ART);
    const r = await page.evaluate(() => ({
      stages: document.querySelectorAll('section.sp-stage').length,
      figures: Array.from(document.querySelectorAll('section.sp-stage')).filter((s) =>
        Array.from(s.querySelectorAll<HTMLElement>('.sp-fig-slide:not([hidden])')).some((f) => f.getBoundingClientRect().height > 100),
      ).length,
      barsHidden: Array.from(document.querySelectorAll('.sp-fig-bar')).every((b) => getComputedStyle(b).display === 'none'),
    }));
    expect(r).toEqual({ stages: LEVELS.length, figures: LEVELS.length, barsHidden: true });
    await ctx.close();
  });
});

test.describe('stage figures', () => {
  test('Image → Interactive → Image is CLS 0 for every interactive figure; topology chunk loads only on first toggle', async ({ page }) => {
    test.setTimeout(90_000);
    const topoRequests: string[] = [];
    page.on('request', (r) => {
      if (/\/_astro\/SystemTopology[^/]*\.js/.test(r.url())) topoRequests.push(r.url());
    });
    await measureCls(page);
    await page.goto(ART);
    // Bring every client:visible figure island into view so it hydrates.
    for (const lv of LEVELS) {
      await page.locator(`#stage-l${lv} .sp-stage-figwrap`).scrollIntoViewIfNeeded();
      await waitForHydration(page, `#stage-l${lv} .sp-fig-frame`);
    }
    await page.waitForLoadState('networkidle');
    expect(topoRequests, 'no topology chunk before the first toggle').toEqual([]);

    const interactive = [];
    for (const lv of LEVELS) if ((await page.locator(`#stage-l${lv} .sp-fig-toggle`).count()) > 0) interactive.push(lv);
    expect(interactive.length).toBeGreaterThan(0);

    for (const lv of interactive) {
      const fig = page.locator(`#stage-l${lv} figure.sp-figure`).first();
      await fig.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const frame = fig.locator('.sp-fig-frame');
      const before = await frame.boundingBox();
      const docH = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.evaluate(() => {
        const w = window as Window & { __allShifts?: number };
        w.__allShifts = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries() as (PerformanceEntry & { value: number })[]) w.__allShifts! += e.value;
        }).observe({ type: 'layout-shift' });
      });
      const nonInput0 = await page.evaluate(() => window.__spQa?.cls ?? 0);

      await fig.getByRole('button', { name: 'Interactive', exact: true }).click();
      await expect(fig.getByRole('button', { name: 'Interactive', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(fig.locator('.sp-fig-live [data-node-id]').first()).toBeVisible();
      if (topoRequests.length === 0) await expect.poll(() => topoRequests.length).toBeGreaterThan(0);
      const mid = await frame.boundingBox();
      await fig.getByRole('button', { name: 'Image', exact: true }).click();
      await expect(fig.getByRole('button', { name: 'Image', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(250);
      const after = await frame.boundingBox();

      expect(mid, `L${lv} frame size in Interactive`).toEqual(before);
      expect(after, `L${lv} frame after round trip`).toEqual(before);
      expect(await page.evaluate(() => document.documentElement.scrollHeight), `L${lv} document height`).toBe(docH);
      expect(await page.evaluate(() => window.__spQa?.cls ?? 0), `L${lv} CLS without input`).toBe(nonInput0);
      expect(await page.evaluate(() => (window as Window & { __allShifts?: number }).__allShifts), `L${lv} all layout shifts`).toBe(0);
    }
    expect(new Set(topoRequests).size, 'one topology chunk, fetched once').toBe(1);
  });

  test('Expand opens a full-viewport dialog for every stage figure; Esc restores focus to Expand', async ({ page }) => {
    test.skip(!LAYOUT.figureExpand, 'figureExpand is off');
    await page.goto(ART);
    for (const lv of LEVELS) {
      const fig = page.locator(`#stage-l${lv} figure.sp-figure`).first();
      await fig.scrollIntoViewIfNeeded();
      await waitForHydration(page, `#stage-l${lv} .sp-fig-frame`);
      const expand = fig.locator('.sp-fig-expand');
      await expand.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const box = (await dialog.boundingBox())!;
      const vp = page.viewportSize()!;
      expect(box.width, `L${lv} dialog width`).toBeGreaterThan(vp.width * 0.85);
      expect(box.height, `L${lv} dialog height`).toBeGreaterThan(vp.height * 0.6);
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      await expect(dialog.locator('.sp-fig-dialog-frame, .sp-topo').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(expand, `L${lv} focus restored`).toBeFocused();
    }
  });

  test('Expand in Interactive mode shows the live topology', async ({ page }) => {
    test.skip(!LAYOUT.figureExpand, 'figureExpand is off');
    await page.goto(ART);
    const fig = page.locator('#stage-l3 figure.sp-figure').first();
    await fig.scrollIntoViewIfNeeded();
    await waitForHydration(page, '#stage-l3 .sp-fig-frame');
    await fig.getByRole('button', { name: 'Interactive', exact: true }).click();
    await fig.locator('.sp-fig-expand').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.sp-topo [data-node-id]').first()).toBeVisible();
    await expect(dialog.locator('[data-node-ghost]').first()).toBeAttached(); // L3 replaces a node
    await page.keyboard.press('Escape');
    await expect(fig.locator('.sp-fig-expand')).toBeFocused();
  });
});

test.describe('⌘K → stage', () => {
  test('"bloom" lists the L3 stage under Sections; Enter lands on #stage-l3 in view', async ({ page }) => {
    const l3 = evolution.stages.find((s) => s.level === 3)!;
    expect(l3.title).toMatch(/Bloom/);
    const label = `L3 · ${l3.title}`;
    await page.goto(ART);
    await waitForShortcuts(page);
    await pressKey(page, 'mod+k');
    await page.locator('[cmdk-input]').fill('bloom');
    const sections = page.locator('[data-sp-palette] [cmdk-group]').filter({ has: page.locator('.sp-cmd-group-title', { hasText: /^Sections/ }) });
    const row = sections.locator('[cmdk-item]', { hasText: label });
    await expect(row).toBeVisible();
    await row.hover();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#stage-l3');
    await expect(page.locator('#stage-l3')).toBeInViewport();
    await expect(page.locator('#stage-l3-title')).toHaveText(label);
    await expect
      .poll(() => page.evaluate(() => Math.round(document.getElementById('stage-l3')!.getBoundingClientRect().top)))
      .toBeLessThan(page.viewportSize()!.height / 2);
  });
});

test.describe('Core Web Vitals (P18)', () => {
  for (const url of [ART, LAB, '/', '/explore/', '/series/system-design/']) {
    test(`CLS < ${BUDGETS.maxCls} on load and scroll-through of ${url}`, async ({ page, qa }) => {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      for (let y = 0; y < 30; y++) {
        const done = await page.evaluate(() => {
          window.scrollBy(0, innerHeight);
          return innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
        });
        await page.waitForTimeout(60);
        if (done) break;
      }
      await page.waitForLoadState('networkidle');
      expect(await qa.cls.read()).toBeLessThan(BUDGETS.maxCls);
    });
  }

  test(`lab LCP < ${BUDGETS.maxLabLcpMs} ms (hard locally, warn-only in CI)`, async ({ page }, testInfo) => {
    await page.goto(LAB);
    await page.waitForLoadState('networkidle');
    await assertLcpBudget(page, testInfo);
  });
});
