import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(new URL("../apps/web/src/app/(app)/tools/page.tsx", import.meta.url), "utf8");
assert.match(source, /importProductsFromCsv\(text\)/);
assert.match(source, /catch\s*\{/);
assert.match(source, /finally\s*\{\s*input\.value = ""/);
assert.match(source, /role="status" aria-live="polite"/);
assert.match(source, /const input = e\.currentTarget/);
console.log("Product CSV frontend error handling PASS");
