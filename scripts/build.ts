import { build } from "vite";

const start = performance.now();
await build();
const elapsed = ((performance.now() - start) / 1000).toFixed(2);
console.log(`Build complete in ${elapsed}s`);
