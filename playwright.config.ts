import { defineConfig, devices } from "@playwright/test";
import { normalizeBasePath, withBasePath } from "@pagesmith/site";
import { loadSiteConfig } from "./lib/site-config.ts";

const siteConfig = loadSiteConfig();
const e2eBasePath = normalizeBasePath(process.env.BASE_PATH ?? siteConfig.basePath);
const deployed = !!process.env.DEPLOYED_URL;
const previewPort = Number(process.env.PLAYWRIGHT_PREVIEW_PORT ?? 4173);
const previewOrigin = `http://127.0.0.1:${previewPort}`;
const previewUrl = `${previewOrigin}${withBasePath(e2eBasePath, "/")}`;
const baseURL = process.env.DEPLOYED_URL || previewOrigin;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: deployed ? 60_000 : 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { viewport: { width: 900, height: 1024 } } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  ...(!deployed && {
    webServer: {
      command: `npm run preview -- --host 127.0.0.1 --port ${previewPort} --strictPort`,
      url: previewUrl,
      reuseExistingServer: false,
    },
  }),
});
