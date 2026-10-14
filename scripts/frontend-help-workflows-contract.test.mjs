import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../apps/web/src/app/(app)/help/page.tsx", import.meta.url), "utf8");
for (const route of ["/inventory", "/sales", "/purchases", "/accounting", "/backup", "/support"]) {
  assert.ok(page.includes('href: "' + route + '"'), "Help workflow missing route: " + route);
}
assert.match(page, /import Link from "next\/link"/);
assert.match(page, /href=\{workflow\.href\}/);
assert.match(page, /POS_SHORTCUTS\.map/);
assert.match(page, /<dl/);
assert.match(page, /aria-labelledby="help-troubleshooting"/);
assert.doesNotMatch(page, /href: "http/, "Help workflows must link within the app");
console.log("Help workflow frontend contract PASS");
