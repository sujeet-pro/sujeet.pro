import { renderAll, dispose, watchDiagrams, type BatchOptions } from "diagramkit";

function parseArgs(): BatchOptions & { watch: boolean } {
  const args = process.argv.slice(2);
  const opts: BatchOptions & { watch: boolean } = {
    dir: "./content",
    formats: ["svg"],
    theme: "both",
    watch: false,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--watch") opts.watch = true;
    else if (args[i] === "--force") opts.force = true;
    else if (args[i] === "--type" && args[i + 1]) {
      const t = args[++i];
      if (t !== "mermaid" && t !== "excalidraw") {
        console.error(`Unknown type: ${t}. Use 'mermaid' or 'excalidraw'.`);
        process.exit(1);
      }
      opts.type = t as "mermaid" | "excalidraw";
    }
  }

  return opts;
}

const opts = parseArgs();
const start = performance.now();

const result = await renderAll(opts);
const elapsed = ((performance.now() - start) / 1000).toFixed(2);
console.log(
  `Diagrams: ${result.rendered.length} rendered, ${result.skipped.length} cached (${elapsed}s)`,
);

if (opts.watch) {
  console.log("Watching for diagram changes...");
  watchDiagrams({ dir: opts.dir! });
} else {
  await dispose();
}
