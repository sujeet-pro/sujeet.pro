import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

function skillFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? skillFiles(path) : entry.name === "SKILL.md" ? [path] : [];
  });
}

const files = skillFiles(join(process.cwd(), ".junie", "skills"));
const invalid = files.filter((path) => {
  const source = readFileSync(path, "utf8");
  return !/^name:\s*\S+/mu.test(source) || !/^description:\s*\S+/mu.test(source);
});

if (!files.length || invalid.length) {
  console.error(`Invalid Junie skills: ${invalid.length ? invalid.join(", ") : "none found"}`);
  process.exit(1);
}
console.info(`Junie skills passed (${files.length}).`);
