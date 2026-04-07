import { renderSite } from "#lib/renderer";

const start = performance.now();
await renderSite({
  outDir: "./dist",
  contentDir: "./content",
  layoutsDir: "./layouts",
  publicDir: "./public",
});
const elapsed = ((performance.now() - start) / 1000).toFixed(2);
console.log(`Build complete in ${elapsed}s`);
