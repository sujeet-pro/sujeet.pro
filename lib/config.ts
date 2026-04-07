import { readFileSync } from "fs";
import { join } from "path";
import JSON5 from "json5";
import {
  MetaConfigSchema,
  SiteConfigSchema,
  type MetaConfig,
  type SiteConfig,
} from "#schemas/index";

export function loadSiteConfig(contentDir: string): SiteConfig {
  const raw = readFileSync(join(contentDir, "site.json5"), "utf-8");
  const parsed = JSON5.parse(raw);
  if (process.env.BASE_PATH !== undefined) parsed.basePath = process.env.BASE_PATH;
  if (process.env.SITE_ORIGIN) parsed.origin = process.env.SITE_ORIGIN;
  return SiteConfigSchema.parse(parsed);
}

export function loadMetaConfig(dir: string): MetaConfig {
  const raw = readFileSync(join(dir, "meta.json5"), "utf-8");
  return MetaConfigSchema.parse(JSON5.parse(raw));
}

export type RedirectEntry = { from: string; to: string };
export type VanityEntry = { id: string; target: string };
export type Redirects = { vanity: VanityEntry[]; redirects: RedirectEntry[] };

export function loadRedirects(contentDir: string): Redirects {
  const raw = readFileSync(join(contentDir, "redirects.json5"), "utf-8");
  const parsed = JSON5.parse(raw) as Redirects;
  return {
    vanity: parsed.vanity ?? [],
    redirects: parsed.redirects ?? [],
  };
}
