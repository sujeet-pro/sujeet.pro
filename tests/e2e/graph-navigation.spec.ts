/**
 * Stage 5.5 — multi-series breadcrumbs (P10), the series switcher, series-hub entry, Connections panel and
 * /explore/. Ports preview-guide assertions #10, #11 and #17.
 */
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  BUDGETS,
  EDGE_SERIES,
  FLAGSHIP,
  NAV_KEY,
  PRIMARY_SERIES,
  SITE,
  assertSeo,
  measureCls,
  waitForHydration,
} from './helpers/qa-audit';

const ART = `/${FLAGSHIP}/`;
const CANONICAL = `${SITE}${ART}`;

/** Series variants that are actually displayed (label in the switcher button and Prev/Next nav). */
async function shownVariants(page: Page) {
  return page.evaluate(() => {
    const shown = (sel: string) =>
      Array.from(document.querySelectorAll(sel))
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => el.getAttribute('data-sp-series-variant'));
    return { label: shown('#sp-series-btn [data-sp-series-variant]'), prevNext: shown('.sp-prevnext-variant') };
  });
}

/** Record html[data-sp-nav-series] when <body> is first inserted (pre-paint proof, P10). */
async function recordNavAtBody(page: Page) {
  await page.addInitScript(() => {
    const w = window as Window & { __navAtBody?: string | null };
    const mo = new MutationObserver(() => {
      if (document.body && w.__navAtBody === undefined) {
        w.__navAtBody = document.documentElement.getAttribute('data-sp-nav-series');
        mo.disconnect();
      }
    });
    mo.observe(document, { childList: true, subtree: true });
  });
}
const navAtBody = (page: Page) => page.evaluate(() => (window as Window & { __navAtBody?: string | null }).__navAtBody);

