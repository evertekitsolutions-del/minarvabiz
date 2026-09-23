import assert from "node:assert/strict";
import fs from "node:fs";

const sales = fs.readFileSync(new URL("../sales.ts", import.meta.url), "utf8");

const start = sales.indexOf("export function validateCart");
const end = sales.indexOf("/**\n * Generate a daily invoice number", start);
assert.ok(start >= 0 && end > start, "validateCart must exist");
const validateCart = sales.slice(start, end);

assert.match(
  validateCart,
  /!Number\.isFinite\(line\.quantity\) \|\| line\.quantity <= 0/
);
assert.match(
  validateCart,
  /!Number\.isFinite\(line\.unitPrice\) \|\| line\.unitPrice < 0/
);
assert.match(validateCart, /quantity must be positive/);
assert.match(validateCart, /price cannot be negative/);

console.log("POS finite cart-value contract tests passed");
