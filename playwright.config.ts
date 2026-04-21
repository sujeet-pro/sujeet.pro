import { defineConfig, devices } from "@playwright/test";
import { withBasePath } from "@pagesmith/site";
import { resolveBasePath } from "./lib/site-config.ts";

const e2eBasePath = resolveBasePath();
const deployed = !!process.env.DEPLOYED_URL;
const previewPort = Number(process.env.PLAYWRIGHT_PREVIEW_PORT ?? 4173);
const previewOrigin = `http://127.0.0.1:${previewPort}`;
// `withBasePath(bp, "/")` returns the base path without a trailing slash
// (empty string when no base path is set). `vite preview` only serves the
// index at the trailing-slash form, so explicitly append `/` for the
// health-check URL and collapse any duplicated slashes.
const previewUrl = `${previewOrigin}${withBasePath(e2eBasePath, "/")}/`.replace(/\/+$/, "/");
const baseURL = process.env.DEPLOYED_URL || previewOrigin;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI runners (ubuntu-latest) have 4 vCPUs; `undefined` lets Playwright use
  // half by default and keeps the three device projects parallelised.
  workers: process.env.CI ? "50%" : undefined,
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
