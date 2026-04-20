import { expect } from "@playwright/test";
import { test, withBase } from "./helpers";

const SERIES_ARTICLE = "/articles/crp-rendering-pipeline-overview/";
const BLOG_SLUG = "/blogs/chrome-developer-setup/";

test.describe("Home page", () => {
  test("renders hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".site-hero")).toBeVisible();
    await expect(page.locator(".site-hero-name")).toHaveText("Sujeet Jaiswal");
    await expect(page.locator(".site-hero-tagline")).toHaveText("Principal Software Engineer");
    await expect(page.locator(".site-hero-description")).toBeVisible();
  });

  test("shows action links", async ({ page }) => {
    await page.goto("/");
    const actions = page.locator(".site-actions .site-action");
    await expect(actions).not.toHaveCount(0);
    await expect(actions.filter({ hasText: "Browse Articles" })).toBeVisible();
    await expect(actions.filter({ hasText: "Read Blogs" })).toBeVisible();
  });

  test("shows featured series cards", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".site-home-series-card");
    await expect(cards).not.toHaveCount(0);
    await expect(cards.first()).toBeVisible();
  });

  test("series cards link to articles listing anchors", async ({ page }) => {
    await page.goto("/");
    const firstCard = page.locator(".site-home-series-card").first();
    const href = await firstCard.getAttribute("href");
    // The site is built with `trailingSlash: false`, so series anchor links
    // are emitted as `/articles#<series-slug>` (no trailing slash before the
    // `#`). Match either form to stay tolerant of future config changes.
    expect(href).toMatch(/\/articles\/?#/);
  });

  test("shows featured articles", async ({ page }) => {
    await page.goto("/");
    const items = page.locator(".site-home-featured-item");
    await expect(items).not.toHaveCount(0);
    await expect(items.first()).toBeVisible();
  });

  test("featured article links navigate to article pages", async ({ page }) => {
    await page.goto("/");
    const firstLink = page.locator(".site-home-featured-link").first();
    const href = await firstLink.getAttribute("href");
    expect(href).toMatch(/\/articles\//);
  });
});

test.describe("Articles listing", () => {
  test("shows page heading", async ({ page }) => {
    await page.goto("/articles/");
    const heading = page.locator(".site-section-intro h1");
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Articles");
  });

  test("shows listing stats", async ({ page }) => {
    await page.goto("/articles/");
    await expect(page.locator(".site-listing-stats")).toBeVisible();
  });

  test("shows series categories with article cards", async ({ page }) => {
    await page.goto("/articles/");
    const sections = page.locator(".site-section-group");
    await expect(sections).not.toHaveCount(0);
    await expect(sections.first().locator("h2")).toBeVisible();

    const cards = sections.first().locator(".site-card");
    await expect(cards).not.toHaveCount(0);
  });

  test("article cards have title and description", async ({ page }) => {
    await page.goto("/articles/");
    const firstCard = page.locator(".site-card").first();
    await expect(firstCard.locator(".site-card-title")).toBeVisible();
    await expect(firstCard.locator(".site-card-desc")).toBeVisible();
  });
});

test.describe("Article page", () => {
  test("renders content with headings", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".prose")).toBeVisible();
    const headings = page.locator(".prose h2, .prose h3");
    await expect(headings).not.toHaveCount(0);
  });

  test("shows breadcrumbs and content metadata", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    await expect(page.locator(".doc-breadcrumbs")).toBeVisible();
    await expect(page.locator(".site-content-meta")).toBeVisible();
  });

  test("breadcrumbs contain link back to articles", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    // Series articles render multiple breadcrumb links to the same
    // `/articles` route (one for the section, one for the series). Match by
    // accessible name so we target the section breadcrumb specifically.
    const articlesLink = page
      .locator(".doc-breadcrumbs a", { hasText: "Articles" })
      .filter({ hasNot: page.locator("text=Series") });
    await expect(articlesLink.first()).toBeVisible();
    await expect(articlesLink.first()).toHaveAttribute("href", withBase("/articles"));
  });
});

test.describe("Blogs listing", () => {
  test("shows page heading", async ({ page }) => {
    await page.goto("/blogs/");
    const heading = page.locator(".site-section-intro h1");
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Blogs");
  });

  test("shows listing stats", async ({ page }) => {
    await page.goto("/blogs/");
    await expect(page.locator(".site-listing-stats")).toBeVisible();
  });

  test("shows blog entries", async ({ page }) => {
    await page.goto("/blogs/");
    const cards = page.locator(".site-card");
    await expect(cards).not.toHaveCount(0);
  });
});

