import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync(
  new URL("../../../business-logic/package.json", import.meta.url), "utf8",
));
const barrel = fs.readFileSync(new URL("../index.ts", import.meta.url), "utf8");

test("SAL-007 trusted host coordinator is accessible only via explicit package subpath", () => {
  assert.equal(pkg.exports["./recurring-invoice-workspace-host"],
    "./src/recurring-invoice-workspace-host.ts");
  assert.doesNotMatch(barrel, /export \* from "\.\/recurring-invoice-workspace-host"/,
    "the shared POS/UI barrel must not import host-side workflow authority");
  assert.match(barrel, /export \* from "\.\/recurring-invoice-source"/,
    "safe pure source validation remains available to all supported hosts");
});
