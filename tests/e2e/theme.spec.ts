/**
 * Stage 5.4 — theme, preferences and the WCAG 2.1.4 single-key switch on the real site.
 * Ports preview-guide assertions #3, #7, #8 plus P11 (data-sp-* survive ClientRouter swaps) and no-FOUC.
 */
import { test, expect, FLAGSHIP, PREFS_KEY, blurActive, pressKey, seedPrefs, waitForShortcuts, waitForHydration } from './helpers/qa-audit';

const ART = `/${FLAGSHIP}/`;
const LAB = `/${FLAGSHIP}/interactive-lab/`;

const storedPrefs = (page: import('@playwright/test').Page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}') as Record<string, unknown>, PREFS_KEY);

test.describe('theme and preferences', () => {
  test('#3 t cycles auto → light → dark, stores the pref, resolves data-sp-scheme, survives reload pre-paint', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(ART);
    await waitForShortcuts(page);
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'auto');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'light'); // resolved, never "auto"

    await blurActive(page);
    await pressKey(page, 't');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'light');
    expect((await storedPrefs(page)).scheme).toBe('light');

    await pressKey(page, 't');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'dark');
    expect((await storedPrefs(page)).scheme).toBe('dark');

    // Pre-paint: record the attribute when <body> is first inserted, before any module script runs.
    await page.addInitScript(() => {
      const w = window as Window & { __schemeAtBody?: string | null };
      const mo = new MutationObserver(() => {
        if (document.body && w.__schemeAtBody === undefined) {
          w.__schemeAtBody = document.documentElement.getAttribute('data-sp-scheme');
          mo.disconnect();
        }
      });
      mo.observe(document, { childList: true, subtree: true });
    });
    await page.reload();
    expect(await page.evaluate(() => (window as Window & { __schemeAtBody?: string | null }).__schemeAtBody)).toBe('dark');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'dark');

    await waitForShortcuts(page);
    await blurActive(page);
    await pressKey(page, 't');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'auto');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'light'); // OS is light
    expect((await storedPrefs(page)).scheme).toBe('auto');
  });

  test('auto pref follows the OS scheme; an explicit pref ignores it', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(ART);
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'light');
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ scheme: 'dark' })), PREFS_KEY);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'dark');
  });

  test('P11: Light → Dark then a tab switch keeps every data-sp-* attribute', async ({ page }) => {
    await seedPrefs(page, { scheme: 'light', contrast: 'high', textSize: 'large' });
    await page.goto(ART);
    await waitForShortcuts(page);
    await blurActive(page);
    await pressKey(page, 't'); // light → dark
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'dark');
    await page.locator('a.sp-tab', { hasText: 'Interactive Lab' }).click();
    await page.waitForURL(`**${LAB}`);
    // ClientRouter swapped <html> attributes; the after-swap hook must re-apply them.
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-sp-contrast', 'high');
    await expect(page.locator('html')).toHaveAttribute('data-sp-text', 'large');
    await expect(page.locator('html')).toHaveAttribute('data-sp-nav-series', /.+/);
    await page.goBack();
    await page.waitForURL(`**${ART}`);
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme', 'dark');
  });

  test('themed visuals follow the toggle, not the OS (P7)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedPrefs(page, { scheme: 'dark' });
    await page.goto(ART);
    const visible = (cls: string) =>
      page.locator(`.${cls}`).evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);
    const total = await page.locator('.sp-visual-dark').count();
    test.skip(total === 0, 'no ThemedVisual on the page');
    expect(await visible('sp-visual-dark')).toBeGreaterThan(0);
    expect(await visible('sp-visual-light')).toBe(0);
  });

  test('#7 ? opens the shortcuts sheet; switching single keys off makes t/j no-ops, ⌘K still works, and it persists', async ({ page }) => {
    await seedPrefs(page, { scheme: 'dark', singleKeyShortcuts: true });
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 500 });
    await page.goto(ART);
    await waitForShortcuts(page);
    await blurActive(page);
    await pressKey(page, '?');
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toBeVisible();
    await pressKey(page, 't'); // a dialog is open: the dispatcher only handles mod+k
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'dark');

    const toggle = sheet.getByRole('switch');
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    expect((await storedPrefs(page)).singleKeyShortcuts).toBe(false);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await blurActive(page);
    const y0 = await page.evaluate(() => scrollY);
    await pressKey(page, 't');
    await pressKey(page, 'j');
    await page.waitForTimeout(400);
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'dark');
    expect(await page.evaluate(() => scrollY)).toBe(y0);
    await pressKey(page, '?');
    await expect(sheet).toBeHidden();

    await pressKey(page, 'mod+k');
    await expect(page.locator('[data-sp-palette]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-sp-palette]')).toBeHidden();

    // Persisted: survives reload, still off.
    await page.reload();
    await waitForShortcuts(page);
    await blurActive(page);
    await pressKey(page, 't');
    await page.waitForTimeout(200);
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'dark');
    expect((await storedPrefs(page)).singleKeyShortcuts).toBe(false);

    // Back on: t works again (proves the no-op above was the switch, not a dead dispatcher).
    await page.evaluate((k) => {
      const p = JSON.parse(localStorage.getItem(k) || '{}');
      localStorage.setItem(k, JSON.stringify({ ...p, singleKeyShortcuts: true }));
    }, PREFS_KEY);
    await page.reload();
    await waitForShortcuts(page);
    await blurActive(page);
    await pressKey(page, 't');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'auto');
  });

  test('#8 typing t inside the palette input or the cost slider never changes the theme', async ({ page }) => {
    await seedPrefs(page, { scheme: 'light' });
    await page.goto(LAB);
    await waitForShortcuts(page);

    await pressKey(page, 'mod+k');
    const input = page.locator('[cmdk-input]');
    await expect(input).toBeFocused();
    await page.keyboard.type('t');
    await expect(input).toHaveValue('t');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'light');
    await page.keyboard.press('Escape');

    const slider = page.locator('.sp-cost input[type="range"]').first();
    await slider.scrollIntoViewIfNeeded();
    await waitForHydration(page, '.sp-cost input[type="range"]');
    await slider.focus();
    const v0 = Number(await slider.inputValue());
    await page.keyboard.press('t');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'light');
    expect(Number(await slider.inputValue())).toBe(v0 + 1);

    // Sanity: on the body, t does cycle (the dispatcher is live).
    await blurActive(page);
    await pressKey(page, 't');
    await expect(page.locator('html')).toHaveAttribute('data-sp-scheme-pref', 'dark');
  });
});
