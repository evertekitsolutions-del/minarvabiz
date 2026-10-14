import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../apps/web/src/app/reset-password/page.tsx", import.meta.url),"utf8");
assert.ok(source.includes('const linkType = hash.get("type") || query.get("type")'));
assert.ok(source.includes('linkType && linkType !== "recovery" ? "" : token'));
assert.ok(source.includes('"token_type"'));
assert.ok(source.includes('window.history.replaceState(null, "", sanitized)'));
console.log("Recovery token purpose and URL hygiene PASS");
