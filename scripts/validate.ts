import { createContentLayer } from "@pagesmith/site";
import { contentLayerConfig } from "../content.config.ts";
import { collectCrossReferenceErrors } from "../lib/cross-references.ts";
import { loadDiagramkitConfig } from "../lib/diagramkit-config.ts";
import { resolveBasePath } from "../lib/site-config.ts";

loadDiagramkitConfig();

const layer = createContentLayer(contentLayerConfig);
const errors: string[] = [];
const markdownCollections = new Set(["homePage", "articleIndex", "blogIndex", "articles", "blogs"]);

for (const collectionName of Object.keys(contentLayerConfig.collections)) {
  try {
    const entries = await layer.getCollection(
      collectionName as keyof typeof contentLayerConfig.collections,
    );
    if (markdownCollections.has(collectionName)) {
      for (const entry of entries) {
        await entry.render();
      }
    }
  } catch (error) {
    errors.push(
      `Collection "${collectionName}" failed validation: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const basePath = resolveBasePath();
errors.push(...collectCrossReferenceErrors(basePath).errors);

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
