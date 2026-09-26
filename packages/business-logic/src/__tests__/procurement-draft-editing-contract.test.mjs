import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const logic = read("packages/business-logic/src/procurement-store.ts");
const ui = read("packages/ui/src/components/purchases/ProcurementPanel.tsx");
const desktop = read("apps/desktop/src/App.tsx");
const web = read("apps/web/src/app/(app)/purchases/page.tsx");

assert.match(logic, /export function updatePurchaseOrder/);
assert.match(logic, /Only draft purchase orders can be edited/);
assert.match(logic, /auditAction\("purchase_order\.update"/);
assert.match(logic, /export function updatePurchaseInvoice/);
assert.match(logic, /Only draft supplier invoices can be edited/);
assert.match(logic, /alreadyInvoicedQuantity\(poLine\.id, invoice\.id\)/);
assert.match(logic, /getInvoiceablePurchaseOrderLines\(purchaseOrderId: UUID, excludeInvoiceId\?: UUID\)/);
assert.match(logic, /auditAction\("purchase_invoice\.update"/);

for (const token of [
  "Edit draft purchase order",
  "Edit draft supplier invoice",
  "Save draft changes",
  "Only draft purchase orders are editable",
  "Only draft supplier invoices are editable",
]) assert.equal(ui.includes(token), true, `Missing draft procurement UI token: ${token}`);

assert.match(ui, /po\.status === "draft".*openPoEditor/s);
assert.match(ui, /invoice\.status === "draft".*openInvoiceEditor/s);
assert.match(desktop, /procurementStore\.updatePurchaseOrder/);
assert.match(desktop, /procurementStore\.updatePurchaseInvoice/);
assert.match(web, /procurementStore\.updatePurchaseOrder/);
assert.match(web, /procurementStore\.updatePurchaseInvoice/);
assert.match(web, /getInvoiceablePurchaseOrderLines\(purchaseOrderId, excludeInvoiceId\)/);

console.log("Procurement draft editing contract PASS");
