import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeBasePath } from "@pagesmith/site";
import { readJson5File } from "./read-json5.ts";
import { SiteConfigSchema, type SiteConfig } from "../schemas/site.ts";

const PRESET_CONFIG_PATH = resolve(process.cwd(), "pagesmith.config.json5");
const LEGACY_SITE_CONFIG_PATH = resolve(process.cwd(), "site.config.json5");
const BASE_PATH_ENV = "BASE_PATH";

let cachedSiteConfig: SiteConfig | undefined;

export function loadSiteConfig(): SiteConfig {
  const path = existsSync(PRESET_CONFIG_PATH) ? PRESET_CONFIG_PATH : LEGACY_SITE_CONFIG_PATH;
  cachedSiteConfig ??= readJson5File(path, SiteConfigSchema);
  return cachedSiteConfig;
}

/**
 * Single source of truth for the runtime base path. Resolution order:
 *
 *   1. `BASE_PATH` env variable (so CI, tests, and preview runs can override
 *      without touching `site.config.json5`)
 *   2. `pagesmith.config.json5#basePath`
 *   3. `""` (the schema default — apex hosting with no subpath)
 */
export function resolveBasePath(): string {
  const override = process.env[BASE_PATH_ENV];
  if (override !== undefined) {
    return normalizeBasePath(override);
  }
  return normalizeBasePath(loadSiteConfig().basePath);
}
