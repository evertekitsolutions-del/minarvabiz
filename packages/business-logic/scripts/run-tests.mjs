import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const testsDirectory = resolve(packageRoot, "src/__tests__");
const testFiles = readdirSync(testsDirectory)
  .filter((file) => file.endsWith(".test.mjs"))
  .sort();

if (testFiles.length === 0) {
  console.error("No business-logic test files were found.");
  process.exit(1);
}

for (const file of testFiles) {
  const testPath = resolve(testsDirectory, file);
  console.log(`\\n▶ ${file}`);
  const result = spawnSync(process.execPath, [testPath], {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.signal || result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\\nPassed all ${testFiles.length} business-logic test files.`);
