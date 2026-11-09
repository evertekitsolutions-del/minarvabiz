import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("mobile manifest advertises authenticated online ERP, not offline mode", () => {
  const manifest = readFileSync("apps/web/src/app/manifest.ts", "utf8");
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /start_url: "\/login"/);
  assert.match(manifest, /logo-mark\.png/);
  assert.doesNotMatch(manifest, /offline|sqlite/i);
});
test("service worker never caches authentication, stock or financial data", () => {
  const worker = readFileSync("apps/web/public/sw.js", "utf8");
  assert.match(worker, /addEventListener\("fetch"/);
  assert.doesNotMatch(worker, /caches\.open|cache\.put|respondWith\(|indexedDB\.|localStorage\./);
  const setup = readFileSync("apps/web/src/components/SaaSPwaBoot.tsx", "utf8");
  assert.match(setup, /serviceWorker\.register/);
  assert.match(setup, /isSecureContext/);
});