test.describe("Blog page", () => {
  test("renders content", async ({ page }) => {
    await page.goto(BLOG_SLUG);
    await expect(page.locator(".prose")).toBeVisible();
    await expect(page.locator(".site-content-meta")).toBeVisible();
  });

  test("shows breadcrumbs", async ({ page }) => {
    await page.goto(BLOG_SLUG);
    await expect(page.locator(".doc-breadcrumbs")).toBeVisible();
  });
});

test.describe("404 page", () => {
  test("renders for unknown routes", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist/");
    if (!process.env.DEPLOYED_URL) {
      expect(response?.status()).toBe(404);
    }
    await expect(page.locator(".site-not-found")).toBeVisible();
    await expect(page.locator(".site-not-found-code")).toHaveText("404");
    await expect(page.locator(".site-not-found h1")).toHaveText("Page Not Found");
  });

  test("has a home action", async ({ page }) => {
    await page.goto("/this-page-does-not-exist/");
    await expect(page.locator(".site-action-primary")).toHaveAttribute(
      "href",
      /\/v5\.sujeet\.pro\/?$/,
    );
  });
});

test.describe("Header navigation", () => {
  test("logo links to home", async ({ page }) => {
    await page.goto("/articles/");
    const logo = page.locator(".doc-logo");
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("href", /\/v5\.sujeet\.pro\/?$/);
  });

  test("nav links are present and work", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator(".doc-nav");
    await expect(nav.locator("a")).toHaveCount(2);

    await expect(nav.locator(`a[href="${withBase("/articles")}"]`)).toHaveText("Articles");
    await expect(nav.locator(`a[href="${withBase("/blogs")}"]`)).toHaveText("Blogs");
    await expect(page.locator("pagefind-modal-trigger.doc-search-trigger")).toBeVisible();
  });

  test("clicking Blogs nav goes to blogs listing", async ({ page }) => {
    await page.goto("/");
    const navLink = page.locator(`.doc-nav a[href="${withBase("/blogs")}"]`);
    if (await navLink.isVisible()) {
      await navLink.click();
    } else {
      await page.locator(".doc-sidebar-toggle").click();
      await page
        .locator('.doc-sidebar-modal .doc-sidebar-section:has-text("Navigation") a', {
          hasText: "Blogs",
        })
        .click();
    }
    await expect(page).toHaveURL(/\/blogs\/?$/);
  });

  test("active nav link is highlighted", async ({ page }) => {
    await page.goto("/articles/");
    await expect(page.locator(`.doc-nav a[href="${withBase("/articles")}"]`)).toHaveClass(/active/);
  });
});

test.describe("Footer", () => {
  test("footer links are present", async ({ page }) => {
    await page.goto("/");
    const footerLinks = page.locator(".doc-footer-links a");
    await expect(footerLinks).not.toHaveCount(0);
    await expect(footerLinks.filter({ hasText: "Articles" })).toBeVisible();
    await expect(footerLinks.filter({ hasText: "Blogs" })).toBeVisible();
  });

  test("profile links are present", async ({ page }) => {
    await page.goto("/");
    const profileLinks = page.locator('.doc-footer-link-group:has-text("Profiles") a');
    await expect(profileLinks).toHaveCount(3);
    await expect(profileLinks.filter({ hasText: "GitHub" })).toBeVisible();
    await expect(profileLinks.filter({ hasText: "LinkedIn" })).toBeVisible();
    await expect(profileLinks.filter({ hasText: "Twitter" })).toBeVisible();
  });

  test("copyright is shown", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".doc-footer-copyright")).toContainText("Sujeet Jaiswal");
  });
});

test.describe("Redirects", () => {
  test("vanity URLs redirect via meta refresh", async ({ page }) => {
    await page.goto("/gh/");
    await expect(page).not.toHaveURL(/\/gh\/?$/);
  });
});

test.describe("SEO", () => {
  test("home page has required meta tags", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /Sujeet Jaiswal/,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /.+/);
  });

  test("article page has title and description meta", async ({ page }) => {
    await page.goto(SERIES_ARTICLE);
    // `<title>` lives in `<head>` and Playwright's text matchers ignore
    // non-visible nodes — use the dedicated `toHaveTitle` matcher instead.
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", /.+/);
  });
});

test.describe("Accessibility", () => {
  test("skip link is present and targets main content", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator(".doc-skip-link");
    await expect(skipLink).toHaveAttribute("href", "#doc-main-content");
    await expect(page.locator("#doc-main-content")).toBeAttached();
  });

  test("navigation has aria-label", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".doc-nav")).toHaveAttribute("aria-label", /navigation/i);
  });
});
