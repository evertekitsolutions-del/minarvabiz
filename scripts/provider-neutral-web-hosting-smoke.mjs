import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../apps/web/next.config.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../apps/web/package.json", import.meta.url), "utf8"));
const middleware = await readFile(new URL("../apps/web/src/middleware.ts", import.meta.url), "utf8");

assert.doesNotMatch(config, /VERCEL_ENV|VERCEL_URL|vercel\.app/i, "web runtime config must not branch on Vercel");
assert.doesNotMatch(middleware, /VERCEL_ENV|VERCEL_URL|vercel\.app/i, "middleware must remain host-neutral");
assert.equal(packageJson.scripts.build, "next build");
assert.equal(packageJson.scripts.start, "next start");
assert.match(config, /NEXT_PUBLIC_MINARVA_MODE/);
assert.match(config, /runtimeMode === "demo"/);
assert.doesNotMatch(config, /preview[^\n]*demo/i, "preview hosting must never implicitly disable auth");
assert.match(config, /NEXT_PUBLIC_SUPABASE_URL/);
assert.match(config, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);

console.log("Provider-neutral web hosting contract PASS");
