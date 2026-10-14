import assert from "node:assert/strict";
import fs from "node:fs";
import { isValidDefaultTaxRate, parseDefaultTaxRateInput } from "../tax-rate-validation.ts";

for (const rate of [0, 0.1, 2.5, 5, 12, 18, 28, 100]) {
  assert.equal(isValidDefaultTaxRate(rate), true);
  assert.equal(parseDefaultTaxRateInput(String(rate)), rate);
}
assert.equal(parseDefaultTaxRateInput(" .5 "), 0.5);
for (const rate of [-1, Infinity, -Infinity, NaN, 101]) {
  assert.equal(isValidDefaultTaxRate(rate), false);
}
for (const input of ["", " ", "-1", "101", "NaN", "Infinity", "12abc", "1e309", "0x10", "1,000", "100.01"]) {
  assert.throws(() => parseDefaultTaxRateInput(input), /valid tax rate|between 0% and 100%/);
}

const taxConfig = fs.readFileSync(new URL("../tax-config.ts", import.meta.url), "utf8");
const toolsUi = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/tools/page.tsx", import.meta.url), "utf8");
assert.match(taxConfig, /patch\.defaultRatePercent !== undefined && !isValidDefaultTaxRate\(patch\.defaultRatePercent\)/);
assert.match(toolsUi, /function saveDefaultTaxRate\(\)/);
assert.match(toolsUi, /parseDefaultTaxRateInput\(rateDraft\)/);
assert.match(toolsUi, /onClick=\{saveDefaultTaxRate\}/);
assert.doesNotMatch(toolsUi, /parseFloat\(e\.target\.value\) \|\| 0/);
assert.match(toolsUi, /id="default-tax-rate-error" role="alert"/);
console.log("Default GST rate numeric validation and explicit-save frontend contract PASS");
