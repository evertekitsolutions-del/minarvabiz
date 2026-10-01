import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const worker = read("infra/cloudflare-license-edge/src/index.js");
const wrangler = read("infra/cloudflare-license-edge/wrangler.jsonc");
const release = read(".github/workflows/release-windows.yml");
const publisher = read(".github/workflows/publish-windows-release.yml");

const EDGE = "https://minarva-biz-license-edge.minarva-biz.workers.dev";

assert.match(worker, /ALLOWED_ROUTES/);
assert.match(worker, /GET \/api\/public-key/);
assert.match(worker, /GET \/api\/update\/manifest/);
assert.match(worker, /POST \/api\/license\/activate/);
assert.match(worker, /POST \/api\/license\/validate/);
assert.match(worker, /POST \/api\/license\/deactivate/);
assert.match(worker, /POST \/api\/trial\/register/);
assert.match(worker, /REQUEST_TOO_LARGE/);
assert.match(worker, /x-minarva-license-edge/);
assert.match(worker, /x-minarva-license-backend/);
assert.match(worker, /cloudflare-native/);
assert.match(worker, /github-release/);
assert.match(worker, /if \(route\.updateFallback\) \{[\s\S]*return updateFallback\(env\)/);
assert.match(worker, /github\.com\/evertekitsolutions-del\/minarvabiz\/releases\/latest\/download\/MinarvaBiz-update-manifest\.json/);
assert.match(worker, /LICENSE_SERVICE_TEMPORARILY_UNAVAILABLE/);
assert.doesNotMatch(worker, /LICENSE_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);

assert.match(wrangler, /minarva-biz-license-edge/);
assert.match(wrangler, /LICENSE_ORIGIN/);

assert.ok(release.includes(`VITE_LICENSE_API_URL: "${EDGE}"`));
assert.ok(release.includes(`MINARVA_UPDATE_MANIFEST_URL: "${EDGE}/api/update/manifest"`));
assert.ok(publisher.includes(`const base = "${EDGE}";`));

console.log("Cloudflare license edge contract tests passed");
