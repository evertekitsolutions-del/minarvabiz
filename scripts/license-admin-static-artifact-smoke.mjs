import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "apps", "license-admin", "out");
assert.ok(fs.existsSync(path.join(out, "index.html")), "static License Admin index.html is missing");
assert.ok(fs.existsSync(path.join(out, "_headers")), "portable security _headers file is missing");

const cspHeaders = fs.readFileSync(path.join(out, "_headers"), "utf8");
const csp = cspHeaders.split("\n").find((line) => line.trim().startsWith("Content-Security-Policy:")) || "";
const connectDirective = csp.split(";").map((part) => part.trim()).find((part) => part.startsWith("connect-src ")) || "";
assert.ok(connectDirective.includes("https://license-api.minarvabiz.com"), "CSP must permit the real production License Worker for named-admin login");
assert.ok(connectDirective.includes("https://*.supabase.co"), "CSP must permit verified Supabase Auth and PostgREST");
assert.ok(!connectDirective.includes("minarva-biz-license-edge.minarva-biz.workers.dev"), "CSP must not rely on obsolete Worker URL");
assert.ok(!connectDirective.includes("* "), "CSP must not allow all outbound origins");
assert.ok(csp.includes("object-src 'none'"), "Keep CSP object isolation");
assert.ok(csp.includes("frame-ancestors 'none'"), "Keep CSP clickjacking protection");


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
