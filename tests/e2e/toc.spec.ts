import { expect } from "@playwright/test";
import { test } from "./helpers";

const SERIES_ARTICLE = "/articles/crp-rendering-pipeline-overview/";
const BLOG_SLUG = "/blogs/chrome-developer-setup/";

test.describe("TOC — Desktop", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("right sidebar TOC visible on article pages", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const toc = page.locator(".sidebar-right .toc");
    await expect(toc).toBeVisible();
    await expect(toc.locator(".toc-title")).toHaveText("On this page");
  });

  test("TOC lists h2 and h3 headings", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const tocItems = page.locator(".sidebar-right .toc-item");
    await expect(tocItems).not.toHaveCount(0);

    const proseHeadings = page.locator(".prose h2, .prose h3");
    const headingCount = await proseHeadings.count();
    const tocCount = await tocItems.count();
    expect(tocCount).toBeGreaterThanOrEqual(headingCount);
  });

  test("TOC items have correct depth classes", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const tocItems = page.locator(".sidebar-right .toc-item");
    const firstItem = tocItems.first();
    const className = await firstItem.getAttribute("class");
    expect(className).toMatch(/depth-[23]/);
  });

  test("clicking TOC link scrolls to heading", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const firstTocLink = page.locator(".sidebar-right .toc-item a").first();
    const href = await firstTocLink.getAttribute("href");
    const targetId = href!.replace("#", "");

    await firstTocLink.click();
    await page.waitForTimeout(500);

    const heading = page.locator(`#${CSS.escape(targetId)}`);
    await expect(heading).toBeInViewport();
  });

  test("active TOC item highlights on scroll", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.waitForTimeout(500);

    const tocItems = page.locator(".sidebar-right .toc-item");
    const secondLink = tocItems.nth(1).locator("a");
    const href = await secondLink.getAttribute("href");
    const targetId = href!.replace("#", "");

    await page.locator(`#${CSS.escape(targetId)}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);

    await expect(tocItems.nth(1)).toHaveClass(/active/);
  });

  test("active item changes when scrolling to different section", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const tocItems = page.locator(".sidebar-right .toc-item");
    const count = await tocItems.count();
    if (count < 3) return;

    const secondLink = tocItems.nth(1).locator("a");
    const secondHref = await secondLink.getAttribute("href");
    await page.locator(`#${CSS.escape(secondHref!.replace("#", ""))}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await expect(tocItems.nth(1)).toHaveClass(/active/);

    const thirdLink = tocItems.nth(2).locator("a");
    const thirdHref = await thirdLink.getAttribute("href");
    await page.locator(`#${CSS.escape(thirdHref!.replace("#", ""))}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await expect(tocItems.nth(2)).toHaveClass(/active/);
  });

  test("TOC NOT visible on home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar-right")).not.toBeAttached();
  });

  test("blog page has right sidebar TOC", async ({ page }) => {
    await page.goto(BLOG_SLUG);
    await expect(page.locator(".sidebar-right .toc")).toBeVisible();
  });
});

test.describe("TOC — Articles listing page", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("listing TOC shows series headings", async ({ page }) => {
    await page.goto("/articles/");
    const toc = page.locator(".sidebar-right .toc");
    await expect(toc).toBeVisible();

    const tocItems = toc.locator(".toc-item");
    await expect(tocItems).not.toHaveCount(0);
  });

  test("TOC entries correspond to category sections on page", async ({ page }) => {
    await page.goto("/articles/");
    const sections = page.locator(".category-section h2");
    const sectionCount = await sections.count();

    const tocItems = page.locator(".sidebar-right .toc-item");
    const tocCount = await tocItems.count();

    expect(tocCount).toBeGreaterThanOrEqual(sectionCount);
  });

  test("clicking listing TOC link scrolls to category", async ({ page }) => {
    await page.goto("/articles/");
    const tocLink = page.locator(".sidebar-right .toc-item a").first();
    const href = await tocLink.getAttribute("href");
    const targetId = href!.replace("#", "");

    await tocLink.click();
    await page.waitForTimeout(500);

    const section = page.locator(`#${CSS.escape(targetId)}`);
    await expect(section).toBeInViewport();
  });
});

test.describe("TOC — Mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("right sidebar TOC is hidden", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".sidebar-right")).not.toBeVisible();
  });

  test("mobile TOC accordion is visible", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const mobileToc = page.locator(".toc-mobile");
    await expect(mobileToc).toBeVisible();
    await expect(mobileToc.locator("summary")).toContainText("On this page");
  });

  test("accordion opens and closes on click", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const accordion = page.locator(".toc-mobile");
    const tocList = accordion.locator(".toc-list");

    await expect(accordion).not.toHaveAttribute("open", "");
    await accordion.locator("summary").click();
    await expect(accordion).toHaveAttribute("open", "");
    await expect(tocList).toBeVisible();

    await accordion.locator("summary").click();
    await expect(accordion).not.toHaveAttribute("open", "");
  });

  test("mobile accordion contains same headings as page", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const accordion = page.locator(".toc-mobile");
    await accordion.locator("summary").click();

    const mobileTocItems = accordion.locator(".toc-item");
    await expect(mobileTocItems).not.toHaveCount(0);

    const proseHeadings = page.locator(".prose h2, .prose h3");
    const headingCount = await proseHeadings.count();
    const mobileCount = await mobileTocItems.count();
    expect(mobileCount).toBeGreaterThanOrEqual(headingCount);
  });

  test("mobile TOC not shown on home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".toc-mobile")).not.toBeAttached();
  });
});

test.describe("TOC — Tablet", () => {
  test.use({ viewport: { width: 900, height: 1024 } });

  test("right sidebar TOC visible at tablet width", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const isWideEnough = await page.evaluate(() => {
      return window.matchMedia("(min-width: 110ch)").matches;
    });
    const toc = page.locator(".sidebar-right");
    if (isWideEnough) {
      await expect(toc).toBeVisible();
      await expect(page.locator(".toc-mobile")).not.toBeVisible();
    } else {
      await expect(toc).not.toBeVisible();
      await expect(page.locator(".toc-mobile")).toBeVisible();
    }
  });
});
