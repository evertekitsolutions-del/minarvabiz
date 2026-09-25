import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const updater = read("apps/desktop/electron/updater.ts");
const config = read("apps/desktop/scripts/write-update-config.mjs");
const route = read("apps/license-admin/src/app/api/update/manifest/route.ts");
const signing = read("apps/license-admin/src/lib/signing-key.ts");
const deep = read(".github/workflows/windows-deep-smoke.yml");
const release = read(".github/workflows/release-windows.yml");
const publisher = read(".github/workflows/publish-windows-release.yml");
const pkg = JSON.parse(read("apps/desktop/package.json"));

assert.equal(pkg.version, "1.0.5");
assert.match(updater, /minarvabiz-update-v1/);
assert.match(updater, /github\.com/);
assert.match(updater, /evertekitsolutions-del\/minarvabiz\/releases\/download/);
assert.match(config, /MINARVA_LICENSE_PUBLIC_KEY_HEX/);
assert.match(route, /releases\/latest/);
assert.match(route, /signTextBase64Url/);
assert.match(route, /MinarvaBiz-Setup-/);
assert.match(signing, /signTextBase64Url/);
assert.match(deep, /MINARVA_UPDATE_MANIFEST_URL/);
assert.match(release, /MINARVA_UPDATE_MANIFEST_URL/);
assert.match(release, /contents: read/);
assert.match(publisher, /workflow_run/);
assert.match(publisher, /contents: write/);
assert.match(publisher, /gh release create/);

console.log("Secure Windows update channel contract PASS");
