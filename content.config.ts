import {
  defineCollection,
  defineCollections,
  defineConfig,
  type Loader,
  type LoaderResult,
} from "@pagesmith/site";
import JSON5 from "json5";
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import {
  ArticleFrontmatterSchema,
  BlogFrontmatterSchema,
  HomeFrontmatterSchema,
  ListingFrontmatterSchema,
} from "./schemas/frontmatter.ts";
import {
  HomeDataSchema,
  RedirectConfigSchema,
  RootMetaSchema,
  SectionMetaSchema,
} from "./schemas/content-data.ts";

const Json5Loader: Loader = {
  name: "repo-json5",
  kind: "data",
  extensions: [".json5"],
  async load(filePath) {
    return JSON5.parse(readFileSync(filePath, "utf-8")) as LoaderResult;
  },
};

function slugifyFolderReadme(filePath: string): string {
  return basename(dirname(filePath));
}

export const pagesmithMarkdown = {
  shiki: {
    themes: {
      light: "github-light",
      dark: "github-dark",
    },
    defaultShowLineNumbers: true,
    langAlias: {
      redis: "bash",
      vcl: "nginx",
      promql: "plaintext",
      logql: "plaintext",
      bind: "nginx",
      dns: "ini",
      cql: "sql",
      properties: "ini",
      m3u8: "bash",
      asciidoc: "markdown",
    },
  },
} as const;

export const collections = defineCollections({
  homePage: defineCollection({
    loader: "markdown",
    directory: "content",
    include: ["README.md"],
    schema: HomeFrontmatterSchema,
  }),
  articleIndex: defineCollection({
    loader: "markdown",
    directory: "content/articles",
    include: ["README.md"],
    schema: ListingFrontmatterSchema,
  }),
  blogIndex: defineCollection({
    loader: "markdown",
    directory: "content/blogs",
    include: ["README.md"],
    schema: ListingFrontmatterSchema,
  }),
  articles: defineCollection({
    loader: "markdown",
    directory: "content/articles",
    include: ["*/README.md"],
    slugify: (filePath) => slugifyFolderReadme(filePath),
    filter: (entry) => entry.data.draft !== true,
    schema: ArticleFrontmatterSchema,
  }),
  blogs: defineCollection({
    loader: "markdown",
    directory: "content/blogs",
    include: ["*/README.md"],
    slugify: (filePath) => slugifyFolderReadme(filePath),
    filter: (entry) => entry.data.draft !== true,
    schema: BlogFrontmatterSchema,
  }),
  rootMeta: defineCollection({
    loader: Json5Loader,
    directory: "content",
    include: ["meta.json5"],
    schema: RootMetaSchema,
  }),
  articleMeta: defineCollection({
    loader: Json5Loader,
    directory: "content/articles",
    include: ["meta.json5"],
    schema: SectionMetaSchema,
  }),
  blogMeta: defineCollection({
    loader: Json5Loader,
    directory: "content/blogs",
    include: ["meta.json5"],
    schema: SectionMetaSchema,
  }),
  homeData: defineCollection({
    loader: Json5Loader,
    directory: "content",
    include: ["home.json5"],
    schema: HomeDataSchema,
  }),
  redirects: defineCollection({
    loader: Json5Loader,
    directory: "content",
    include: ["redirects.json5"],
    schema: RedirectConfigSchema,
  }),
});

export const contentLayerConfig = defineConfig({
  collections,
  markdown: pagesmithMarkdown,
  strict: true,
});

export default collections;
