import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../apps/web/src/app/(app)/notifications/page.tsx",import.meta.url),"utf8");
assert.match(source,/function isSafeInternalPath/);
assert.ok(source.includes('href.startsWith("/")'));
assert.ok(source.includes('!href.startsWith("//")'));
assert.ok(source.includes('!href.includes("\\\\")'));
assert.ok(source.includes('if (isSafeInternalPath(href)) router.push(href)'));
console.log("Safe notification navigation contract PASS");
