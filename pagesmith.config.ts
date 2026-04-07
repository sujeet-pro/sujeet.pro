import { BaseFrontmatterSchema, defineCollection, defineConfig, z } from "@pagesmith/core";

const articleSchema = BaseFrontmatterSchema;
const blogSchema = BaseFrontmatterSchema;
const projectSchema = BaseFrontmatterSchema;

const pageSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    layout: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().optional().default(false),
  })
  .passthrough();

function slugFromReadme(filePath: string, directory: string): string {
  const rel = filePath.replace(directory, "").replace(/^\//, "");
  return rel.replace(/\/README\.md$/, "").replace(/README\.md$/, "") || "_index";
}

const articles = defineCollection({
  loader: "markdown",
  directory: "content/articles",
  schema: articleSchema,
  include: ["*/README.md"],
  slugify: slugFromReadme,
});

const blogs = defineCollection({
  loader: "markdown",
  directory: "content/blogs",
  schema: blogSchema,
  include: ["*/README.md"],
  slugify: slugFromReadme,
});

const projects = defineCollection({
  loader: "markdown",
  directory: "content/projects",
  schema: projectSchema,
  include: ["*/README.md"],
  slugify: slugFromReadme,
});

const pages = defineCollection({
  loader: "markdown",
  directory: "content",
  schema: pageSchema,
  include: ["README.md", "articles/README.md", "blogs/README.md", "projects/README.md"],
  slugify: (filePath, directory) => {
    const rel = filePath.replace(directory, "").replace(/^\//, "");
    if (rel === "README.md") return "_home";
    return rel.replace(/\/README\.md$/, "");
  },
});

export default defineConfig({
  collections: { articles, blogs, projects, pages },
  root: process.cwd(),
  markdown: {
    shiki: {
      themes: { light: "github-light", dark: "github-dark" },
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
  },
});
