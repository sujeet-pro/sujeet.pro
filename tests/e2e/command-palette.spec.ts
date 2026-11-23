/**
 * Stage 5.4 — ⌘K palette (cmdk in a Radix Dialog) on the real site.
 * Ports preview-guide assertions #4, #5, #6, #9 and #18, plus Pagefind: a body-only phrase from the
 * flagship is found, and the draft title returns zero draft results (§3 leak rules).
 */
import type { Page } from '@playwright/test';
import { test, expect, FLAGSHIP, DRAFT, SITE, blurActive, pressKey, waitForShortcuts } from './helpers/qa-audit';

const ART = `/${FLAGSHIP}/`;
const GROUP_ORDER = ['Series', 'Articles & Tabs', 'Sections', 'Full-Text Matches', 'Commands'];
const STRUCTURAL = new Set(['Series', 'Articles & Tabs', 'Sections']);

const palette = (page: Page) => page.locator('[data-sp-palette]');
const input = (page: Page) => page.locator('[cmdk-input]');

interface RowInfo {
  group: string;
  key: string;
  text: string;
  top: number;
}

/** Visible groups (heading name without the count) and their rows, in DOM order. */
async function snapshot(page: Page): Promise<{ groups: { name: string; count: string }[]; rows: RowInfo[] }> {
  return page.locator('[data-sp-palette]').evaluate((root) => {
    const groups = Array.from(root.querySelectorAll('[cmdk-group]')).map((g) => {
      const spans = g.querySelectorAll('[cmdk-group-heading] .sp-cmd-group-title > span');
      return { el: g, name: spans[0]?.textContent?.trim() ?? '', count: spans[1]?.textContent?.trim() ?? '' };
    });
    return {
      groups: groups.map(({ name, count }) => ({ name, count })),
      rows: groups.flatMap(({ el, name }) =>
        Array.from(el.querySelectorAll('[cmdk-item]')).map((i) => ({
          group: name,
          key: i.getAttribute('data-value') ?? '',
          text: (i.textContent ?? '').trim(),
          top: Math.round(i.getBoundingClientRect().top),
        })),
      ),
    };
  });
}

async function openPalette(page: Page, path = ART) {
  await page.goto(path);
  await waitForShortcuts(page);
}

