import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const ui = read("packages/ui/src/components/returns/ReturnsPanel.tsx");
const core = read("packages/business-logic/src/phase7-store.ts");

for (const token of [
  "Search return, invoice, customer or product",
  "All customers",
  "All types",
  "All reasons",
  "Refund method",
  "Clear filters",
  "Original invoice",
  "Return value",
  "Restocked",
  "Traceability:",
  "replacement sale",
]) assert.equal(ui.includes(token), true, `Missing return traceability UI: ${token}`);

assert.equal(ui.includes("filteredReturns"), true);
assert.equal(ui.includes("detailReturn"), true);
assert.equal(ui.includes("exchangeInvoiceNumber"), true);
assert.equal(ui.includes("refundAmount"), true);

for (const token of [
  "planReturnPosting",
  "applyStockMovement",
  'recordRefundPayment',
  'enqueueOutbox("returns"',
  'audit("sale.return"',
  "receivableReduction",
  "refundMethod",
]) assert.equal(core.includes(token), true, `Missing return accounting/traceability core behavior: ${token}`);

assert.equal(core.includes("saleId: sale.id"), true);
assert.equal(core.includes("invoiceNumber: sale.invoiceNumber"), true);

console.log("Returns/refunds traceability contract PASS");
