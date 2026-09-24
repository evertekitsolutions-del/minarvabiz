import assert from "node:assert/strict";
import fs from "node:fs";

const config = fs.readFileSync(
  new URL("../../../../apps/web/next.config.ts", import.meta.url),
  "utf8",
);
const middleware = fs.readFileSync(
  new URL("../../../../apps/web/src/middleware.ts", import.meta.url),
  "utf8",
);

assert.doesNotMatch(config, /wmjgefbaliuwmaxyzxkq/);
assert.doesNotMatch(config, /sb_publishable_/);
assert.match(config, /NEXT_PUBLIC_SUPABASE_URL/);
assert.match(config, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
assert.match(config, /Production web build requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY/);
assert.match(config, /Minarva Biz does not fall back to hardcoded Supabase credentials/);
assert.match(config, /runtimeMode === "demo"/);
assert.doesNotMatch(config, /Content-Security-Policy/);

for (const directive of [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob: https:",
  "connect-src",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]) {
  assert.ok(middleware.includes(directive), `missing CSP directive: ${directive}`);
}

assert.match(middleware, /Content-Security-Policy/);
assert.match(middleware, /NEXT_PUBLIC_SUPABASE_URL/);
assert.match(middleware, /wss:\/\//);
assert.match(middleware, /nonce-/);
assert.match(middleware, /strict-dynamic/);

const scriptSrcLine = middleware
  .split("\n")
  .find((line) => line.includes("script-src "));
assert.ok(scriptSrcLine, "script-src source definition missing");
assert.ok(!scriptSrcLine.includes("unsafe-inline"), "script-src must not allow unsafe-inline");

console.log("web production env/CSP hardening contract tests passed");
