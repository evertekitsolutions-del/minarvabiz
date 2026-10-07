import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "apps", "license-admin", "out");
assert.ok(fs.existsSync(path.join(out, "index.html")), "static License Admin index.html is missing");
assert.ok(fs.existsSync(path.join(out, "_headers")), "portable security _headers file is missing");

const forbidden = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LICENSE_EDGE_RPC_SECRET",
  "LICENSE_PRIVATE_KEY",
];
const textExtensions = new Set([".html", ".js", ".css", ".json", ".txt", ".map"]);
const stack = [out];
while (stack.length) {
  const current = stack.pop();
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) stack.push(full);
    else if (textExtensions.has(path.extname(entry.name))) {
      const body = fs.readFileSync(full, "utf8");
      for (const token of forbidden) {
        assert.ok(!body.includes(token), `privileged secret name leaked into static artifact: ${token}`);
      }
    }
  }
}
console.log("License Admin portable static artifact PASS");
