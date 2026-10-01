import { existsSync } from "fs";
import { join } from "path";

const root = process.cwd();
const forbidden = [
  ".agents",
  ".claude",
  ".cursor",
  "CLAUDE.md",
  "GEMINI.md",
  join(".idea", "workspace.xml"),
  join(".idea", "tasks.xml"),
  join(".idea", "usage.statistics.xml"),
];
const violations = forbidden.filter((path) => existsSync(join(root, path)));

if (violations.length) {
  console.error(
    `Forbidden agent/editor configuration found:\n${violations.map((path) => `- ${path}`).join("\n")}`,
  );
  process.exit(1);
}

console.info("Junie-only and stable WebStorm policy passed.");
