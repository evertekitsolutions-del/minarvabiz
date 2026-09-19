import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../procurement-store.ts", import.meta.url), "utf8");
const types = fs.readFileSync(new URL("../../../types/src/index.ts", import.meta.url), "utf8");
const persistence = fs.readFileSync(new URL("../persistence.ts", import.meta.url), "utf8");
const remote = fs.readFileSync(new URL("../remote-write.ts", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../../../ui/src/components/purchases/ProcurementPanel.tsx", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../../../supabase/migrations/20260919_purchase_invoices_ap.sql", import.meta.url), "utf8");
const syncAdapter = fs.readFileSync(new URL("../../../sync/src/supabase-adapter.ts", import.meta.url), "utf8");

assert.match(types, /PurchaseInvoiceStatus/);
assert.match(types, /interface PurchaseInvoice/);
assert.match(types, /interface SupplierPayableAging/);
assert.match(source, /createPurchaseInvoice/);
assert.match(source, /postPurchaseInvoice/);
assert.match(source, /payPurchaseInvoice/);
assert.match(source, /cancelPurchaseInvoice/);
assert.match(source, /getInvoiceablePurchaseOrderLines/);
assert.match(source, /buildSupplierPayableAging/);
assert.match(source, /receivedQuantity - alreadyInvoicedQuantity/);
assert.match(source, /recordSupplierPayment/);
assert.match(source, /auditAction\("purchase_invoice\.post"/);
assert.match(remote, /remoteUpsertPurchaseInvoice/);
assert.match(remote, /enqueueOutbox\("purchase_invoices"/);
assert.match(syncAdapter, /case "purchase_invoices"/);
assert.match(syncAdapter, /case "purchase_invoice_lines"/);
assert.match(syncAdapter, /"purchase_invoices", "purchase_invoice_lines"/);
assert.match(persistence, /SNAPSHOT_VERSION = 11/);
assert.match(ui, /Supplier Invoices \/ Accounts Payable/);
assert.match(ui, /AP Aging/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.purchase_invoices/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.purchase_invoice_lines/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /organization_members/);

console.log("Procurement purchase-invoice/AP contract tests passed");
