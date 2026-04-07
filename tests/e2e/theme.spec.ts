import { expect } from "@playwright/test";
import { test } from "./helpers";

const STORAGE_KEY = "pagesmith-theme";
const VARIANT_KEY = "pagesmith-variant";
const SERIES_ARTICLE = "/articles/crp-rendering-pipeline-overview/";

test.describe("Theme — defaults", () => {
  test("default theme is auto (no data-theme attribute)", async ({ page }) => {
    await page.goto("/");
    const dataTheme = await page.locator("html").getAttribute("data-theme");
    expect(dataTheme).toBeNull();
  });

  test("auto radio is checked by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#theme-auto")).toBeChecked();
    await expect(page.locator("#theme-light")).not.toBeChecked();
    await expect(page.locator("#theme-dark")).not.toBeChecked();
  });
});

test.describe("Theme — toggle cycling", () => {
  test("auto → light → dark → auto", async ({ page }) => {
    await page.goto("/");

    // auto state: "to-light" label visible (clicking switches to light)
    const toLightBtn = page.locator(".theme-toggle-to-light");
    await expect(toLightBtn).toBeVisible();
    await toLightBtn.click();

    // now light: data-theme="light", "to-dark" label visible
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("#theme-light")).toBeChecked();

    const toDarkBtn = page.locator(".theme-toggle-to-dark");
    await expect(toDarkBtn).toBeVisible();
    await toDarkBtn.click();

    // now dark: data-theme="dark", "to-auto" label visible
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#theme-dark")).toBeChecked();

    const toAutoBtn = page.locator(".theme-toggle-to-auto");
    await expect(toAutoBtn).toBeVisible();
    await toAutoBtn.click();

    // back to auto: no data-theme
    const dataTheme = await page.locator("html").getAttribute("data-theme");
    expect(dataTheme).toBeNull();
    await expect(page.locator("#theme-auto")).toBeChecked();
  });
});

test.describe("Theme — persistence", () => {
  test("theme persists in localStorage", async ({ page }) => {
    await page.goto("/");

    await page.locator(".theme-toggle-to-light").click();
    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).toBe("light");

    await page.locator(".theme-toggle-to-dark").click();
    const storedDark = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(storedDark).toBe("dark");
  });

  test("theme survives page navigation", async ({ page }) => {
    await page.goto("/");
    await page.locator(".theme-toggle-to-light").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.goto("/articles/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("#theme-light")).toBeChecked();
  });

  test("stored theme applied on fresh page load", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => localStorage.setItem(key, "dark"), STORAGE_KEY);
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#theme-dark")).toBeChecked();
  });
});

test.describe("Theme — CSS variables", () => {
  test("light theme uses light background", async ({ page }) => {
    await page.goto("/");
    await page.locator(".theme-toggle-to-light").click();

    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
    );
    expect(bg).toMatch(/^#fff(fff)?$/);
  });

  test("dark theme uses dark background", async ({ page }) => {
    await page.goto("/");
    await page.locator(".theme-toggle-to-light").click();
    await page.locator(".theme-toggle-to-dark").click();

    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
    );
    expect(bg).toMatch(/^#111(111)?$/);
  });

  test("dark theme changes text color", async ({ page }) => {
    await page.goto("/");
    await page.locator(".theme-toggle-to-light").click();
    await page.locator(".theme-toggle-to-dark").click();

    const text = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-text").trim(),
    );
    expect(text).toMatch(/^#e5e5e5$/);
  });
});

test.describe("Theme — code blocks", () => {
  test("code uses light shiki vars in light mode", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await page.locator(".theme-toggle-to-light").click();

    const codeBlock = page.locator(".shiki").first();
    if ((await codeBlock.count()) === 0) return;

    const color = await codeBlock.evaluate((el) => getComputedStyle(el).getPropertyValue("color"));
    const bgColor = await codeBlock.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("background-color"),
    );
    expect(color).toBeTruthy();
    expect(bgColor).toBeTruthy();
  });

  test("code theme changes in dark mode", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const codeBlock = page.locator(".shiki").first();
    if ((await codeBlock.count()) === 0) return;

    await page.locator(".theme-toggle-to-light").click();
    const lightBg = await codeBlock.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("background-color"),
    );

    await page.locator(".theme-toggle-to-dark").click();
    const darkBg = await codeBlock.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("background-color"),
    );

    expect(lightBg).not.toBe(darkBg);
  });
});

