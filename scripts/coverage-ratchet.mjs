import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const policyPath = path.resolve("security/coverage-policy.json");
const summaryPath = path.resolve(process.argv[2] ?? "coverage/coverage-summary.json");
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

const normalize = (value) =>
  value.replaceAll("\\", "/").replace(/^file:\/\//, "");

const cwd = normalize(process.cwd());
const targetPrefixes = policy.targetPrefixes ?? [];
const excluded = policy.excludedPathFragments ?? [];

function relativeCoveragePath(filePath) {
  const normalized = normalize(filePath);
  if (normalized.startsWith(cwd + "/")) return normalized.slice(cwd.length + 1);
  return normalized.replace(/^.*\/minarvabiz\//, "");
}

function inScope(file) {
  const normalized = normalize(file);
  return (
    targetPrefixes.some((prefix) => normalized.startsWith(prefix)) &&
    !excluded.some((fragment) => normalized.includes(fragment))
  );
}

const files = new Map();
for (const file of summary.files ?? []) {
  const rel = relativeCoveragePath(file.path);
  if (!inScope(rel)) continue;
  files.set(
    rel,
    new Map((file.lines ?? []).map((line) => [Number(line.line), Number(line.count)])),
  );
}

const totals = summary.totals ?? {};
const overallLinePercent = Number(totals.coveredLinePercent ?? 0);
const overallMinimum = Number(policy.overallLineMinimum ?? 0);

console.log(
  `Coverage summary: lines ${overallLinePercent.toFixed(2)}%, branches ${Number(
    totals.coveredBranchPercent ?? 0,
  ).toFixed(2)}%, functions ${Number(totals.coveredFunctionPercent ?? 0).toFixed(2)}%`,
);

if (overallLinePercent + Number.EPSILON < overallMinimum) {
  console.error(
    `Overall line coverage ${overallLinePercent.toFixed(2)}% is below ratchet baseline ${overallMinimum.toFixed(2)}%.`,
  );
  process.exit(1);
}

const baseRef =
  process.env.COVERAGE_BASE_REF?.trim() ||
  `origin/${policy.baseBranch ?? "main"}`;

let diff;
try {
  diff = execFileSync(
    "git",
    ["diff", "--unified=0", "--no-color", `${baseRef}...HEAD`, "--", ...targetPrefixes],
    { encoding: "utf8" },
  );
} catch (error) {
  console.error(`Unable to compare coverage against ${baseRef}.`);
  throw error;
}

const changedLines = new Map();
let currentFile = null;
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) {
    currentFile = normalize(line.slice(6));
    if (!inScope(currentFile)) currentFile = null;
    continue;
  }
  if (!currentFile || !line.startsWith("@@")) continue;
  const match = line.match(/\+(\d+)(?:,(\d+))?/);
  if (!match) continue;
  const start = Number(match[1]);
  const count = match[2] === undefined ? 1 : Number(match[2]);
  if (count === 0) continue;
  const set = changedLines.get(currentFile) ?? new Set();
  for (let n = start; n < start + count; n += 1) set.add(n);
  changedLines.set(currentFile, set);
}

let executableChanged = 0;
let coveredChanged = 0;
const uncovered = [];

for (const [file, lineNumbers] of changedLines) {
  const coverage = files.get(file);
  const source = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];

  for (const lineNumber of [...lineNumbers].sort((a, b) => a - b)) {
    const sourceLine = source[lineNumber - 1]?.trim() ?? "";
    if (
      !sourceLine ||
      sourceLine.startsWith("//") ||
      sourceLine.startsWith("/*") ||
      sourceLine.startsWith("*") ||
      sourceLine === "{" ||
      sourceLine === "}" ||
      sourceLine === "};"
    ) {
      continue;
    }

    if (coverage?.has(lineNumber)) {
      executableChanged += 1;
      if ((coverage.get(lineNumber) ?? 0) > 0) coveredChanged += 1;
      else uncovered.push(`${file}:${lineNumber}`);
      continue;
    }

    if (coverage) {
      // Node's coverage map omits non-executable source lines.
      continue;
    }

    executableChanged += 1;
    uncovered.push(`${file}:${lineNumber} (file not exercised by coverage suite)`);
  }
}

if (executableChanged === 0) {
  console.log("Changed-code coverage: no executable in-scope source lines changed.");
  process.exit(0);
}

const changedPercent = (coveredChanged / executableChanged) * 100;
const changedMinimum = Number(policy.changedLineMinimum ?? 0);
console.log(
  `Changed-code coverage: ${coveredChanged}/${executableChanged} lines = ${changedPercent.toFixed(
    2,
  )}% (minimum ${changedMinimum.toFixed(2)}%).`,
);

if (changedPercent + Number.EPSILON < changedMinimum) {
  console.error("Changed-code coverage ratchet FAILED.");
  for (const item of uncovered.slice(0, 100)) console.error(`- ${item}`);
  if (uncovered.length > 100) {
    console.error(`- ... and ${uncovered.length - 100} more uncovered changed lines`);
  }
  process.exit(1);
}

console.log("Changed-code coverage ratchet PASS.");
