import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../procurement-store.ts", import.meta.url), "utf8");

function block(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.ok(start >= 0 && end > start, startNeedle + " block must exist");
  return source.slice(start, end);
}

const po = block("export function createPurchaseOrder", "function findMutable");
const invoice = block("export function createPurchaseInvoice", "export function postPurchaseInvoice");

assert.match(po, /const rawTaxRate = item\.taxRate == null \? 0 : Number\(item\.taxRate\)/);
assert.match(po, /!Number\.isFinite\(rawTaxRate\).*tax rate must be a finite number/);
assert.ok(
  po.indexOf("!Number.isFinite(rawTaxRate)") < po.indexOf("const taxAmount"),
  "PO tax-rate validation must run before tax calculation"
);

assert.match(invoice, /const rawTaxRate = item\.taxRate == null \? poLine\.taxRate : Number\(item\.taxRate\)/);
assert.match(invoice, /!Number\.isFinite\(rawTaxRate\).*tax rate must be a finite number/);
assert.match(invoice, /const taxRate = r2\(Math\.max\(0, rawTaxRate\)\)/);
assert.ok(
  invoice.indexOf("!Number.isFinite(rawTaxRate)") < invoice.indexOf("const taxAmount"),
  "Supplier-invoice tax-rate validation must run before tax calculation"
);

console.log("Procurement finite tax-rate contract tests passed");
