import { resolve } from "node:path";
import { readJson5File } from "./read-json5.ts";
import { SiteConfigSchema, type SiteConfig } from "../schemas/site.ts";

const SITE_CONFIG_PATH = resolve(process.cwd(), "site.config.json5");

let cachedSiteConfig: SiteConfig | undefined;

export function loadSiteConfig(): SiteConfig {
  cachedSiteConfig ??= readJson5File(SITE_CONFIG_PATH, SiteConfigSchema);
  return cachedSiteConfig;
}
