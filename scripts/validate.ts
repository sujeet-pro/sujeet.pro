import { loadProfileContentModel } from "@pagesmith/presets/profile";
import { collectCrossReferenceErrors } from "../lib/cross-references.ts";
import { loadDiagramkitConfig } from "../lib/diagramkit-config.ts";
import { loadSiteConfig, resolveBasePath } from "../lib/site-config.ts";

loadDiagramkitConfig();

const errors: string[] = [];
const siteConfig = loadSiteConfig();
try {
  const model = await loadProfileContentModel({
    siteConfig: siteConfig as Record<string, unknown>,
    contentDir: siteConfig.contentDir,
    dataDir: siteConfig.dataDir,
  });
  for (const entry of model.index.entries) await entry.renderedContent();
} catch (error) {
  errors.push(
    `Profile content model failed validation: ${error instanceof Error ? error.message : String(error)}`,
  );
}

const basePath = resolveBasePath();
errors.push(...(await collectCrossReferenceErrors(basePath)).errors);

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  "Validation: site config, diagramkit config, content schemas, and cross-file references look good.",
);
