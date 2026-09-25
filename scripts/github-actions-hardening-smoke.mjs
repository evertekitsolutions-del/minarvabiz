import fs from "node:fs";
import path from "node:path";

const workflowsDir = path.resolve(".github/workflows");
const files = fs.readdirSync(workflowsDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

if (files.length === 0) throw new Error("No GitHub Actions workflows found.");

const failures = [];
const publisher = "publish-windows-release.yml";

for (const file of files) {
  const fullPath = path.join(workflowsDir, file);
  const source = fs.readFileSync(fullPath, "utf8");
  const permissionMatch = source.match(/^permissions:\s*\n((?:^[ \t]+.*\n?)*)/m);

  if (!permissionMatch) {
    failures.push(`${file}: missing top-level permissions block`);
  } else {
    const block = permissionMatch[1];
    if (file === publisher) {
      if (!/^\s+contents:\s+write\s*$/m.test(block)) failures.push(`${file}: publisher must have contents: write`);
      if (!/^\s+actions:\s+read\s*$/m.test(block)) failures.push(`${file}: publisher must have actions: read`);
      for (const match of block.matchAll(/^\s+([A-Za-z0-9_-]+):\s+write\s*$/gm)) {
        if (match[1] !== "contents") failures.push(`${file}: only contents: write is allowed`);
      }
      if (!/workflow_run:\s*\n\s+workflows:\s*\["Release Windows"\]\s*\n\s+types:\s*\[completed\]/m.test(source)) failures.push(`${file}: must trigger only from completed Release Windows runs`);
      if (!/workflow_run\.conclusion == 'success'/.test(source)) failures.push(`${file}: must require successful source workflow`);
      if (!/workflow_run\.event == 'push'/.test(source)) failures.push(`${file}: must require source event push`);
      if (!/workflow_run\.head_branch == 'main'/.test(source)) failures.push(`${file}: must require source branch main`);
      if (/actions\/checkout@/i.test(source)) failures.push(`${file}: privileged publisher must not checkout repository code`);
      if (/pull_request_target:|workflow_dispatch:/m.test(source)) failures.push(`${file}: privileged publisher must not expose alternate triggers`);
    } else {
      if (!/^\s+contents:\s+read\s*$/m.test(block)) failures.push(`${file}: top-level permissions must include contents: read`);
      if (/^\s+[A-Za-z0-9_-]+:\s+write\s*$/m.test(block)) failures.push(`${file}: write permission is not allowed`);
    }
  }

  for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
    const uses = match[1];
    if (uses.startsWith("./")) continue;
    const at = uses.lastIndexOf("@");
    const ref = at >= 0 ? uses.slice(at + 1) : "";
    if (!/^[0-9a-f]{40}$/i.test(ref)) failures.push(`${file}: action is not pinned to an immutable 40-char SHA: ${uses}`);
  }
}

if (failures.length > 0) {
  console.error("GitHub Actions hardening gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`GitHub Actions hardening gate PASS: ${files.length} workflows use immutable action SHAs; only the gated no-checkout release publisher has contents: write.`);
