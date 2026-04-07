import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: {
    alias: {
      "#schemas": "./schemas",
      "#lib": "./lib",
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  staged: {
    "*.{ts,tsx}": "vp check --fix",
    "*.{mermaid,excalidraw,drawio,dot,gv}": "tsx scripts/diagrams.ts",
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
});
