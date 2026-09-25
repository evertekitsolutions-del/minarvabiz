import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const policy = JSON.parse(
  fs.readFileSync(path.join(root, "security", "hotspot-policy.json"), "utf8"),
);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (policy.excludeSegments.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = policy.roots.flatMap((relative) => {
  const dir = path.join(root, relative);
  return fs.existsSync(dir) ? walk(dir) : [];
}).filter((file) => policy.extensions.includes(path.extname(file)));

const rows = files.map((file) => {
  const content = fs.readFileSync(file, "utf8");
  return {
    file: path.relative(root, file).replaceAll(path.sep, "/"),
    bytes: Buffer.byteLength(content),
    lines: content.split(/\r?\n/).length,
  };
}).sort((a, b) => Math.max(b.bytes / policy.maxFileBytes, b.lines / policy.maxFileLines)
  - Math.max(a.bytes / policy.maxFileBytes, a.lines / policy.maxFileLines));

const violations = rows.filter(
  (row) => row.bytes > policy.maxFileBytes || row.lines > policy.maxFileLines,
);

console.log("HOTSPOT_PROFILE", JSON.stringify({
  scannedFiles: rows.length,
  policy: {
    maxFileBytes: policy.maxFileBytes,
    maxFileLines: policy.maxFileLines,
  },
  top: rows.slice(0, policy.reportTop),
}, null, 2));

if (process.argv.includes("--check") && violations.length) {
  console.error("Hotspot budget exceeded:", JSON.stringify(violations, null, 2));
  process.exit(1);
}
