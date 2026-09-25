import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflowDir = ".github/workflows";
const shaPattern = /^[0-9a-f]{40}$/;
const failures = [];

for (const file of readdirSync(workflowDir).filter((name) => /\.ya?ml$/i.test(name)).sort()) {
  const path = join(workflowDir, file);
  const source = readFileSync(path, "utf8");
  const lines = source.split(/\r?\n/);

  const permissionsIndex = lines.findIndex((line) => line === "permissions:");
  if (permissionsIndex === -1) {
    failures.push(`${path}: missing explicit top-level permissions block`);
  } else {
    const permissions = new Map();
    for (let i = permissionsIndex + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.trim() || line.trimStart().startsWith("#")) continue;
      if (!/^\s/.test(line)) break;
      const match = line.match(/^\s{2}([A-Za-z-]+):\s*([^#\s]+)\s*(?:#.*)?$/);
      if (match) permissions.set(match[1], match[2]);
    }

    if (permissions.get("contents") !== "read") {
      failures.push(`${path}: top-level permissions must include contents: read`);
    }

    for (const [name, value] of permissions) {
      if (name !== "contents") {
        failures.push(`${path}: unexpected top-level token permission "${name}: ${value}"`);
      }
      if (value === "write" || value === "write-all") {
        failures.push(`${path}: write token permission is not allowed by the current least-privilege contract`);
      }
    }
  }

  lines.forEach((line, index) => {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#.*)?$/);
    if (!match) return;

    const target = match[1];
    if (target.startsWith("./")) return;

    const at = target.lastIndexOf("@");
    if (at <= 0) {
      failures.push(`${path}:${index + 1}: action reference is missing an immutable ref: ${target}`);
      return;
    }

    const ref = target.slice(at + 1);
    if (!shaPattern.test(ref)) {
      failures.push(`${path}:${index + 1}: action must be pinned to a full 40-character commit SHA: ${target}`);
    }
  });
}

if (failures.length) {
  console.error("GitHub Actions hardening contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GitHub Actions hardening contract PASS: all workflows use immutable action SHAs and explicit read-only token permissions.");
