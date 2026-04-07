import { expect, test } from "@playwright/test";

const SERIES_ARTICLE = "/articles/crp-rendering-pipeline-overview/";
const BLOG_SLUG = "/blogs/chrome-developer-setup/";

test.describe("Home page", () => {
  test("renders profile section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".home-profile")).toBeVisible();
    await expect(page.locator(".home-name")).toHaveText("Sujeet Jaiswal");
    await expect(page.locator(".home-title")).toHaveText("Principal Software Engineer");
  });

  test("shows featured series cards", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".home-series-card");
    await expect(cards).not.toHaveCount(0);
    await expect(cards.first()).toBeVisible();
  });

  test("shows featured articles", async ({ page }) => {
    await page.goto("/");
    const items = page.locator(".home-featured-item");
    await expect(items).not.toHaveCount(0);
    await expect(items.first()).toBeVisible();
  });
});

test.describe("Articles listing", () => {
  test("shows series categories", async ({ page }) => {
    await page.goto("/articles/");
    await expect(page.locator("h1")).toBeVisible();
    const sections = page.locator(".category-section");
    await expect(sections).not.toHaveCount(0);
    await expect(sections.first().locator("h2")).toBeVisible();
  });

  test("category sections contain article cards", async ({ page }) => {
    await page.goto("/articles/");
    const firstSection = page.locator(".category-section").first();
    const cards = firstSection.locator(".article-card");
    await expect(cards).not.toHaveCount(0);
  });
});

test.describe("Article page", () => {
  test("renders content with headings", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".prose")).toBeVisible();
    const headings = page.locator(".prose h2, .prose h3");
    await expect(headings).not.toHaveCount(0);
  });

  test("shows back link to articles", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    const back = page.locator(".article-back");
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/articles");
  });

  test("shows series block for series articles", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".series-block")).toBeVisible();
  });
});

test.describe("Blogs listing", () => {
  test("shows blog entries", async ({ page }) => {
    await page.goto("/blogs/");
    await expect(page.locator("h1")).toBeVisible();
    const cards = page.locator(".article-card");
    await expect(cards).not.toHaveCount(0);
  });
});

test.describe("Blog page", () => {
  test("renders content", async ({ page }) => {
    await page.goto(BLOG_SLUG);
    await expect(page.locator(".prose")).toBeVisible();
  });
});

test.describe("Tags", () => {
  test("tag index shows tag cloud", async ({ page }) => {
    await page.goto("/tags/");
    await expect(page.locator("h1")).toBeVisible();
    const tags = page.locator(".tag-item");
    await expect(tags).not.toHaveCount(0);
  });

  test("clicking a tag navigates to tag page", async ({ page }) => {
    await page.goto("/tags/");
    const firstTag = page.locator(".tag-link").first();
    const tagHref = await firstTag.getAttribute("href");
    await firstTag.click();
    await expect(page).toHaveURL(new RegExp(`${tagHref!.replace(/\//g, "\\/")}/?$`));
    await expect(page.locator("h1")).toContainText("Tag:");
  });

  test("tag page lists tagged articles", async ({ page }) => {
    await page.goto("/tags/");
    const firstTagLink = page.locator(".tag-link").first();
    await firstTagLink.click();
    const articles = page.locator(".article-card");
    await expect(articles).not.toHaveCount(0);
  });
});

test.describe("404 page", () => {
  test("renders for unknown routes", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist/");
    expect(response?.status()).toBe(404);
    await expect(page.locator(".not-found")).toBeVisible();
    await expect(page.locator(".not-found-code")).toHaveText("404");
    await expect(page.locator(".not-found-title")).toHaveText("Page Not Found");
  });

  test("has navigation actions", async ({ page }) => {
    await page.goto("/this-page-does-not-exist/");
    await expect(page.locator(".not-found-btn-primary")).toHaveAttribute("href", "/articles");
    await expect(page.locator(".not-found-btn-outline")).toHaveAttribute("href", "/");
  });
});

test.describe("Header navigation", () => {
  test("logo links to home", async ({ page }) => {
    await page.goto("/articles/");
    const logo = page.locator(".site-logo");
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("href", "/");
  });

  test("nav links are present and work", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator(".site-nav");
    await expect(nav.locator("a")).toHaveCount(3);

    await expect(nav.locator('a[href="/articles"]')).toHaveText("Articles");
    await expect(nav.locator('a[href="/blogs"]')).toHaveText("Blogs");
    await expect(nav.locator('a[href="/projects"]')).toHaveText("Projects");
  });

  test("clicking Articles nav goes to articles listing", async ({ page }) => {
    await page.goto("/");
    await page.locator('.site-nav a[href="/articles"]').click();
    await expect(page).toHaveURL(/\/articles\/?$/);
  });

  test("active nav link is highlighted", async ({ page }) => {
    await page.goto("/articles/");
    await expect(page.locator('.site-nav a[href="/articles"]')).toHaveClass(/active/);
  });
});

test.describe("Footer", () => {
  test("footer links are present", async ({ page }) => {
    await page.goto("/");
    const footerLinks = page.locator(".footer-links a");
    await expect(footerLinks).not.toHaveCount(0);
    await expect(footerLinks.filter({ hasText: "Resume" })).toBeVisible();
    await expect(footerLinks.filter({ hasText: "Tags" })).toBeVisible();
  });

  test("social links are present", async ({ page }) => {
    await page.goto("/");
    const social = page.locator(".footer-social a");
    await expect(social).toHaveCount(3);
    await expect(social.locator('[aria-label="GitHub"]')).toBeVisible();
    await expect(social.locator('[aria-label="LinkedIn"]')).toBeVisible();
    await expect(social.locator('[aria-label="Twitter"]')).toBeVisible();
  });

  test("copyright is shown", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".footer-copyright")).toContainText("Sujeet Jaiswal");
  });
});