test.describe('command palette', () => {
  test('#4 mod+k opens the dialog with focus in the input; Esc closes and restores focus to the opener', async ({ page }) => {
    await openPalette(page);
    await blurActive(page);
    await pressKey(page, 'mod+k');
    await expect(palette(page)).toBeVisible();
    await expect(palette(page)).toHaveAttribute('role', 'dialog');
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();

    // Opener = the top-bar trigger button.
    const trigger = page.locator('[data-sp-open-palette]');
    await trigger.click();
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await expect(trigger).toBeFocused();

    // Opener = a focused link, palette opened with the keyboard.
    const tab = page.locator('a.sp-tab', { hasText: 'Interactive Lab' });
    await tab.focus();
    await pressKey(page, 'mod+k');
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(tab).toBeFocused();

    // mod+k toggles closed as well.
    await pressKey(page, 'mod+k');
    await expect(palette(page)).toBeVisible();
    await pressKey(page, 'mod+k');
    await expect(palette(page)).toBeHidden();
  });

  test('#5 "bloom": fixed group order and structural rows identical before and after full-text results arrive', async ({ page }) => {
    await openPalette(page);
    await pressKey(page, 'mod+k');
    await input(page).pressSequentially('bloom', { delay: 20 });
    // Pagefind is debounced (480 ms cold): the Full-Text group shows a pending count first.
    await expect(palette(page).locator('[cmdk-group-heading]', { hasText: 'Full-Text Matches' })).toBeVisible();
    const before = await snapshot(page);
    await expect
      .poll(async () => (await snapshot(page)).groups.find((g) => g.name === 'Full-Text Matches')?.count, { timeout: 8000 })
      .toMatch(/^\d+$/);
    const after = await snapshot(page);

    const names = after.groups.map((g) => g.name);
    expect(names).toEqual(GROUP_ORDER.filter((g) => names.includes(g)));
    expect(names).toContain('Sections');
    expect(names).toContain('Full-Text Matches');

    const structural = (s: typeof before) => s.rows.filter((r) => STRUCTURAL.has(r.group));
    expect(structural(before).length).toBeGreaterThan(0);
    expect(structural(after)).toEqual(structural(before)); // text, order and position (no jump)
    expect(after.rows.filter((r) => r.group === 'Full-Text Matches').length).toBeGreaterThan(0);
    expect(after.rows.some((r) => r.group === 'Sections' && /^L3 · Bloom/.test(r.text))).toBe(true);
  });

  test('#6 ">" opens Commands only; "dark" selects Theme → Dark first', async ({ page }) => {
    await openPalette(page);
    await blurActive(page);
    await pressKey(page, '>');
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveValue('> ');
    let snap = await snapshot(page);
    expect(snap.groups.map((g) => g.name)).toEqual(['Commands']);
    await input(page).pressSequentially('dark');
    await expect(palette(page).locator('[cmdk-item][data-selected="true"]')).toContainText('Theme → Dark');
    snap = await snapshot(page);
    expect(snap.groups.map((g) => g.name)).toEqual(['Commands']);
    expect(snap.rows[0].text).toContain('Theme → Dark');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'dark');
  });

  test('"/" opens search mode with an empty query', async ({ page }) => {
    await openPalette(page);
    await blurActive(page);
    await pressKey(page, '/');
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveValue('');
  });

  test('#9 Tab focus stays inside open dialogs (palette and shortcuts sheet)', async ({ page }) => {
    await openPalette(page);
    await pressKey(page, 'mod+k');
    await input(page).fill('theme');
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
      expect(await palette(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await blurActive(page);
    await pressKey(page, '?');
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
  });

  test('Enter on a Sections row navigates to the section on another tab', async ({ page }) => {
    await openPalette(page);
    await pressKey(page, 'mod+k');
    await input(page).fill('topology');
    const row = palette(page).locator('[cmdk-item][data-value^="section:"]').first();
    await expect(row).toBeVisible();
    await row.hover();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/interactive-lab\/#topology-simulator$/);
    await expect(page.locator('#topology-simulator')).toBeInViewport();
  });

  test('#18 l copies the AI prompt when clipboard-write is granted', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
    await openPalette(page);
    await page.waitForFunction(() => !document.querySelector('astro-island[component-url*="CopyAiPrompt"][ssr]'));
    await page.evaluate(() => navigator.clipboard.writeText('sentinel'));
    await blurActive(page);
    await pressKey(page, 'l');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`${SITE}/${FLAGSHIP}/llms-full.txt`);
    await expect(page.getByRole('dialog')).toHaveCount(0); // no fallback dialog when the clipboard works
  });

  test('Pagefind: a body-only phrase from the flagship is found; the draft title returns no draft result', async ({ page, request }) => {
    await openPalette(page);
    // Pick a word that is in the flagship body (Summary takeaways) but nowhere in the structural index,
    // so only Pagefind can find it.
    const graphUrl = await page.locator('meta[name="sp-graph-url"]').getAttribute('content');
    const graph = (await (await request.get(graphUrl!)).text()).toLowerCase();
    const body = (await page.locator('.sp-quickread').innerText()).toLowerCase();
    const word = [...new Set(body.match(/[a-z][a-z-]{7,}[a-z]/g) ?? [])]
      .filter((w) => !graph.includes(w))
      .sort((a, b) => b.length - a.length)[0];
    expect(word, 'a body-only word exists').toBeTruthy();

    type PfResult = { url: string };
    const search = (q: string) =>
      page.evaluate(async (query) => {
        const pf = await import(/* @vite-ignore */ '/pagefind/pagefind.js' as string);
        const res = await pf.search(query);
        return (await Promise.all(res.results.map((r: { data: () => Promise<PfResult> }) => r.data()))).map((d: PfResult) => d.url);
      }, q);

    const hits = await search(word);
    expect(hits.some((u) => u.startsWith(`/${FLAGSHIP}/`)), `Pagefind finds "${word}"`).toBe(true);

    // Through the palette: the body-only hit appears only in Full-Text Matches.
    await pressKey(page, 'mod+k');
    await input(page).fill(word);
    await expect(palette(page).locator('[cmdk-group]', { hasText: 'Full-Text Matches' }).locator('[cmdk-item]').first()).toBeVisible({ timeout: 8000 });
    const snap = await snapshot(page);
    expect(snap.rows.filter((r) => STRUCTURAL.has(r.group))).toEqual([]);
    await page.keyboard.press('Escape');

    const drafts = (await (await request.get('/drafts-index.json')).json()) as { drafts: { title: string; url: string }[] };
    const draft = drafts.drafts.find((d) => d.url === `/${DRAFT}/`);
    expect(draft).toBeTruthy();
    const draftHits = await search(draft!.title);
    expect(draftHits.filter((u) => u.includes(`/${DRAFT}/`))).toEqual([]);
    await pressKey(page, 'mod+k');
    await input(page).fill(draft!.title);
    await expect
      .poll(async () => (await snapshot(page)).groups.find((g) => g.name === 'Full-Text Matches')?.count, { timeout: 8000 })
      .toMatch(/^\d+$/);
    const keys = (await snapshot(page)).rows.map((r) => r.key);
    expect(keys.filter((k) => k.includes(DRAFT))).toEqual([]);
  });
});
