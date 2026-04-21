import { pagesmithContent, pagesmithSsg, sharedAssetsPlugin } from "@pagesmith/site/vite";
import { defineConfig } from "vite-plus";
import collections, { pagesmithMarkdown } from "./content.config.ts";
import { loadSiteConfig, resolveBasePath } from "./lib/site-config.ts";

const siteConfig = loadSiteConfig();
const basePath = resolveBasePath();

export default defineConfig({
  base: basePath ? `${basePath}/` : "/",
  plugins: [
    sharedAssetsPlugin(),
    pagesmithContent({
      collections,
      markdown: pagesmithMarkdown,
      contentRoot: "content",
      dts: false,
    }),
    ...pagesmithSsg({
      entry: "./src/entry-server.tsx",
      contentDirs: ["./content"],
      cssEntry: "./src/theme.css",
      pagefind: siteConfig.search.enabled,
      trailingSlash: siteConfig.trailingSlash ?? false,
    }),
  ],
  server: {
    port: siteConfig.server.devPort,
  },
  preview: {
    port: siteConfig.server.previewPort,
  },
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "@pagesmith/site",
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
