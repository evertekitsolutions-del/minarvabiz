import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

for (const bypass of [
  { MINARVA_MODE: "demo" },
  { NEXT_PUBLIC_MINARVA_MODE: "demo" },
  { NEXT_PUBLIC_REQUIRE_AUTH: "false" },
]) {
  const result = spawnSync(process.execPath, ["scripts/frontend-cloudflare-preview-deploy.mjs", "--build-only"], {
    encoding: "utf8", env: { ...process.env, MINARVA_MODE: "production", NEXT_PUBLIC_MINARVA_MODE: "production", NEXT_PUBLIC_REQUIRE_AUTH: "true", ...bypass },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Cloudflare customer deployment forbids demo mode and authentication bypass/,
    "Refuse an auth bypass before invoking any build or deployment subprocess");
}
console.log("Cloudflare preview authentication bypass refusal PASS");

// Exercise the real CLI with isolated lockfiles, stopping before any package build.
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, chmodSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const fixture = mkdtempSync(join(tmpdir(), "minarva-cloudflare-preflight-"));
try {
  mkdirSync(join(fixture, "scripts"));
  mkdirSync(join(fixture, "apps/web"), { recursive: true });
  copyFileSync("scripts/frontend-cloudflare-preview-deploy.mjs", join(fixture, "scripts/preflight.mjs"));
  writeFileSync(join(fixture, "apps/web/package.json"), JSON.stringify({ devDependencies: {
    "@opennextjs/cloudflare": "1.20.12", wrangler: "4.151.0",
  } }));
  for (const [version, expected] of [
    ["15.5.24", /below the current security-supported/],
    ["15.5.28", /Missing real public deployment configuration/],
    ["16.4.0", /below the current security-supported/],
    ["16.4.1", /Missing real public deployment configuration/],
  ]) {
    writeFileSync(join(fixture, "pnpm-lock.yaml"), `lockfileVersion: '9.0'\nimporters:\n  apps/web:\n    dependencies:\n      next:\n        specifier: ${version}\n        version: ${version}(react@19.0.0)\npackages:\n`);
    const env = { ...process.env, MINARVA_MODE: "production", NEXT_PUBLIC_MINARVA_MODE: "production", NEXT_PUBLIC_REQUIRE_AUTH: "true" };
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    const result = spawnSync(process.execPath, [join(fixture, "scripts/preflight.mjs"), "--build-only"], { env, encoding: "utf8" });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, expected, `Locked Next.js ${version} must reach the correct guard`);
  }
  // Next/OpenNext may load an ignored .env file after wrapper validation.
  // Build subprocesses must receive explicit safe values that dotenv cannot override.
  mkdirSync(join(fixture, "bin"));
  writeFileSync(join(fixture, "apps/web/.env.production.local"), "NEXT_PUBLIC_REQUIRE_AUTH=false\nNEXT_PUBLIC_MINARVA_MODE=demo\nMINARVA_MODE=demo\n");
  const pnpm = join(fixture, "bin/pnpm");
  writeFileSync(pnpm, `#!/usr/bin/env node
const assert = require("node:assert/strict");
assert.equal(process.env.NEXT_PUBLIC_REQUIRE_AUTH, "true");
assert.equal(process.env.NEXT_PUBLIC_MINARVA_MODE, "production");
assert.equal(process.env.MINARVA_MODE, "production");
assert.equal(process.env.NODE_ENV, "production");
`);
  chmodSync(pnpm, 0o755);
  const safeEnv = { ...process.env, PATH: join(fixture, "bin") + ":" + process.env.PATH,
    NEXT_PUBLIC_SUPABASE_URL: "https://ci-supabase.example", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ci_test_key" };
  for (const name of ["MINARVA_MODE", "NEXT_PUBLIC_MINARVA_MODE", "NEXT_PUBLIC_REQUIRE_AUTH", "NODE_ENV"]) delete safeEnv[name];
  const safeBuild = spawnSync(process.execPath, [join(fixture, "scripts/preflight.mjs"), "--build-only"], { env: safeEnv, encoding: "utf8" });
  assert.equal(safeBuild.status, 0, "Build subprocess must force authenticated production mode: " + safeBuild.stderr);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log("Cloudflare lockfile security floor and public-config preflight PASS");
