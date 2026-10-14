import assert from "node:assert/strict";
import fs from "node:fs";
import { exportSalesHistoryCsv } from "../sales-history-csv.ts";

const row = (patch = {}) => ({
  saleDate: "2026-10-14T13:30:00.000Z",
  invoiceNumber: "INV-2026-001",
  customerName: "Walk-in",
  status: "completed",
  subtotal: 150,
  discountAmount: 10,
  taxAmount: 7,
  total: 147,
  paidAmount: 100,
  balanceAmount: 47,
  items: [{ productName: "Cotton, Grade \"A\"" }],
  notes: "Customer requested a printed copy",
  ...patch,
});

const original = row();
const input = [original, row({
  invoiceNumber: "=HYPERLINK(\"https://malicious.invalid\")",
  customerName: " \t@customer",
  status: "returned",
  notes: "\n+SUM(1,1)",
  items: [{ productName: "-malicious" }],
  total: 0,
  paidAmount: 0,
  balanceAmount: 0,
})];

const before = JSON.stringify(input);
const csv = exportSalesHistoryCsv(input);
assert.equal(JSON.stringify(input), before, "export must not mutate invoice objects");
assert.match(csv, /^invoice_date,invoice_number,customer,status,subtotal,discount,tax,total,paid,balance,products,notes\n/);
assert.match(csv, /INV-2026-001,Walk-in,completed,150,10,7,147,100,47,"Cotton, Grade ""A"""/);
assert.ok(csv.includes("\"'=HYPERLINK(\"\"https://malicious.invalid\"\")\""), "invoice formulas must be escaped");
assert.ok(csv.includes("' \t@customer"), "whitespace-prefixed formula payloads must be inert");
assert.ok(csv.includes("\"'\n+SUM(1,1)\""), "newlines must not start executable CSV cells");
assert.ok(csv.includes("'-malicious"), "product names that start with a formula prefix must be inert");
assert.equal(exportSalesHistoryCsv([]), "invoice_date,invoice_number,customer,status,subtotal,discount,tax,total,paid,balance,products,notes\n");
assert.throws(() => exportSalesHistoryCsv([row({ total: Infinity })]), /invalid numeric amount/);
assert.throws(() => exportSalesHistoryCsv([row({ taxAmount: NaN })]), /invalid numeric amount/);

const ui = fs.readFileSync(new URL("../../../ui/src/components/sales/SalesList.tsx", import.meta.url), "utf8");
assert.match(ui, /exportSalesHistoryCsv\(filteredSales\)/, "export must use the same filtered sales as the table");
assert.match(ui, /disabled=\{filteredSales\.length === 0\}/, "empty export must be blocked");
assert.match(ui, /onClick=\{downloadFilteredCsv\}/);
assert.match(ui, /String\.fromCharCode\(0xfeff\)/, "Excel must receive a UTF-8 BOM");
assert.match(ui, /URL\.revokeObjectURL\(url\)/, "download URL must be cleaned up");
console.log("Filtered invoice CSV functional and UI wiring tests PASS");
