import { expect, test } from "@playwright/test";

const SERIES_ARTICLE = "/articles/crp-rendering-pipeline-overview/";

test.describe("Left sidebar — Desktop", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("visible on article pages in a series", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".sidebar-left")).toBeVisible();
    await expect(page.locator(".layout-three-col")).toBeVisible();
  });

  test("shows series articles with current highlighted", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const nav = page.locator(".sidebar-left .article-nav");
    await expect(nav).toBeVisible();

    const articles = nav.locator(".nav-articles li");
    await expect(articles).not.toHaveCount(0);

    const current = nav.locator(".nav-articles li.current");
    await expect(current).toHaveCount(1);
  });

  test("sidebar shows series name", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".sidebar-left .sidebar-title")).toContainText("CRP");
  });

  test("clicking sidebar link navigates to article", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const secondLink = page.locator(".sidebar-left .nav-articles li:not(.current) a").first();
    const href = await secondLink.getAttribute("href");
    await secondLink.click();
    await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, "\\/")));
  });

  test("hamburger is NOT visible on desktop", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".sidebar-toggle-label")).not.toBeVisible();
  });
});

test.describe("Left sidebar — not shown on non-article pages", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("home page has no sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar-left")).not.toBeAttached();
    await expect(page.locator(".sidebar-toggle-label")).not.toBeAttached();
  });

  test("articles listing has no left sidebar", async ({ page }) => {
    await page.goto("/articles/");
    await expect(page.locator(".sidebar-left")).not.toBeAttached();
    await expect(page.locator(".sidebar-toggle-label")).not.toBeAttached();
  });

  test("blogs listing has no left sidebar", async ({ page }) => {
    await page.goto("/blogs/");
    await expect(page.locator(".sidebar-left")).not.toBeAttached();
    await expect(page.locator(".sidebar-toggle-label")).not.toBeAttached();
  });

  test("404 page has no sidebar", async ({ page }) => {
    await page.goto("/nonexistent/");
    await expect(page.locator(".sidebar-left")).not.toBeAttached();
    await expect(page.locator(".sidebar-toggle-label")).not.toBeAttached();
  });
});

test.describe("Left sidebar — Tablet", () => {
  test.use({ viewport: { width: 900, height: 1024 } });

  test("left sidebar is hidden in page flow", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".sidebar-left")).not.toBeVisible();
  });

  test("hamburger button is visible", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".sidebar-toggle-label")).toBeVisible();
  });

  test("clicking hamburger opens sidebar overlay", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".sidebar-toggle-label").click();

    const sidebar = page.locator(".sidebar-left");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator(".article-nav")).toBeVisible();
  });

  test("pressing ESC closes sidebar", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".sidebar-toggle-label").click();
    await expect(page.locator(".sidebar-left")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar-left")).not.toBeVisible();
  });

  test("clicking overlay backdrop closes sidebar", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".sidebar-toggle-label").click();
    await expect(page.locator(".sidebar-left")).toBeVisible();

    const toggle = page.locator("#sidebar-toggle");
    await toggle.uncheck({ force: true });
    await expect(page.locator(".sidebar-left")).not.toBeVisible();
  });

  test("sidebar closes on resize to desktop width", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".sidebar-toggle-label").click();
    await expect(page.locator(".sidebar-left")).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator(".sidebar-left")).toBeVisible();
    await expect(page.locator(".sidebar-toggle-label")).not.toBeVisible();
  });

  test("no hamburger on pages without sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar-toggle-label")).not.toBeAttached();

    await page.goto("/articles/");
    await expect(page.locator(".sidebar-toggle-label")).not.toBeAttached();
  });
});

test.describe("Left sidebar — Mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("left sidebar hidden, hamburger visible", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".sidebar-left")).not.toBeVisible();
    await expect(page.locator(".sidebar-toggle-label")).toBeVisible();
  });

  test("hamburger opens sidebar overlay", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".sidebar-toggle-label").click();
    await expect(page.locator(".sidebar-left")).toBeVisible();
  });

  test("ESC closes mobile sidebar", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".sidebar-toggle-label").click();
    await expect(page.locator(".sidebar-left")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".sidebar-left")).not.toBeVisible();
  });

  test("no hamburger on home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar-toggle-label")).not.toBeAttached();
  });

  test("no hamburger on listing pages", async ({ page }) => {
    await page.goto("/blogs/");
    await expect(page.locator(".sidebar-toggle-label")).not.toBeAttached();
  });

  test("no hamburger on 404", async ({ page }) => {
    await page.goto("/nonexistent/");
    await expect(page.locator(".sidebar-toggle-label")).not.toBeAttached();
  });
});
