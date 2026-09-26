import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  filename
);

const permissions = require("../permissions.ts");
const store = require("../store.ts");
const phase5 = require("../phase5-store.ts");
const procurement = require("../procurement-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;
accounting.hydrateAccountingState({ accounts: chart, journals: [], journalSequence: 0 });
phase5.hydratePhase5({ suppliers: [{ id: "s1", name: "Supplier One", outstandingBalance: 0 }], purchases: [] });
store.hydrateCore({ products: [{ id: "p1", name: "Fabric", costPrice: 50, stockQuantity: 0, version: 1 }], payments: [] });
procurement.hydrateProcurementState({ purchaseOrders: [], goodsReceipts: [], purchaseInvoices: [] });
outbox.hydrateOutbox([]);

const createdPo = procurement.createPurchaseOrder({
  supplierId: "s1",
  lines: [{ productId: "p1", description: "Fabric", quantity: 2, unitCost: 50, taxRate: 10 }],
});
assert.deepEqual(createdPo.errors, []);
assert.equal(procurement.canEditPurchaseOrder(createdPo.purchaseOrder), true);

const editedPo = procurement.updatePurchaseOrder(createdPo.purchaseOrder.id, {
  supplierId: "s1",
  expectedDeliveryDate: "2026-10-10",
  lines: [{ productId: "p1", description: "Fabric premium", quantity: 3, unitCost: 60, taxRate: 10 }],
  notes: "Draft correction",
});
assert.deepEqual(editedPo.errors, []);
assert.equal(editedPo.purchaseOrder.lines[0].orderedQuantity, 3);
assert.equal(editedPo.purchaseOrder.total, 198);
assert.equal(editedPo.purchaseOrder.expectedDeliveryDate, "2026-10-10");
assert.equal(editedPo.purchaseOrder.version, 2);

assert.equal(procurement.approvePurchaseOrder(editedPo.purchaseOrder.id).error, undefined);
assert.match(procurement.updatePurchaseOrder(editedPo.purchaseOrder.id, {
  supplierId: "s1",
  lines: [{ productId: "p1", description: "Blocked", quantity: 1, unitCost: 1, taxRate: 0 }],
}).errors.join(";"), /Only draft purchase orders can be edited/);

const approved = procurement.getPurchaseOrder(editedPo.purchaseOrder.id);
const received = procurement.receivePurchaseOrder({
  purchaseOrderId: approved.id,
  lines: [{ purchaseOrderLineId: approved.lines[0].id, quantity: 3 }],
});
assert.deepEqual(received.errors, []);

const createdInvoice = procurement.createPurchaseInvoice({
  purchaseOrderId: approved.id,
  supplierInvoiceNumber: "SUP-001",
  invoiceDate: "2026-09-26",
  dueDate: "2026-10-15",
  lines: [{ purchaseOrderLineId: approved.lines[0].id, quantity: 2 }],
});
assert.deepEqual(createdInvoice.errors, []);
assert.equal(procurement.canEditPurchaseInvoice(createdInvoice.purchaseInvoice), true);

const withoutOwn = procurement.getInvoiceablePurchaseOrderLines(approved.id);
const withOwnExcluded = procurement.getInvoiceablePurchaseOrderLines(approved.id, createdInvoice.purchaseInvoice.id);
assert.equal(withoutOwn[0].invoiceableQuantity, 1);
assert.equal(withOwnExcluded[0].invoiceableQuantity, 3);

const editedInvoice = procurement.updatePurchaseInvoice(createdInvoice.purchaseInvoice.id, {
  supplierInvoiceNumber: "SUP-001-REV",
  invoiceDate: "2026-09-27",
  dueDate: "2026-10-20",
  lines: [{ purchaseOrderLineId: approved.lines[0].id, quantity: 3, unitCost: 65, taxRate: 5 }],
  notes: "Draft supplier correction",
});
assert.deepEqual(editedInvoice.errors, []);
assert.equal(editedInvoice.purchaseInvoice.supplierInvoiceNumber, "SUP-001-REV");
assert.equal(editedInvoice.purchaseInvoice.total, 204.75);
assert.equal(editedInvoice.purchaseInvoice.balanceAmount, 204.75);
assert.equal(editedInvoice.purchaseInvoice.version, 2);

assert.equal(procurement.postPurchaseInvoice(editedInvoice.purchaseInvoice.id).error, undefined);
assert.match(procurement.updatePurchaseInvoice(editedInvoice.purchaseInvoice.id, {
  lines: [{ purchaseOrderLineId: approved.lines[0].id, quantity: 1 }],
}).errors.join(";"), /Only draft supplier invoices can be edited/);

console.log("Procurement draft PO/supplier-invoice editing PASS");
