import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const purchaseList = read("packages/ui/src/components/expenses/ExpenseList.tsx");
const procurement = read("packages/ui/src/components/purchases/ProcurementPanel.tsx");
const logic = read("packages/business-logic/src/procurement-store.ts");
const desktop = read("apps/desktop/src/App.tsx");
const web = read("apps/web/src/app/(app)/purchases/page.tsx");

for (const token of [
  "Search purchase, supplier, description or order",
  "All suppliers",
  "All kinds",
  "Outstanding only",
  "No purchases match the selected filters",
]) assert.equal(purchaseList.includes(token), true, `Missing direct-purchase control: ${token}`);

for (const token of [
  "Search PO, supplier or item",
  "Search invoice, supplier ref or PO",
  "No purchase orders match the selected filters",
  "No supplier invoices match the selected filters",
  "Cancellation reason *",
  "Paid or partially paid invoices stay immutable",
]) assert.equal(procurement.includes(token), true, `Missing procurement/AP control: ${token}`);

assert.match(logic, /cancelPurchaseOrder\(id: UUID, reason: string\)/);
assert.match(logic, /cancelPurchaseInvoice\(id: UUID, reason: string\)/);
assert.equal(logic.includes("Cancellation reason is required"), true);
assert.equal(logic.includes("Paid supplier invoice cannot be cancelled"), true);
assert.equal(logic.includes("cancellationReason"), true);

assert.equal(desktop.includes("cancelPurchaseOrder(id,reason)"), true);
assert.equal(desktop.includes("cancelPurchaseInvoice(id,reason)"), true);
assert.equal(web.includes("cancelPurchaseOrder(id, reason)"), true);
assert.equal(web.includes("cancelPurchaseInvoice(id, reason)"), true);
assert.equal(web.includes("suppliers={suppliers}"), true);

console.log("Purchases/AP record management contract PASS");
