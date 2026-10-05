import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "inherit"],
  });
}

function deepValue(value, key) {
  if (!value || typeof value !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = deepValue(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

const status = JSON.parse(run("supabase", ["status", "-o", "json"]));
const dbUrl = String(deepValue(status, "DB_URL") || "").trim();
if (!/^postgres(?:ql)?:\/\//.test(dbUrl)) {
  throw new Error("Local Supabase DB_URL is unavailable.");
}

const directory = path.resolve("supabase/migrations");
const actualFiles = fs
  .readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b, "en"));

const manifestPath = path.resolve("supabase/MIGRATION_ORDER.txt");
const files = fs
  .readFileSync(manifestPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

if (files.length < 60) {
  throw new Error("Expected the complete Minarva migration manifest; found only " + files.length + " SQL entries.");
}
if (new Set(files).size !== files.length) {
  throw new Error("MIGRATION_ORDER.txt contains duplicate migration entries.");
}

const expected = [...files].sort((a, b) => a.localeCompare(b, "en"));
if (JSON.stringify(expected) !== JSON.stringify(actualFiles)) {
  const missing = actualFiles.filter((name) => !files.includes(name));
  const stale = files.filter((name) => !actualFiles.includes(name));
  throw new Error(
    "Migration manifest/file mismatch. Unordered files: " +
      JSON.stringify(missing) +
      "; missing files: " +
      JSON.stringify(stale),
  );
}

for (const file of files) {
  const fullPath = path.join(directory, file);
  process.stdout.write("Applying repository migration " + file + "...\n");
  run(
    "psql",
    [
      dbUrl,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
      "-f",
      fullPath,
    ],
    { inherit: true },
  );
}

console.log(
  "Repository migration replay PASS: " +
    files.length +
    " SQL migrations applied transactionally in authoritative production dependency order.",
);