test.describe("Theme — footer dropdown", () => {
  test("dropdown opens and closes on button click", async ({ page }) => {
    await page.goto("/");
    const btn = page.locator(".footer-theme-btn");
    const dropdown = page.locator(".footer-theme-dropdown");

    await expect(dropdown).toHaveClass(/closed/);
    await btn.click();
    await expect(dropdown).not.toHaveClass(/closed/);
    await btn.click();
    await expect(dropdown).toHaveClass(/closed/);
  });

  test("dropdown closes on outside click", async ({ page }) => {
    await page.goto("/");
    await page.locator(".footer-theme-btn").click();
    const dropdown = page.locator(".footer-theme-dropdown");
    await expect(dropdown).not.toHaveClass(/closed/);

    await page.locator("body").click({ position: { x: 10, y: 10 } });
    await expect(dropdown).toHaveClass(/closed/);
  });

  test("dropdown closes on Escape", async ({ page }) => {
    await page.goto("/");
    await page.locator(".footer-theme-btn").click();
    const dropdown = page.locator(".footer-theme-dropdown");
    await expect(dropdown).not.toHaveClass(/closed/);

    await page.keyboard.press("Escape");
    await expect(dropdown).toHaveClass(/closed/);
  });
});

test.describe("Theme — variants", () => {
  test("selecting reader variant sets data-variant attribute", async ({ page }) => {
    await page.goto("/");
    await page.locator(".footer-theme-btn").click();
    await page.locator('input[name="footer-variant"][value="reader"]').check({ force: true });

    await expect(page.locator("html")).toHaveAttribute("data-variant", "reader");
  });

  test("selecting contrast variant sets data-variant attribute", async ({ page }) => {
    await page.goto("/");
    await page.locator(".footer-theme-btn").click();
    await page.locator('input[name="footer-variant"][value="contrast"]').check({ force: true });

    await expect(page.locator("html")).toHaveAttribute("data-variant", "contrast");
  });

  test("selecting regular variant removes data-variant attribute", async ({ page }) => {
    await page.goto("/");
    await page.locator(".footer-theme-btn").click();
    await page.locator('input[name="footer-variant"][value="reader"]').check({ force: true });
    await expect(page.locator("html")).toHaveAttribute("data-variant", "reader");

    await page.locator('input[name="footer-variant"][value="regular"]').check({ force: true });
    const attr = await page.locator("html").getAttribute("data-variant");
    expect(attr).toBeNull();
  });

  test("variant persists in localStorage", async ({ page }) => {
    await page.goto("/");
    await page.locator(".footer-theme-btn").click();
    await page.locator('input[name="footer-variant"][value="contrast"]').check({ force: true });

    const stored = await page.evaluate((key) => localStorage.getItem(key), VARIANT_KEY);
    expect(stored).toBe("contrast");
  });

  test("variant survives page navigation", async ({ page }) => {
    await page.goto("/");
    await page.locator(".footer-theme-btn").click();
    await page.locator('input[name="footer-variant"][value="reader"]').check({ force: true });
    await expect(page.locator("html")).toHaveAttribute("data-variant", "reader");

    await page.goto("/articles/");
    await expect(page.locator("html")).toHaveAttribute("data-variant", "reader");
  });

  test("stored variant applied on fresh page load (FOUC prevention)", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((key) => localStorage.setItem(key, "contrast"), VARIANT_KEY);
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-variant", "contrast");
  });

  test("reader variant changes background color", async ({ page }) => {
    await page.goto("/");
    await page.locator(".theme-toggle-to-light").click();
    await page.locator(".footer-theme-btn").click();
    await page.locator('input[name="footer-variant"][value="reader"]').check({ force: true });

    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
    );
    expect(bg).toBe("#faf5eb");
  });

  test("contrast variant with dark mode", async ({ page }) => {
    await page.goto("/");
    await page.locator(".theme-toggle-to-light").click();
    await page.locator(".theme-toggle-to-dark").click();
    await page.locator(".footer-theme-btn").click();
    await page.locator('input[name="footer-variant"][value="contrast"]').check({ force: true });

    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
    );
    expect(bg).toBe("#0a0a0a");
  });

  test("footer mode radio syncs with header toggle", async ({ page }) => {
    await page.goto("/");
    await page.locator(".theme-toggle-to-light").click();

    await page.locator(".footer-theme-btn").click();
    const lightRadio = page.locator('input[name="footer-mode"][value="light"]');
    await expect(lightRadio).toBeChecked();
  });
});
