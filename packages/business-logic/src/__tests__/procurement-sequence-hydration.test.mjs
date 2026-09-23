import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../procurement-store.ts", import.meta.url), "utf8");

assert.match(source, /function inferDocumentSequence\(numbers: string\[\]\): number/);
assert.match(source, /const match = \/\(\\d\+\)\$\/.exec\(number\)/);
assert.match(source, /Number\.parseInt\(match\[1\] \?\? "", 10\)/);
assert.match(source, /Number\.isSafeInteger\(sequence\) && sequence > max/);

assert.match(source, /function explicitSequence\(value: number \| undefined\): number/);
assert.match(source, /Number\.isFinite\(value\)/);
assert.match(source, /Math\.max\(0, Math\.floor\(value\)\)/);

const hydrateStart = source.indexOf("export function hydrateProcurementState");
const exportStart = source.indexOf("export function exportProcurementState", hydrateStart);
assert.ok(hydrateStart >= 0 && exportStart > hydrateStart, "hydrateProcurementState must exist");
const hydrate = source.slice(hydrateStart, exportStart);

for (const [sequenceName, collection, numberField] of [
  ["poSequence", "purchaseOrders", "poNumber"],
  ["grnSequence", "goodsReceipts", "grnNumber"],
  ["invoiceSequence", "purchaseInvoices", "invoiceNumber"],
]) {
  assert.match(
    hydrate,
    new RegExp(sequenceName + " = Math\\.max\\([\\s\\S]*explicitSequence\\(input\\." + sequenceName + "\\)[\\s\\S]*inferDocumentSequence\\(input\\." + collection + "\\." + "map")
  );
  assert.match(
    hydrate,
    new RegExp("inferDocumentSequence\\(input\\." + collection + "\\.map\\(\\([^)]*\\) => [^)]*\\." + numberField + "\\)\\)")
  );
  assert.match(
    hydrate,
    new RegExp("typeof input\\." + sequenceName + ' === "number" && Number\\.isFinite\\(input\\.' + sequenceName + "\\)")
  );
}

function infer(numbers) {
  let max = 0;
  for (const number of numbers) {
    const match = /(\d+)$/.exec(number);
    if (!match) continue;
    const sequence = Number.parseInt(match[1] ?? "", 10);
    if (Number.isSafeInteger(sequence) && sequence > max) max = sequence;
  }
  return max;
}
const explicit = (value) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

assert.equal(Math.max(explicit(2), infer(["PO-2026-00007"])), 7);
assert.equal(Math.max(explicit(12.9), infer(["GRN-2026-00003"])), 12);
assert.equal(Math.max(explicit(NaN), infer(["PINV-2026-00009"])), 9);
assert.equal(Math.max(explicit(-4), infer([])), 0);

console.log("Procurement sequence hydration contract tests passed");