test.describe('multi-series context (P10)', () => {
  for (const [label, qs, expected] of [
    ['no ctx → primary series', '', PRIMARY_SERIES],
    ['?ctx=series:<edge> → edge series', `?ctx=series:${EDGE_SERIES}`, EDGE_SERIES],
    ['?ctx=series:bogus → primary series', '?ctx=series:bogus', PRIMARY_SERIES],
  ] as const) {
    test(`#10 ${label}: set before first paint, one label + Prev/Next variant, canonical clean, CLS < budget`, async ({ page, qa }) => {
      await recordNavAtBody(page);
      await page.goto(ART + qs);
      expect(await navAtBody(page)).toBe(expected);
      await expect(page.locator('html')).toHaveAttribute('data-sp-nav-series', expected);
      expect(await shownVariants(page)).toEqual({ label: [expected], prevNext: [expected] });
      await assertSeo(page, { canonical: CANONICAL, noindex: false });
      await page.waitForLoadState('networkidle');
      expect(await qa.cls.read()).toBeLessThan(BUDGETS.maxCls);
    });
  }

  test('session context is reused without ?ctx; an invalid ctx ignores the session value', async ({ page }) => {
    await page.goto(`${ART}?ctx=series:${EDGE_SERIES}`);
    expect(await page.evaluate((k) => sessionStorage.getItem(k), NAV_KEY)).toBe(EDGE_SERIES);
    await page.goto(ART);
    await expect(page.locator('html')).toHaveAttribute('data-sp-nav-series', EDGE_SERIES);
    await page.goto(`${ART}?ctx=series:bogus`);
    await expect(page.locator('html')).toHaveAttribute('data-sp-nav-series', PRIMARY_SERIES);
  });

  test('#11 choosing a series in the switcher menu updates label, Prev/Next, URL and sessionStorage; CLS < budget', async ({ page, qa }) => {
    await page.goto(ART);
    await page.waitForLoadState('networkidle');
    const btn = page.locator('#sp-series-btn');
    const menu = page.locator('#sp-series-menu');
    await expect(menu).toHaveAttribute('role', 'menu');
    await qa.cls.reset();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const item = menu.getByRole('menuitemradio').filter({ has: page.locator(`[data-select-series="${EDGE_SERIES}"]`) }).or(
      menu.locator(`[role="menuitemradio"][data-select-series="${EDGE_SERIES}"]`),
    );
    await item.first().click();
    await expect(page.locator('html')).toHaveAttribute('data-sp-nav-series', EDGE_SERIES);
    expect(await shownVariants(page)).toEqual({ label: [EDGE_SERIES], prevNext: [EDGE_SERIES] });
    expect(await page.evaluate((k) => sessionStorage.getItem(k), NAV_KEY)).toBe(EDGE_SERIES);
    expect(new URL(page.url()).search).toBe(`?ctx=series:${EDGE_SERIES}`);
    await expect(menu.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveAttribute('data-select-series', EDGE_SERIES);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await assertSeo(page, { canonical: CANONICAL, noindex: false }); // canonical never carries ?ctx
    await page.waitForTimeout(300);
    expect(await qa.cls.read()).toBeLessThan(BUDGETS.maxCls);
  });

  test('switcher menu is keyboard operable and clamps to the viewport (P16)', async ({ page }) => {
    await page.goto(ART);
    const btn = page.locator('#sp-series-btn');
    await btn.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#sp-series-menu')).toHaveAttribute('data-open', 'true');
    await expect(page.locator(`[role="menuitemradio"][data-select-series="${PRIMARY_SERIES}"]`)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(`[role="menuitemradio"][data-select-series="${EDGE_SERIES}"]`)).toBeFocused();
    const r = await page.evaluate(() => {
      const m = document.getElementById('sp-series-menu')!.getBoundingClientRect();
      return { left: m.left, right: m.right, vw: document.documentElement.clientWidth };
    });
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(r.vw);
    await page.keyboard.press('Escape');
    await expect(page.locator('#sp-series-menu')).toHaveAttribute('data-open', 'false');
    await expect(btn).toBeFocused();
  });

  test('entering from the series hub link activates that series context with clean canonical and CLS < budget', async ({ page }) => {
    const cls = await measureCls(page);
    await page.goto(`/series/${EDGE_SERIES}/`);
    const link = page.locator(`main a[href^="${ART}"]`).first();
    await expect(link).toHaveAttribute('href', `${ART}?ctx=series:${EDGE_SERIES}`);
    await link.click();
    await page.waitForURL(`**${ART}?ctx=series:${EDGE_SERIES}`);
    await expect(page.locator('html')).toHaveAttribute('data-sp-nav-series', EDGE_SERIES);
    expect(await shownVariants(page)).toEqual({ label: [EDGE_SERIES], prevNext: [EDGE_SERIES] });
    await assertSeo(page, { canonical: CANONICAL, noindex: false });
    await page.waitForLoadState('networkidle');
    expect(await cls.read()).toBeLessThan(BUDGETS.maxCls);
  });
});

test.describe('Connections panel', () => {
  test('lists series memberships, typed relations and backlinks from the graph; drafts are Coming Soon without href', async ({ page, request }) => {
    await page.goto(ART);
    const panel = page.locator('section.sp-connections');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Connections & Backlinks' })).toBeVisible();

    const graphUrl = await page.locator('meta[name="sp-graph-url"]').getAttribute('content');
    const graph = (await (await request.get(graphUrl!)).json()) as {
      series: { slug: string; title: string; articles: string[] }[];
      articles: { slug: string; title: string }[];
      edges: { from: { article: string }; to: { article: string }; kind: string }[];
    };
    // Part of Series: one row per membership, linking the hub.
    const memberships = graph.series.filter((s) => s.articles.includes(FLAGSHIP));
    const seriesCol = panel.locator('.sp-conn-col', { has: page.getByRole('heading', { name: 'Part of Series' }) });
    for (const s of memberships) {
      await expect(seriesCol.locator(`a[href^="/series/${s.slug}/"]`)).toHaveText(s.title);
    }

    // Referenced By: exactly the published articles whose relations point here.
    const backlinkSources = graph.edges.filter((e) => e.to.article === FLAGSHIP).map((e) => e.from.article);
    const refCol = panel.locator('.sp-conn-col', { has: page.getByRole('heading', { name: 'Referenced By' }) });
    if (backlinkSources.length === 0) {
      await expect(refCol).toHaveCount(0);
    } else {
      for (const src of backlinkSources) await expect(refCol.locator(`a[href^="/${src}/"]`).first()).toBeVisible();
    }

    // Upcoming (draft) relation: Coming Soon, no link, no slug anywhere in the row.
    const upcoming = panel.locator('.sp-conn-item', { has: page.locator('.sp-badge-upcoming') });
    const n = await upcoming.count();
    for (let i = 0; i < n; i++) {
      const row = upcoming.nth(i);
      await expect(row.locator('a')).toHaveCount(0);
      expect(await row.evaluate((el) => el.outerHTML)).not.toMatch(/href=/);
    }
    // Every link in the panel resolves (no draft hrefs).
    const hrefs = await panel.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    for (const h of new Set(hrefs)) expect((await request.get(h)).status(), h).toBe(200);
  });
});

test.describe('/explore/', () => {
  test('#17 series/archetype filters hide non-matching nodes; clicking a node fills the preview', async ({ page }) => {
    await page.goto('/explore/');
    const svg = page.locator('.sp-xp-svgwrap svg');
    await svg.scrollIntoViewIfNeeded();
    await waitForHydration(page, '[data-xp-series="all"]');
    const node = (id: string) => page.locator(`[data-xp-node="${id}"]`);
    const hidden = async () =>
      page.locator('[data-xp-node]').evaluateAll((els) =>
        Object.fromEntries(els.map((e) => [e.getAttribute('data-xp-node'), e.getAttribute('data-hidden') === 'true'])),
      );

    const all = await hidden();
    expect(Object.values(all).every((h) => !h)).toBe(true);

    await page.locator(`[data-xp-series="${EDGE_SERIES}"]`).click();
    await expect(page.locator(`[data-xp-series="${EDGE_SERIES}"]`)).toHaveAttribute('aria-pressed', 'true');
    let h = await hidden();
    expect(h[`s:${PRIMARY_SERIES}`]).toBe(true); // other series hidden
    expect(h[`s:${EDGE_SERIES}`]).toBe(false);
    expect(h[`a:${FLAGSHIP}`]).toBe(false); // member of both
    await expect(node(`s:${PRIMARY_SERIES}`)).toBeHidden();
    await expect(node(`a:${FLAGSHIP}`)).toBeVisible();

    await page.locator('[data-xp-series="all"]').click();
    // An archetype that no published article has hides every content node (and the series without members).
    const archetypes = await page.locator('[data-xp-archetype]').evaluateAll((els) => els.map((e) => e.getAttribute('data-xp-archetype')!));
    const flagshipArchetype = 'design-x';
    expect(archetypes).toContain(flagshipArchetype);
    await page.locator(`[data-xp-archetype="${flagshipArchetype}"]`).click();
    h = await hidden();
    expect(h[`a:${FLAGSHIP}`]).toBe(false);
    for (const other of archetypes.filter((a) => a !== 'all' && a !== flagshipArchetype)) {
      await page.locator(`[data-xp-archetype="${other}"]`).click();
      h = await hidden();
      expect(h[`a:${FLAGSHIP}`]).toBe(true);
    }
    await page.locator('[data-xp-archetype="all"]').click();

    // Selecting a series node fills the preview with that series and an Open link.
    await node(`s:${EDGE_SERIES}`).click();
    const preview = page.locator('[data-xp-preview]');
    await expect(preview).toContainText('Edge & Traffic Architecture');
    await expect(preview.locator('a.sp-xp-open')).toHaveAttribute('href', new RegExp(`/series/${EDGE_SERIES}/`));
    // Keyboard: Enter on a focused node previews it.
    await node(`a:${FLAGSHIP}`).focus();
    await page.keyboard.press('Enter');
    await expect(preview.locator('a.sp-xp-open')).toHaveAttribute('href', new RegExp(`/${FLAGSHIP}/`));
  });
});
