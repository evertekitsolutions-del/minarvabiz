import assert from "node:assert/strict";
import fs from "node:fs";

const sales = fs.readFileSync(new URL("../sales.ts", import.meta.url), "utf8");

const start = sales.indexOf("export function validateCart");
const end = sales.indexOf("/**\n * Generate a daily invoice number", start);
assert.ok(start >= 0 && end > start, "validateCart must exist");
const validateCart = sales.slice(start, end);

assert.match(validateCart, /!Number\.isFinite\(line\.discountPercent\)/);
assert.match(validateCart, /discount must be a finite number/);
assert.match(validateCart, /!Number\.isFinite\(line\.taxRate\)/);
assert.match(validateCart, /tax rate must be a finite number/);

console.log("POS finite discount/tax contract tests passed");
