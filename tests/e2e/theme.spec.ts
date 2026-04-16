import { expect } from "@playwright/test";
import { test } from "./helpers";

const STORAGE_KEY = "pagesmith-theme";
const SERIES_ARTICLE = "/articles/crp-rendering-pipeline-overview/";

test.describe("Theme — defaults", () => {
  test("default classes use auto color scheme and paper theme", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/color-scheme-auto/);
    await expect(page.locator("html")).toHaveClass(/theme-paper/);
  });
});

test.describe("Theme — header controls", () => {
  test("dropdown opens and theme selections update html classes", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator("[data-theme-toggle-btn]");
    const dropdown = page.locator("[data-theme-dropdown]");

    await expect(dropdown).toBeHidden();
    await toggle.click();
    await expect(dropdown).toBeVisible();

    await page.locator('[data-theme-dropdown] input[name="colorScheme"][value="light"]').check({
      force: true,
    });
    await expect(page.locator("html")).toHaveClass(/color-scheme-light/);

    await page.locator('[data-theme-dropdown] input[name="theme"][value="high-contrast"]').check({
      force: true,
    });
    await expect(page.locator("html")).toHaveClass(/theme-high-contrast/);

    await page.locator('[data-theme-dropdown] input[name="textSize"][value="large"]').check({
      force: true,
    });
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  });
});

test.describe("Theme — persistence", () => {
  test("preferences persist in localStorage as a JSON payload", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-footer-scheme] button[data-scheme='dark']").click();
    await page.locator("[data-footer-theme-type] button[data-theme='high-contrast']").click();
    await page.locator("[data-footer-text-size] button[data-size='large']").click();

    const stored = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, STORAGE_KEY);

    expect(stored).toEqual({
      colorScheme: "dark",
      theme: "high-contrast",
      textSize: "large",
    });
  });

  test("stored preferences survive navigation and reload", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-footer-scheme] button[data-scheme='dark']").click();
    await page.locator("[data-footer-theme-type] button[data-theme='high-contrast']").click();

    await page.goto("/articles/");
    await expect(page.locator("html")).toHaveClass(/color-scheme-dark/);
    await expect(page.locator("html")).toHaveClass(/theme-high-contrast/);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/color-scheme-dark/);
    await expect(page.locator("html")).toHaveClass(/theme-high-contrast/);
  });

  test("stored preferences are applied before reload completes", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          colorScheme: "light",
          theme: "high-contrast",
          textSize: "small",
        }),
      );
    }, STORAGE_KEY);
    await page.reload();

    await expect(page.locator("html")).toHaveClass(/color-scheme-light/);
    await expect(page.locator("html")).toHaveClass(/theme-high-contrast/);
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "small");
  });
});

test.describe("Theme — footer controls", () => {
  test("footer buttons update color scheme, theme, and text size", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-footer-scheme] button[data-scheme='dark']").click();
    await expect(page.locator("html")).toHaveClass(/color-scheme-dark/);

    await page.locator("[data-footer-theme-type] button[data-theme='high-contrast']").click();
    await expect(page.locator("html")).toHaveClass(/theme-high-contrast/);

    await page.locator("[data-footer-text-size] button[data-size='large']").click();
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
  });
});

test.describe("Theme — content runtime", () => {
  test("code blocks render copy buttons from the core runtime", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const copyButton = page.locator("[data-ps-code-copy='true']").first();
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await expect(copyButton).toHaveAttribute("data-copy-state", /success|error/);
  });
});
