import { defineConfig, devices } from "@playwright/test";

const deployedUrl = process.env.DEPLOYED_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: deployedUrl || "http://localhost:4000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { viewport: { width: 900, height: 1024 } } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  ...(!deployedUrl && {
    webServer: {
      command: "tsx scripts/preview.ts",
      url: "http://localhost:4000",
      reuseExistingServer: !process.env.CI,
    },
  }),
});
