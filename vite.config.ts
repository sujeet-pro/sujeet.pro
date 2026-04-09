import { resolve } from "node:path";
import { defineConfig } from "vite-plus";
import { pagesmithSsg, sharedAssetsPlugin } from "@pagesmith/core/vite";

const root = import.meta.dirname;

export default defineConfig({
  base: process.env.BASE_PATH || "/v5.sujeet.pro",
  plugins: [
    sharedAssetsPlugin(),
    ...pagesmithSsg({ entry: "./entry-server.tsx", contentDirs: ["./content"] }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "@pagesmith/core",
    },
  },
  resolve: {
    alias: {
      "#schemas": resolve(root, "schemas"),
      "#lib": resolve(root, "lib"),
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
