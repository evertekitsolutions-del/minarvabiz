import assert from "node:assert/strict";
import fs from "node:fs";
import { exportPaymentHistoryCsv } from "../payment-history-csv.ts";

const row = (changes = {}) => ({
  id: "PAY-001",
  paidAt: "2026-10-15T12:00:00Z",
  amount: 120.5,
  method: "upi",
  referenceType: "sale",
  referenceId: "INV-001",
  notes: "Sales collection",
  counterparty: "Customer, \"A\"",
  direction: "inflow",
  ...changes,
});
const payments = [
  row(),
  row({ id: "=HYPERLINK(\"https://invalid.example\")", counterparty: " \t@formula", notes: "\n+SUM(1,1)", direction: "outflow", referenceType: "refund", amount: 40 }),
];
const before = JSON.stringify(payments);
const csv = exportPaymentHistoryCsv(payments);
assert.equal(JSON.stringify(payments), before, "export cannot mutate financial records");
assert.match(csv, /^date,payment_id,direction,counterparty,source,method,amount,signed_amount,reference_id,allocation_notes\n/);
assert.ok(csv.includes('"Customer, ""A"""'));
assert.ok(csv.includes("\"'=HYPERLINK(\"\"https://invalid.example\"\")\""));
assert.ok(csv.includes("' \t@formula"));
assert.ok(csv.includes("\"'\n+SUM(1,1)\""));
assert.ok(csv.includes(",outflow,"), "refund direction preserved");
assert.ok(csv.includes(",40,-40,"), "outflow signed cash impact exported");
assert.ok(csv.includes(",120.5,120.5,"), "inflow positive impact exported");
assert.equal(exportPaymentHistoryCsv([]), "date,payment_id,direction,counterparty,source,method,amount,signed_amount,reference_id,allocation_notes\n");
assert.throws(() => exportPaymentHistoryCsv([row({ amount: NaN })]), /invalid amount/);
assert.throws(() => exportPaymentHistoryCsv([row({ amount: Infinity })]), /invalid amount/);
assert.throws(() => exportPaymentHistoryCsv([row({ amount: -1 })]), /invalid amount/);
assert.throws(() => exportPaymentHistoryCsv([row({ direction: "unknown" })]), /invalid direction/);

const ui = fs.readFileSync(new URL("../../../ui/src/components/payments/PaymentsPanel.tsx", import.meta.url), "utf8");
assert.match(ui, /exportPaymentHistoryCsv\(filteredPayments\.map\(\(payment\) => \(\{/);
assert.match(ui, /direction: paymentDirection\(payment\)/);
assert.match(ui, /counterparty: counterpartyName\(payment\)/);
assert.match(ui, /disabled=\{filteredPayments\.length === 0\}/);
assert.match(ui, /onClick=\{downloadFilteredPaymentHistoryCsv\}/);
assert.match(ui, /String\.fromCharCode\(0xfeff\)/);
assert.match(ui, /URL\.revokeObjectURL\(url\)/);
console.log("Payment history CSV sign, formula-safety and filtered UI linkage PASS");
