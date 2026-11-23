/**
 * Stage 5.5 — unlisted tier (§3): drafts tray (#16), draft + prototype pages, Coming Soon cards, machine
 * surfaces (/llms.txt, llms-full.txt, RSS, sitemap) and Copy AI Prompt's clipboard-denied fallback (#18).
 */
import type { Page } from '@playwright/test';
import { test, expect, DRAFT, FLAGSHIP, SITE, assertSeo, blurActive, pressKey, waitForShortcuts } from './helpers/qa-audit';

const ART = `/${FLAGSHIP}/`;

interface DraftsIndex {
  drafts: { slug: string; title: string; url: string }[];
  prototypes: { slug: string; version: number; latest: boolean; url: string }[];
}

test.describe('drafts tray', () => {
  test('#16 /?drafts=true opens the tray listing drafts and prototypes; closed without the flag', async ({ page, request }) => {
    const idx = (await (await request.get('/drafts-index.json')).json()) as DraftsIndex;
    expect(idx.drafts.some((d) => d.url === `/${DRAFT}/`)).toBe(true);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.sp-drafts-tray')).toHaveCount(0);
    // Published home page never links an unlisted URL.
    const unlisted = [...idx.drafts.map((d) => d.url), ...idx.prototypes.map((p) => p.url)];
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
    for (const u of unlisted) expect(hrefs, `home links ${u}`).not.toContain(u);

    await page.goto('/?drafts=true');
    const tray = page.locator('.sp-drafts-tray');
    await expect(tray).toBeVisible();
    for (const u of unlisted) await expect(tray.locator(`a[href="${u}"]`)).toHaveCount(1);
  });
});

