import { defineConfig, devices } from "@playwright/test";

const deployed = !!process.env.DEPLOYED_URL;
const baseURL = process.env.DEPLOYED_URL || "http://localhost:4000";

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
      command: "tsx scripts/preview.ts",
      url: "http://localhost:4000",
      reuseExistingServer: !process.env.CI,
    },
  }),
});
