import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildMinarvaNonceCsp,
  minarvaHttpSecurityHeaders,
} from "../packages/utils/src/security-headers.ts";

const expectedHeaders = new Map([
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
]);

const actualHeaders = new Map(
  minarvaHttpSecurityHeaders().map((header) => [header.key, header.value]),
);
assert.deepEqual(actualHeaders, expectedHeaders);

const productionCsp = buildMinarvaNonceCsp({
  nonce: "baseline-nonce",
  environment: "production",
  connectSources: ["https://supabase.example", "wss://supabase.example"],
  imageSources: ["https:"],
  workerSources: ["'self'", "blob:"],
  manifestSources: ["'self'"],
});
assert.match(productionCsp, /default-src 'self'/);
assert.match(productionCsp, /script-src 'self' 'nonce-baseline-nonce' 'strict-dynamic'/);
assert.doesNotMatch(productionCsp, /script-src[^;]*'unsafe-inline'/);
assert.doesNotMatch(productionCsp, /script-src[^;]*'unsafe-eval'/);
assert.match(productionCsp, /frame-ancestors 'none'/);
assert.match(productionCsp, /object-src 'none'/);
assert.match(productionCsp, /base-uri 'self'/);
assert.match(productionCsp, /form-action 'self'/);
assert.match(productionCsp, /upgrade-insecure-requests/);

const developmentCsp = buildMinarvaNonceCsp({
  nonce: "dev-nonce",
  environment: "development",
});
assert.match(developmentCsp, /script-src[^;]*'unsafe-eval'/);
assert.doesNotMatch(developmentCsp, /upgrade-insecure-requests/);

const webConfig = await readFile(
  new URL("../apps/web/next.config.ts", import.meta.url),
  "utf8",
);
const adminConfig = await readFile(
  new URL("../apps/license-admin/next.config.ts", import.meta.url),
  "utf8",
);
const webMiddleware = await readFile(
  new URL("../apps/web/src/middleware.ts", import.meta.url),
  "utf8",
);
const adminMiddleware = await readFile(
  new URL("../apps/license-admin/src/middleware.ts", import.meta.url),
  "utf8",
);
const desktopHtml = await readFile(
  new URL("../apps/desktop/index.html", import.meta.url),
  "utf8",
);

for (const [label, source] of [
  ["main web config", webConfig],
  ["license-admin config", adminConfig],
]) {
  assert.ok(
    source.includes("@minarvabiz/utils/security-headers"),
    label + " must import the centralized security baseline",
  );
  assert.ok(
    source.includes("minarvaHttpSecurityHeaders()"),
    label + " must use the centralized HTTP header baseline",
  );
  assert.ok(!source.includes('"X-Frame-Options"'), label + " must not duplicate X-Frame-Options");
  assert.ok(
    !source.includes('"Strict-Transport-Security"'),
    label + " must not duplicate HSTS",
  );
}

for (const [label, source] of [
  ["main web middleware", webMiddleware],
  ["license-admin middleware", adminMiddleware],
]) {
  assert.ok(
    source.includes("@minarvabiz/utils/security-headers"),
    label + " must import the centralized CSP builder",
  );
  assert.ok(
    source.includes("buildMinarvaNonceCsp("),
    label + " must use the centralized CSP builder",
  );
  assert.ok(
    !source.includes("function buildContentSecurityPolicy"),
    label + " must not keep a local CSP builder",
  );
}

const desktopCspMatch = desktopHtml.match(
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i,
);
assert.ok(desktopCspMatch?.[1], "desktop CSP meta tag is missing");
const desktopCsp = desktopCspMatch[1];
for (const required of [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "script-src 'self'",
]) {
  assert.ok(desktopCsp.includes(required), "desktop CSP baseline is missing: " + required);
}

console.log("Cross-app centralized security-header baseline smoke PASS");
