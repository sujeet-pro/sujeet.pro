import { type z } from "@pagesmith/site";
import JSON5 from "json5";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function formatIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "<root>"}: ${issue.message}`)
    .join("; ");
}

export function readJson5File<T>(path: string, schema: z.ZodType<T>): T {
  const resolvedPath = resolve(path);
  const raw = readFileSync(resolvedPath, "utf-8");
  const parsed = JSON5.parse(raw) as unknown;
  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Invalid JSON5 in ${resolvedPath}: ${formatIssues(result.error.issues)}`);
  }

  return result.data;
}
