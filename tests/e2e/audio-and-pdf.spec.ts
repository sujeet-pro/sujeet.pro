/**
 * Stage 5.6 — persistent audio companion (#14) and PDF / print guard (#15).
 *
 * Media is generated locally (Stage 6.4) and may not exist yet. Each block skips itself unless the built
 * file exists in `dist/` (`dist/<slug>/audio/episode.mp3` + `chapters.json`, `dist/<slug>/<slug>.pdf`), and
 * runs fully as soon as it does. The print test without a PDF always runs (no notice must appear then).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect, FLAGSHIP, blurActive, pressKey, waitForShortcuts, withPrintMedia } from './helpers/qa-audit';

const ART = `/${FLAGSHIP}/`;
const LAB = `/${FLAGSHIP}/interactive-lab/`;
const DIST = path.join(process.cwd(), 'dist', FLAGSHIP);
const HAS_AUDIO = fs.existsSync(path.join(DIST, 'audio', 'episode.mp3')) && fs.existsSync(path.join(DIST, 'audio', 'chapters.json'));
const HAS_PDF = fs.existsSync(path.join(DIST, `${FLAGSHIP}.pdf`));

interface Chapter {
  id: string;
  startSec: number;
  targetPage?: string;
  targetSectionId?: string;
}

const audioState = (page: Page) =>
  page.evaluate(() => {
    const all = document.querySelectorAll('audio');
    const a = all[0];
    return { n: all.length, t: a?.currentTime ?? -1, paused: a?.paused ?? true };
  });
const waitAudioReady = (page: Page) =>
  page.waitForFunction(() => (window as Window & { __spAudioReady?: boolean }).__spAudioReady === true, null, { timeout: 15_000 });

// Playback starts from a key press / click, but headless Chromium may still gate media without this flag.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

test.describe('audio companion', () => {
  test.skip(!HAS_AUDIO, `no dist/${FLAGSHIP}/audio/episode.mp3 + chapters.json yet (media is generated in Stage 6.4)`);

  test('#14 p plays, ] / [ seek ±15 s, chapter and transcript drawers open', async ({ page }) => {
    await page.goto(ART);
    await waitForShortcuts(page);
    await waitAudioReady(page);
    await expect(page.locator('audio')).toHaveCount(1);
    await expect(page.locator('audio')).toHaveAttribute('preload', 'none');

    await blurActive(page);
    await pressKey(page, 'p');
    await expect.poll(async () => (await audioState(page)).t, { timeout: 8000 }).toBeGreaterThan(0.3);
    expect((await audioState(page)).paused).toBe(false);
    await pressKey(page, 'p');
    await expect.poll(async () => (await audioState(page)).paused).toBe(true);

    const t0 = (await audioState(page)).t;
    await pressKey(page, ']');
    await expect.poll(async () => (await audioState(page)).t).toBeCloseTo(t0 + 15, 0);
    await pressKey(page, '[');
    await expect.poll(async () => (await audioState(page)).t).toBeCloseTo(t0, 0);

    const drawer = page.locator('#sp-audio-drawer');
    await page.locator('button[aria-controls="sp-audio-drawer"]', { hasText: 'Chapters' }).click();
    await expect(drawer).toBeVisible();
    const chapters = drawer.locator('[data-sp-chapter]');
    expect(await chapters.count()).toBeGreaterThan(1);
    await page.locator('button[aria-controls="sp-audio-drawer"]', { hasText: 'Transcript' }).click();
    await expect(drawer.locator('.sp-transcript-ch').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    // Shortcuts are ignored while the scrubber (a range input) has focus (P14).
    await page.locator('.sp-audio-scrub').focus();
    const s0 = await audioState(page);
    await page.keyboard.press('p');
    expect((await audioState(page)).paused).toBe(s0.paused);
  });

  test('one <audio> persists across tabs and browser Back; currentTime is monotonic', async ({ page }) => {
    await page.goto(ART);
    await waitAudioReady(page);
    await page.locator('[data-sp-audio-listen]').click();
    await expect.poll(async () => (await audioState(page)).t, { timeout: 8000 }).toBeGreaterThan(0.3);

    const samples: number[] = [(await audioState(page)).t];
    await page.locator('a.sp-tab', { hasText: 'Interactive Lab' }).click();
    await page.waitForURL(`**${LAB}`);
    let s = await audioState(page);
    expect(s.n).toBe(1);
    samples.push(s.t);
    await expect.poll(async () => (await audioState(page)).t).toBeGreaterThan(s.t);
    samples.push((await audioState(page)).t);

    await page.goBack();
    await page.waitForURL(`**${ART}`);
    s = await audioState(page);
    expect(s.n).toBe(1);
    expect(s.paused).toBe(false);
    samples.push(s.t);
    await expect.poll(async () => (await audioState(page)).t).toBeGreaterThan(s.t);
    samples.push((await audioState(page)).t);
    for (let i = 1; i < samples.length; i++) expect(samples[i], `sample ${i} of ${samples.join(', ')}`).toBeGreaterThanOrEqual(samples[i - 1]);
  });

  test('Jump to Section scrolls to the chapter section on its target tab', async ({ page, request }) => {
    const out = (await (await request.get(`${ART}audio/chapters.json`)).json()) as { chapters: Chapter[] };
    const target = out.chapters.find((c) => c.targetSectionId && !c.targetPage);
    test.skip(!target, 'no chapter targets a section on the index page');
    await page.goto(LAB);
    await waitAudioReady(page);
    await page.locator('button[aria-controls="sp-audio-drawer"]', { hasText: 'Chapters' }).click();
    await page.locator(`[data-sp-chapter="${target!.id}"]`).click();
    await expect.poll(async () => (await audioState(page)).t).toBeGreaterThanOrEqual(target!.startSec - 0.5);
    await page.keyboard.press('Escape');
    await page.locator('.sp-audio-jump').click();
    await page.waitForURL(`**${ART}#${target!.targetSectionId}`);
    await expect(page.locator(`#${target!.targetSectionId}`)).toBeInViewport();
    await expect(page.locator('audio')).toHaveCount(1);
  });
});

test.describe('PDF edition and print guard', () => {
  test('GET /<slug>/<slug>.pdf → 200 application/pdf', async ({ request }) => {
    test.skip(!HAS_PDF, `no dist/${FLAGSHIP}/${FLAGSHIP}.pdf yet (generated in Stage 6.4)`);
    const res = await request.get(`${ART}${FLAGSHIP}.pdf`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    expect((await res.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('the article PDF action links to the generated edition', async ({ page }) => {
    test.skip(!HAS_PDF, `no dist/${FLAGSHIP}/${FLAGSHIP}.pdf yet (generated in Stage 6.4)`);
    await page.goto(ART);
    const link = page.locator('a[data-sp-pdf-link]');
    await expect(link).toHaveAttribute('href', `/${FLAGSHIP}/${FLAGSHIP}.pdf`);
    await expect(link).not.toHaveAttribute('aria-disabled', /.*/);
  });

  test('#15 print media shows the Print Notice and hides the app shell and audio bar', async ({ page }) => {
    test.skip(!HAS_PDF, `no dist/${FLAGSHIP}/${FLAGSHIP}.pdf yet (generated in Stage 6.4)`);
    await page.goto(ART);
    await expect(page.locator('html')).toHaveAttribute('data-sp-has-pdf', '');
    await withPrintMedia(page, async () => {
      const notice = page.locator('.sp-print-notice');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(`${FLAGSHIP}.pdf`);
      for (const sel of ['.sp-app-shell', '.sp-audio-bar', '#main']) {
        const els = page.locator(sel);
        for (let i = 0; i < (await els.count()); i++) await expect(els.nth(i)).toBeHidden();
      }
    });
    await expect(page.locator('.sp-print-notice')).toBeHidden();
  });

  test('without a PDF, printing is not blocked: no notice, article content prints', async ({ page }) => {
    test.skip(HAS_PDF, 'a PDF exists: covered by #15');
    await page.goto(ART);
    await expect(page.locator('html')).not.toHaveAttribute('data-sp-has-pdf', /.*/);
    await withPrintMedia(page, async () => {
      await expect(page.locator('.sp-print-notice')).toHaveCount(0);
      await expect(page.locator('h1.sp-article-title')).toBeVisible();
      await expect(page.locator('#stage-l0')).toBeVisible();
    });
  });
});
