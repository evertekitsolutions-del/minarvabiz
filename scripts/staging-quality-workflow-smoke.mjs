import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(new URL("../.github/workflows/staging-quality.yml", import.meta.url), "utf8");
const nextConfig = fs.readFileSync(new URL("../apps/web/next.config.ts", import.meta.url), "utf8");
const middleware = fs.readFileSync(new URL("../apps/web/src/middleware.ts", import.meta.url), "utf8");
const appVercel = JSON.parse(fs.readFileSync(new URL("../apps/web/vercel.json", import.meta.url), "utf8"));
const rootVercel = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const policy = JSON.parse(fs.readFileSync(new URL("../security/staging-quality-policy.json", import.meta.url), "utf8"));

assert.match(workflow, /name: Staging Security \+ Performance/);
assert.match(workflow, /STAGING_BASE_URL/);
assert.match(workflow, /deployed-security-smoke\.mjs/);
assert.match(workflow, /staging-dast\.mjs/);
assert.match(workflow, /performance-baseline\.mjs/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /pull_request:/);
assert.match(workflow, /push:/);

assert.doesNotMatch(nextConfig, /VERCEL_ENV|VERCEL_URL|vercel\\.app/i);
assert.match(nextConfig, /runtimeMode === "demo"/);
assert.match(nextConfig, /NEXT_PUBLIC_MINARVA_MODE/);
assert.match(nextConfig, /poweredByHeader: false/);
assert.match(middleware, /const method = request\.method\.toUpperCase\(\)/);
assert.match(middleware, /request\.nextUrl\.pathname\.startsWith\("\/api\/support\/"\)/);
assert.match(middleware, /\["GET", "HEAD", "OPTIONS"\]\.includes\(method\)/);
assert.match(middleware, /isSupportApi && method === "POST"/);
assert.match(middleware, /status: 405/);
assert.match(middleware, /isSupportApi \? "GET, HEAD, POST, OPTIONS" : "GET, HEAD, OPTIONS"/);

assert.equal(appVercel.git.deploymentEnabled.staging, true);
assert.equal(rootVercel.git.deploymentEnabled.staging, true);
assert.ok(policy.performance.maxP95TtfbMs > 0);
assert.ok(policy.performance.maxP95TotalMs >= policy.performance.maxP95TtfbMs);
assert.ok(policy.performance.maxDocumentBytes >= 1024 * 1024);

console.log("Staging DAST + deployed-header + performance workflow contract PASS");
