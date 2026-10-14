import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(new URL("../apps/web/src/app/(app)/tools/page.tsx", import.meta.url), "utf8");
assert.match(source, /importProductsFromCsv\(text\)/);
assert.match(source, /catch\s*\{/);
assert.match(source, /finally\s*\{\s*input\.value = ""/);
assert.match(source, /role="status" aria-live="polite"/);
assert.match(source, /const input = e\.currentTarget/);
console.log("Product CSV frontend error handling PASS");

const customers = fs.readFileSync(new URL("../apps/web/src/app/(app)/customers/page.tsx", import.meta.url), "utf8");
const confirm = customers.match(/function confirmCustomerCsv\(\) \{([\s\S]*?)\n  \}\n\n  function openCreate/);
assert.ok(confirm, "Customer import confirmation must remain testable");
assert.match(confirm[1], /catch\s*\(error\)\s*\{/);
assert.match(confirm[1], /setCsvStatusIsError\(true\)/);
assert.match(confirm[1], /setCsvBusy\(false\)/);
assert.match(confirm[1], /setCsvPreview\(null\)/);
assert.match(customers, /role=\{csvStatusIsError \? "alert" : "status"\}/);
assert.match(customers, /const lastSearchRef = React\.useRef\(""{0,1}\)/);
assert.match(customers, /if \(nextQuery !== undefined\) lastSearchRef\.current = nextQuery/);
assert.match(customers, /store\.listCustomers\(lastSearchRef\.current\)/);
assert.match(customers, /setProfile\(phase6Store\.getCustomerCrmProfile\(editTarget\.id\)\)/);
console.log("Customer CSV error recovery and persistent list search contract PASS");

for (const [label, relativePath] of [
  ["customers", "../apps/web/src/app/(app)/customers/page.tsx"],
  ["products", "../apps/web/src/app/(app)/products/page.tsx"],
]) {
  const page = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const literal = page.match(/"name,[^"]+"/)?.[0];
  assert.ok(literal, `${label} download template string exists`);
  const csv = JSON.parse(literal);
  assert.equal(csv.split("\n").filter(Boolean).length, 2, `${label} CSV template must have header and sample row`);
  assert.doesNotMatch(csv, /\\n/, `${label} template must not export literal backslash-n text`);
}
console.log("Customer and product downloadable CSV templates contain proper record separators");
