import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = new URL("../apps/web/wrangler.jsonc", import.meta.url);
const config = JSON.parse(readFileSync(path, "utf8"));
assert.equal(config.name, "minarvabiz-customer-web-preview");
assert.equal(config.main, ".open-next/worker.js");
assert.ok(config.compatibility_flags.includes("nodejs_compat"));
assert.equal(config.assets.directory, ".open-next/assets");
assert.equal(config.assets.binding, "ASSETS");
assert.equal(config.workers_dev, true);
assert.equal(config.routes, undefined, "Preview must not bind production routes");
assert.equal(config.vars, undefined, "No hardcoded environment credentials");
assert.equal(config.d1_databases, undefined, "Do not create an unrelated database");
assert.equal(config.r2_buckets, undefined, "No paid storage should be provisioned");
console.log("FRONTEND-02 Cloudflare preview configuration contract PASS");
