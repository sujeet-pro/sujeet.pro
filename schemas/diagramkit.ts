import { z } from "@pagesmith/site";

export const DiagramTypeSchema = z.enum(["mermaid", "excalidraw", "drawio", "graphviz"]);
export const OutputFormatSchema = z.enum(["svg", "png", "jpeg", "webp", "avif"]);
export const DiagramThemeSchema = z.enum(["light", "dark", "both"]);

export const DiagramkitFileOverrideSchema = z
  .object({
    formats: z.array(OutputFormatSchema).optional(),
    theme: DiagramThemeSchema.optional(),
    quality: z.number().int().min(1).max(100).optional(),
    scale: z.number().positive().optional(),
    contrastOptimize: z.boolean().optional(),
  })
  .strict();

export const MermaidLayoutModeSchema = z.enum(["off", "warn", "flip", "elk", "auto"]);

export const MermaidLayoutOptionsSchema = z
  .object({
    mode: MermaidLayoutModeSchema.optional(),
    targetAspectRatio: z.number().positive().optional(),
    tolerance: z.number().gt(1).optional(),
  })
  .strict();

export const DiagramkitConfigSchema = z
  .object({
    outputDir: z.string().min(1).default(".diagramkit"),
    manifestFile: z.string().min(1).default("manifest.json"),
    useManifest: z.boolean().default(true),
    sameFolder: z.boolean().default(false),
    defaultFormats: z.array(OutputFormatSchema).min(1).default(["svg"]),
    defaultTheme: DiagramThemeSchema.default("both"),
    outputPrefix: z.string().default(""),
    outputSuffix: z.string().default(""),
    extensionMap: z.record(z.string(), DiagramTypeSchema).optional(),
    inputDirs: z.array(z.string().min(1)).optional(),
    overrides: z.record(z.string(), DiagramkitFileOverrideSchema).default({}),
    mermaidLayout: MermaidLayoutOptionsSchema.optional(),
  })
  .strict();

export type DiagramType = z.infer<typeof DiagramTypeSchema>;
export type DiagramkitConfig = z.infer<typeof DiagramkitConfigSchema>;
