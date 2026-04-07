import { test as base } from "@playwright/test";

export const BASE_PATH = process.env.BASE_PATH ?? "";

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    page.goto = ((url: string, options?: Parameters<typeof originalGoto>[1]) => {
      if (url.startsWith("/")) {
        return originalGoto(`${BASE_PATH}${url}`, options);
      }
      return originalGoto(url, options);
    }) as typeof page.goto;
    await use(page);
  },
});
