# Package Reference

Feature reference for the two external packages powering sujeet.pro. This file is auto-updated by `/sp-sync` when package versions change.

<!-- Last synced: 2026-04-07 -->
<!-- @pagesmith/core: file:../pagesmith/packages/core -->
<!-- diagramkit: file:../diagramkit -->

## @pagesmith/core

Content layer, markdown pipeline, custom JSX runtime, and CSS bundling for static sites.

### Content Layer API

```ts
import { createContentLayer, defineCollection, defineConfig, z } from "@pagesmith/core";
```

| Function               | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `defineCollection()`   | Define a content collection with loader, directory, schema |
| `defineConfig()`       | Create a typed configuration object                        |
| `createContentLayer()` | Create a content layer from config                         |
| `z`                    | Re-exported Zod (always use this, not `zod` directly)      |

### Collection Options

| Option                     | Type                                                  | Description                                |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| `loader`                   | `'markdown' \| 'json' \| 'json5' \| 'yaml' \| 'toml'` | Content loader                             |
| `directory`                | `string`                                              | Directory containing content files         |
| `schema`                   | `z.ZodType`                                           | Zod schema for frontmatter validation      |
| `include`                  | `string[]`                                            | Glob include patterns                      |
| `exclude`                  | `string[]`                                            | Glob exclude patterns                      |
| `slugify`                  | `(filePath, directory) => string`                     | Custom slug generation                     |
| `computed`                 | `Record<string, fn>`                                  | Computed fields                            |
| `validate`                 | `fn`                                                  | Custom validation                          |
| `filter`                   | `fn`                                                  | Filter entries                             |
| `transform`                | `fn`                                                  | Pre-validation transform                   |
| `validators`               | `ContentValidator[]`                                  | Custom content validators                  |
| `disableBuiltinValidators` | `boolean`                                             | Disable link/heading/code-block validators |

### Frontmatter Schemas

| Schema                     | Fields                                                        |
| -------------------------- | ------------------------------------------------------------- |
| `BaseFrontmatterSchema`    | title, description, publishedDate, lastUpdatedOn, tags, draft |
| `BlogFrontmatterSchema`    | extends base + category, featured, coverImage                 |
| `ProjectFrontmatterSchema` | extends base + gitRepo, links                                 |

### JSX Runtime

Server-side HTML generation without React:

```json
// tsconfig.json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@pagesmith/core" } }
```

```tsx
import { Fragment } from "@pagesmith/core/jsx-runtime";

function Page({ title, content }: { title: string; content: string }) {
  return (
    <html>
      <head>
        <title>{title}</title>
      </head>
      <body>
        <Fragment innerHTML={content} />
      </body>
    </html>
  );
}
```

### CSS Exports

| Import Path                      | Use Case                                       |
| -------------------------------- | ---------------------------------------------- |
| `@pagesmith/core/css/content`    | Embedding rendered markdown in an existing app |
| `@pagesmith/core/css/standalone` | Full layout with sidebar and TOC               |
| `@pagesmith/core/css/viewport`   | Minimal responsive shell                       |
| `@pagesmith/core/css/fonts`      | Bundled Open Sans + JetBrains Mono             |

Code block CSS is injected inline by Expressive Code — do NOT import separate code block CSS.

### Built-in Content Validators

- **linkValidator** — warns on bare URLs, empty link text, suspicious protocols
- **headingValidator** — enforces single H1, sequential heading depth
- **codeBlockValidator** — warns on missing language, unknown meta properties

### Full Reference

- API reference: `node_modules/@pagesmith/core/REFERENCE.md`
- Usage guide: `node_modules/@pagesmith/core/docs/agents/usage.md`
- Core guidelines: `../pagesmith/ai-guidelines/core-guidelines.md`

---

## diagramkit

Diagram rendering CLI and library. Converts source files to SVG/PNG with automatic light/dark mode support.

### Supported Formats

| Input      | Extensions                       |
| ---------- | -------------------------------- |
| Mermaid    | `.mermaid`, `.mmd`, `.mmdc`      |
| Excalidraw | `.excalidraw`                    |
| Draw.io    | `.drawio`, `.drawio.xml`, `.dio` |
| Graphviz   | `.dot`, `.gv`, `.graphviz`       |

Output: SVG (default), PNG, JPEG, WebP, AVIF.

### CLI Commands

```bash
diagramkit render <file-or-dir>    # Render diagrams
diagramkit warmup                  # Pre-install Playwright chromium
diagramkit doctor                  # Validate runtime dependencies
diagramkit init [--ts]             # Create config file
```

### Render Options

| Option                        | Description                                           |
| ----------------------------- | ----------------------------------------------------- |
| `--format <formats>`          | Output formats, comma-separated (default: svg)        |
| `--theme <light\|dark\|both>` | Theme variants (default: both)                        |
| `--force`                     | Re-render all, ignore manifest                        |
| `--watch`                     | Watch for changes and re-render                       |
| `--same-folder`               | Output next to source files                           |
| `--type <type>`               | Filter by type: mermaid, excalidraw, drawio, graphviz |
| `--dry-run`                   | Preview what would render                             |

### Programmatic API

```ts
import { renderAll, watchDiagrams, dispose } from "diagramkit";

await renderAll({ dir: ".", force: false });
const watcher = await watchDiagrams({ dir: "." });
await dispose();
```

### Full Reference

- Quick reference: `node_modules/diagramkit/llms.txt`
- Full reference: `node_modules/diagramkit/llms-full.txt`
