import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadDiagramkitConfig } from "../lib/diagramkit-config.ts";

const VALUE_FLAGS = new Set([
  "--format",
  "--theme",
  "--scale",
  "--quality",
  "--type",
  "--output",
  "--config",
  "--dir",
  "--output-dir",
  "--manifest-file",
  "--output-prefix",
  "--output-suffix",
  "--max-type-lanes",
  "--log-level",
]);

function resolveConfigPath(args: string[]): string {
  const configIndex = args.indexOf("--config");
  if (configIndex === -1) {
    return resolve(process.cwd(), "diagramkit.config.json5");
  }

  const value = args[configIndex + 1];
  if (!value) {
    console.error("Missing value for --config.");
    process.exit(1);
  }

  return resolve(process.cwd(), value);
}

function hasExplicitTarget(args: string[]): boolean {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg) continue;
    if (!arg.startsWith("-")) return true;
    if (VALUE_FLAGS.has(arg)) {
      index++;
    }
  }

  return false;
}

const rawArgs = process.argv.slice(2);
const configPath = resolveConfigPath(rawArgs);

// Validate the repo-local diagramkit config against the local schema before handing off to the CLI.
loadDiagramkitConfig(configPath);

const cliArgs = ["render"];
if (!hasExplicitTarget(rawArgs)) {
  cliArgs.push("./content");
}
cliArgs.push(...rawArgs);

if (!rawArgs.includes("--config")) {
  cliArgs.push("--config", configPath);
}

const child = spawn("diagramkit", cliArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  console.error(`Failed to launch diagramkit: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
