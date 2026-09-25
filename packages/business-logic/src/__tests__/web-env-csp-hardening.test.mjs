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
const sharedSecurity = fs.readFileSync(
  new URL("../../../../packages/utils/src/security-headers.ts", import.meta.url),
  "utf8",
);

assert.doesNotMatch(config, /wmjgefbaliuwmaxyzxkq/);
assert.doesNotMatch(config, /sb_publishable_/);
assert.match(config, /NEXT_PUBLIC_SUPABASE_URL/);
assert.match(config, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
assert.match(config, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
assert.ok(
  config.includes(
    "Production web build requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY).",
  ),
);
assert.match(
  config,
  /Minarva Biz does not fall back to hardcoded Supabase credentials/,
);
assert.match(config, /runtimeMode === "demo"/);
assert.doesNotMatch(config, /Content-Security-Policy/);
assert.match(config, /@minarvabiz\/utils\/security-headers/);
assert.match(config, /minarvaHttpSecurityHeaders\(\)/);

for (const directive of [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src ",
  "connect-src ",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]) {
  assert.ok(
    sharedSecurity.includes(directive),
    `shared CSP baseline missing directive: ${directive}`,
  );
}

assert.match(sharedSecurity, /nonce-/);
assert.match(sharedSecurity, /strict-dynamic/);
const sharedScriptLine = sharedSecurity
  .split("\n")
  .find((line) => line.includes("script-src "));
assert.ok(sharedScriptLine, "shared script-src source definition missing");
assert.ok(
  !sharedScriptLine.includes("unsafe-inline"),
  "shared script-src must not allow unsafe-inline",
);

assert.match(middleware, /Content-Security-Policy/);
assert.match(middleware, /NEXT_PUBLIC_SUPABASE_URL/);
assert.match(middleware, /wss:\/\//);
assert.match(middleware, /buildMinarvaNonceCsp/);
assert.match(middleware, /imageSources: \["https:"\]/);
assert.match(middleware, /workerSources: \["'self'", "blob:"\]/);
assert.match(middleware, /manifestSources: \["'self'"\]/);
assert.doesNotMatch(middleware, /function buildContentSecurityPolicy/);

console.log("web production env/CSP hardening contract tests passed");
