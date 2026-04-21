import { test as base } from "@playwright/test";
import { resolveBasePath } from "../../lib/site-config.ts";

export const BASE_PATH = resolveBasePath();

export function withBase(path: string): string {
  if (!path.startsWith("/")) {
    return path;
  }

  if (BASE_PATH && (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`))) {
    return path;
  }

  return BASE_PATH ? `${BASE_PATH}${path}` : path;
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
