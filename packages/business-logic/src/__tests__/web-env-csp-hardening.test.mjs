import assert from "node:assert/strict";
import fs from "node:fs";

const config = fs.readFileSync(
  new URL("../../../../apps/web/next.config.ts", import.meta.url),
  "utf8",
);

assert.doesNotMatch(config, /wmjgefbaliuwmaxyzxkq/);
assert.doesNotMatch(config, /sb_publishable_/);
assert.match(config, /NEXT_PUBLIC_SUPABASE_URL/);
assert.match(config, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
assert.match(config, /Production web build requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY/);
assert.match(config, /Minarva Biz does not fall back to hardcoded Supabase credentials/);
assert.match(config, /runtimeMode === "demo"/);

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
  assert.ok(config.includes(directive), `missing CSP directive: ${directive}`);
}
assert.match(config, /Content-Security-Policy/);
assert.match(config, /supabaseOrigin/);
assert.match(config, /supabaseWsOrigin/);

console.log("web production env/CSP hardening contract tests passed");
