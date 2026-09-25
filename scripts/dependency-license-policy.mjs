import fs from "node:fs";
import path from "node:path";

const policyPath = path.resolve("security/dependency-license-policy.json");
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const store = path.resolve("node_modules/.pnpm");
const outputFlag = process.argv.indexOf("--inventory-output");
const outputPath =
  outputFlag >= 0 && process.argv[outputFlag + 1]
    ? path.resolve(process.argv[outputFlag + 1])
    : null;

if (!fs.existsSync(store)) {
  throw new Error("pnpm virtual store was not found. Run pnpm install first.");
}

const allowed = new Set(policy.allowedLicenses ?? []);
const allowedExceptions = new Set(policy.allowedExceptions ?? []);
const deniedPatterns = (policy.deniedLicensePatterns ?? []).map(
  (pattern) => new RegExp(pattern, "i"),
);
const reviewPatterns = (policy.reviewRequiredLicensePatterns ?? []).map(
  (pattern) => new RegExp(pattern, "i"),
);
const reviewedPackages = policy.reviewedPackages ?? {};

function packageLicense(pkg) {
  if (typeof pkg.license === "string" && pkg.license.trim()) return pkg.license.trim();
  if (pkg.license && typeof pkg.license.type === "string") return pkg.license.type.trim();
  if (Array.isArray(pkg.licenses)) {
    const values = pkg.licenses
      .map((item) => (typeof item === "string" ? item : item?.type))
      .filter(Boolean);
    if (values.length) return values.join(" OR ");
  }
  return "UNKNOWN";
}

function splitTopLevel(expression, operator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  const needle = ` ${operator} `;
  for (let i = 0; i <= expression.length - needle.length; i += 1) {
    const char = expression[i];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && expression.slice(i, i + needle.length).toUpperCase() === needle) {
      parts.push(expression.slice(start, i).trim());
      start = i + needle.length;
      i = start - 1;
    }
  }
  if (parts.length) parts.push(expression.slice(start).trim());
  return parts;
}

function stripOuterParens(value) {
  let text = value.trim();
  while (text.startsWith("(") && text.endsWith(")")) {
    let depth = 0;
    let wrapsAll = true;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "(") depth += 1;
      else if (text[i] === ")") depth -= 1;
      if (depth === 0 && i < text.length - 1) {
        wrapsAll = false;
        break;
      }
    }
    if (!wrapsAll) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

function primitiveClassification(expression) {
  let value = stripOuterParens(expression).replace(/\*+$/, "").trim();

  const withMatch = value.match(/^(.+?)\s+WITH\s+([^\s]+)$/i);
  if (withMatch) {
    const base = primitiveClassification(withMatch[1]);
    const exception = withMatch[2];
    if (base === "allowed" && allowedExceptions.has(exception)) return "allowed";
    return base === "denied" ? "denied" : "review";
  }

  if (allowed.has(value)) return "allowed";
  if (deniedPatterns.some((pattern) => pattern.test(value))) return "denied";
  if (reviewPatterns.some((pattern) => pattern.test(value))) return "review";
  return "unknown";
}

function classify(expression) {
  const value = stripOuterParens(expression);

  const orParts = splitTopLevel(value, "OR");
  if (orParts.length) {
    const outcomes = orParts.map(classify);
    if (outcomes.includes("allowed")) return "allowed";
    if (outcomes.includes("review")) return "review";
    if (outcomes.includes("unknown")) return "unknown";
    return "denied";
  }

  const andParts = splitTopLevel(value, "AND");
  if (andParts.length) {
    const outcomes = andParts.map(classify);
    if (outcomes.includes("denied")) return "denied";
    if (outcomes.includes("unknown")) return "unknown";
    if (outcomes.includes("review")) return "review";
    return "allowed";
  }

  return primitiveClassification(value);
}

function readPackageJson(packageDir) {
  const file = path.join(packageDir, "package.json");
  if (!fs.existsSync(file)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!pkg.name || !pkg.version) return null;
    return {
      name: pkg.name,
      version: pkg.version,
      license: packageLicense(pkg),
      path: path.relative(process.cwd(), packageDir).replaceAll(path.sep, "/"),
    };
  } catch {
    return null;
  }
}

const packages = new Map();

for (const entry of fs.readdirSync(store, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const nodeModules = path.join(store, entry.name, "node_modules");
  if (!fs.existsSync(nodeModules)) continue;

  for (const child of fs.readdirSync(nodeModules, { withFileTypes: true })) {
    if (!child.isDirectory()) continue;

    if (child.name.startsWith("@")) {
      const scopeDir = path.join(nodeModules, child.name);
      for (const scoped of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (!scoped.isDirectory()) continue;
        const record = readPackageJson(path.join(scopeDir, scoped.name));
        if (record) packages.set(`${record.name}@${record.version}`, record);
      }
    } else {
      const record = readPackageJson(path.join(nodeModules, child.name));
      if (record) packages.set(`${record.name}@${record.version}`, record);
    }
  }
}

const inventory = [...packages.values()].sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
);

if (inventory.length === 0) {
  throw new Error("No third-party pnpm packages were discovered for license review.");
}

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        packageCount: inventory.length,
        packages: inventory,
      },
      null,
      2,
    ) + "\n",
  );
}

const failures = [];
const counts = { allowed: 0, reviewed: 0, denied: 0, unknown: 0 };

for (const pkg of inventory) {
  const outcome = classify(pkg.license);
  const reviewKey = `${pkg.name}@${pkg.version}`;
  const review = reviewedPackages[reviewKey] ?? reviewedPackages[pkg.name];

  if (outcome === "allowed") {
    counts.allowed += 1;
    continue;
  }

  if (outcome === "review" && review?.approved === true && review?.license === pkg.license && review?.rationale) {
    counts.reviewed += 1;
    continue;
  }

  if (outcome === "denied") {
    counts.denied += 1;
    failures.push(`${reviewKey}: denied license ${pkg.license}`);
  } else if (outcome === "review") {
    failures.push(`${reviewKey}: review-required license ${pkg.license}; add an explicit reviewedPackages entry with rationale`);
  } else {
    counts.unknown += 1;
    failures.push(`${reviewKey}: unknown/unclassified license ${pkg.license}`);
  }
}

if (failures.length) {
  console.error("Dependency license policy FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Dependency license policy PASS: ${inventory.length} packages; ${counts.allowed} allowed; ${counts.reviewed} explicitly reviewed; 0 denied; 0 unknown.`,
);
