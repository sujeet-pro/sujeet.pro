import { defineConfig, devices } from '@playwright/test';

const PORT = 4322;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Stage 5.3 — E2E against the production build (`dist/`), never `astro dev`.
 * Build first: `npm run build && npm run test:e2e`.
 *
 * webServer: Astro 7.4 auto-backgrounds `astro preview` when it detects a coding agent and refuses to
 * start when another preview holds the lock file. `--ignore-lock` forces a one-off foreground server
 * (see node_modules/astro/dist/cli/preview/index.js: agent auto-background yields to --ignore-lock),
 * which is what Playwright needs to own and stop the process. Same command in CI and locally.
 */
export default defineConfig({
  testDir: '.',
  testMatch: ['tests/e2e/**/*.spec.ts', 'src/articles/*/tests/*.e2e.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx astro preview --port ${PORT} --ignore-lock`,
    url: `${BASE_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
