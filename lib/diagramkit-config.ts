import { resolve } from "node:path";
import { readJson5File } from "./read-json5.ts";
import { DiagramkitConfigSchema, type DiagramkitConfig } from "../schemas/diagramkit.ts";

const DEFAULT_CONFIG_PATH = resolve(process.cwd(), "diagramkit.config.json5");

const cache = new Map<string, DiagramkitConfig>();

export function loadDiagramkitConfig(configPath = DEFAULT_CONFIG_PATH): DiagramkitConfig {
  const resolvedPath = resolve(configPath);
  const cached = cache.get(resolvedPath);
  if (cached) return cached;

  const parsed = readJson5File(resolvedPath, DiagramkitConfigSchema);
  cache.set(resolvedPath, parsed);
  return parsed;
}