test.describe('draft and prototype pages', () => {
  test('draft page: noindex, Draft badge, no Copy AI Prompt, no Pagefind body, WIP banner', async ({ page }) => {
    await page.goto(`/${DRAFT}/`);
    await assertSeo(page, { canonical: `${SITE}/${DRAFT}/`, noindex: true });
    await expect(page.locator('.sp-draft-badge')).toContainText('Draft');
    await expect(page.locator('[data-sp-copy-ai-prompt]')).toHaveCount(0);
    await expect(page.locator('[data-pagefind-body]')).toHaveCount(0);
    await expect(page.locator('.sp-wip-banner')).toContainText('Work in progress');
  });

  test('prototype routes: latest + every vN are noindex, carry the unlisted banner and the Summary label', async ({ page, request }) => {
    const idx = (await (await request.get('/drafts-index.json')).json()) as DraftsIndex;
    const protos = idx.prototypes.filter((p) => p.slug === FLAGSHIP);
    expect(protos.length).toBeGreaterThan(0);
    const latest = protos.find((p) => p.latest)!;
    expect(latest.url).toBe(`/${FLAGSHIP}/prototype/`);
    const urls = [...protos.map((p) => ({ url: `/${FLAGSHIP}/prototype/v${p.version}/`, v: p.version })), { url: latest.url, v: latest.version }];
    for (const { url, v } of urls) {
      const res = await page.goto(url);
      expect(res?.status(), url).toBe(200);
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots, url).toMatch(/noindex,\s*nofollow/);
      await expect(page.locator('.sp-proto-unlisted')).toHaveText(`Prototype v${v} · unlisted`);
      const text = await page.locator('body').innerText();
      expect(text, url).not.toContain('Principal Engineer Summary');
      await expect(page.locator('[data-pagefind-body]')).toHaveCount(0);
    }
  });

  test('flagship: the draft ArticleRef renders an unlinked Coming Soon card (no href, no slug)', async ({ page }) => {
    await page.goto(ART);
    const cards = page.locator('.sp-ref', { hasText: 'Coming Soon' });
    expect(await cards.count()).toBeGreaterThan(0);
    for (let i = 0; i < (await cards.count()); i++) {
      const html = await cards.nth(i).evaluate((el) => el.outerHTML);
      expect(html).not.toMatch(/href=/);
      expect(html).not.toContain(DRAFT);
    }
    // No element anywhere on the published page points at the draft or a prototype.
    const urls = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[href],[src],[srcset]')).flatMap((el) =>
        ['href', 'src', 'srcset'].map((a) => el.getAttribute(a) ?? '').filter(Boolean),
      ),
    );
    expect(urls.filter((u) => u.includes(`/${DRAFT}/`) || u.includes('/prototype/'))).toEqual([]);
    await expect(page.locator('.sp-wip-banner')).toContainText('Work in progress');
  });

  test('missing URLs render the 404 page', async ({ page, qa }) => {
    qa.allow(/(http 404|Failed to load resource).*\/definitely-not-a-page\//);
    const res = await page.goto('/definitely-not-a-page/');
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('machine-readable surfaces', () => {
  test('/llms.txt, llms-full.txt, RSS and sitemap list the flagship and never the draft', async ({ request }) => {
    const idx = (await (await request.get('/drafts-index.json')).json()) as DraftsIndex;
    const draftUrls = idx.drafts.map((d) => d.url);

    const llms = await request.get('/llms.txt');
    expect(llms.status()).toBe(200);
    const llmsText = await llms.text();
    expect(llmsText).toContain(`${SITE}${ART}`);
    expect(llmsText).toContain(`${SITE}${ART}llms-full.txt`);
    const llmsUrls = llmsText.match(/https?:\/\/[^\s)]+/g) ?? [];
    for (const d of draftUrls) expect(llmsUrls.filter((u) => new URL(u).pathname.startsWith(d))).toEqual([]);
    expect(llmsUrls.filter((u) => u.includes('/prototype/'))).toEqual([]);

    const full = await request.get(`${ART}llms-full.txt`);
    expect(full.status()).toBe(200);
    const fullText = await full.text();
    expect(fullText.length).toBeGreaterThan(2000);
    expect(fullText).toMatch(/L3/);
    expect((await request.get(`/${DRAFT}/llms-full.txt`)).status()).toBe(404);

    const rss = await (await request.get('/rss.xml')).text();
    const rssLinks = [...rss.matchAll(/<(?:link|guid)[^>]*>([^<]+)<\/(?:link|guid)>/g)].map((m) => m[1]);
    expect(rssLinks).toContain(`${SITE}${ART}`);
    for (const d of draftUrls) expect(rssLinks.filter((u) => u.includes(d))).toEqual([]);

    const index = await (await request.get('/sitemap-index.xml')).text();
    const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(maps.length).toBeGreaterThan(0);
    const locs: string[] = [];
    for (const m of maps) locs.push(...[...(await (await request.get(m)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]));
    expect(locs).toContain(`${SITE}${ART}`);
    for (const d of draftUrls) expect(locs.filter((u) => new URL(u).pathname.startsWith(d))).toEqual([]);
    expect(locs.filter((u) => u.includes('/prototype/'))).toEqual([]);
  });
});

test.describe('Copy AI Prompt fallback', () => {
  async function denyClipboard(page: Page) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      });
    });
  }

  test('#18 clipboard denied → dialog with the selected, read-only prompt; Esc restores focus (button and l key)', async ({ page }) => {
    await denyClipboard(page);
    await page.goto(ART);
    await waitForShortcuts(page);
    const button = page.locator('[data-sp-copy-ai-prompt]');
    await page.waitForFunction(() => !document.querySelector('astro-island[component-url*="CopyAiPrompt"][ssr]'));

    await button.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const area = dialog.locator('textarea');
    await expect(area).toBeFocused();
    const info = await area.evaluate((t: HTMLTextAreaElement) => ({ ro: t.readOnly, selected: t.selectionEnd - t.selectionStart, len: t.value.length, value: t.value }));
    expect(info.ro).toBe(true);
    expect(info.selected).toBe(info.len);
    expect(info.value).toContain(`${SITE}${ART}llms-full.txt`);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();

    await blurActive(page);
    await pressKey(page, 'l');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
