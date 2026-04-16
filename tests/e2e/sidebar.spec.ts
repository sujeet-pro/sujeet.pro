import { expect } from "@playwright/test";
import { test } from "./helpers";

const SERIES_ARTICLE = "/articles/crp-rendering-pipeline-overview/";
const BLOG_LISTING = "/blogs/";

test.describe("Docs sidebar — Desktop", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("is visible on article pages", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".doc-sidebar")).toBeVisible();
    await expect(page.locator(".doc-layout")).toBeVisible();
  });

  test("shows the current article as active", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const nav = page.locator(".doc-sidebar .doc-sidebar-nav");
    await expect(nav).toBeVisible();
    await expect(nav.locator(".doc-sidebar-item.active")).not.toHaveCount(0);
  });

  test("shows the article series heading", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".doc-sidebar-heading").first()).toContainText(
      "Critical Rendering Path",
    );
  });

  test("listing pages also render the docs sidebar", async ({ page }) => {
    await page.goto(BLOG_LISTING);
    await expect(page.locator(".doc-sidebar")).toBeVisible();
    await expect(page.locator(".doc-sidebar-link")).not.toHaveCount(0);
  });

  test("clicking a sidebar link navigates to another article", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const secondLink = page
      .locator(".doc-sidebar .doc-sidebar-item:not(.active) .doc-sidebar-link")
      .first();
    const href = await secondLink.getAttribute("href");
    await secondLink.click();
    const normalizedHref = href!.replace(/\/+$/, "").replace(/\//g, "\\/");
    await expect(page).toHaveURL(new RegExp(`${normalizedHref}\\/?$`));
  });

  test("header toggle is hidden on desktop", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".doc-sidebar-toggle")).not.toBeVisible();
  });
});

test.describe("Docs sidebar modal — Tablet", () => {
  test.use({ viewport: { width: 900, height: 1024 } });

  test("toggle button is visible", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".doc-sidebar-toggle")).toBeVisible();
  });

  test("clicking the toggle opens the sidebar modal", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".doc-sidebar-toggle").click();

    const modal = page.locator(".doc-sidebar-modal");
    await expect(modal).toHaveAttribute("open", "");
    await expect(modal.locator(".doc-sidebar-nav")).toBeVisible();
  });

  test("pressing ESC closes the modal", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".doc-sidebar-toggle").click();
    await expect(page.locator(".doc-sidebar-modal")).toHaveAttribute("open", "");

    await page.keyboard.press("Escape");
    await expect(page.locator(".doc-sidebar-modal")).not.toHaveAttribute("open", "");
  });

  test("clicking the backdrop closes the modal", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".doc-sidebar-toggle").click();
    await expect(page.locator(".doc-sidebar-modal")).toHaveAttribute("open", "");

    await page.locator(".doc-sidebar-modal-backdrop").click();
    await expect(page.locator(".doc-sidebar-modal")).not.toHaveAttribute("open", "");
  });

  test("modal contains top-level navigation links", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".doc-sidebar-toggle").click();
    const navSection = page.locator(
      '.doc-sidebar-modal .doc-sidebar-section:has-text("Navigation")',
    );
    await expect(navSection).toBeVisible();
    await expect(navSection.locator("a")).toHaveCount(2);
  });
});

test.describe("Docs sidebar modal — Mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("toggle opens the mobile sidebar modal", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".doc-sidebar-toggle")).toBeVisible();
    await page.locator(".doc-sidebar-toggle").click();
    await expect(page.locator(".doc-sidebar-modal")).toHaveAttribute("open", "");
  });

  test("escape closes the mobile sidebar modal", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".doc-sidebar-toggle").click();
    await expect(page.locator(".doc-sidebar-modal")).toHaveAttribute("open", "");

    await page.keyboard.press("Escape");
    await expect(page.locator(".doc-sidebar-modal")).not.toHaveAttribute("open", "");
  });
});
