import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);
const core = require("../store.ts"), vendors = require("../phase5-store.ts");
const procurement = require("../procurement-store.ts"), ledger = require("../accounting-store.ts");
const refunds = require("../phase7-store.ts"), persistence = require("../persistence.ts");
const permissions = require("../permissions.ts"), remote = require("../remote-write.ts");
const outbox = require("../outbox-bridge.ts"), warehouse = require("../warehouse-store.ts");
const chart = structuredClone(ledger.exportAccountingState().accounts);
permissions.setCurrentRole("admin"); permissions.setRuntimeFeaturePolicy(null); remote.registerRemoteWriter(null);
function reset() {
  ledger.hydrateAccountingState({ accounts: structuredClone(chart), journals: [], journalSequence: 0 });
  core.hydrateCore({ products: ["fabric", "lining"].map(id => ({ id, name: id, stockQuantity: 0,
    costPrice: 50, sellingPrice: 100, isActive: true, version: 1 })), sales: [], payments: [],
    customers: [{ id: "buyer", name: "Buyer", totalSpending: 0, outstandingBalance: 0, version: 1 }] });
  vendors.hydratePhase5({ suppliers: [{ id: "vendor", name: "Vendor", outstandingBalance: 0, version: 1 }], purchases: [] });
  procurement.hydrateProcurementState({ purchaseOrders: [], goodsReceipts: [], purchaseInvoices: [] });
  warehouse.hydrateWarehouseState({ warehouses: [], locations: [], stock: [], transfers: [] });
  refunds.hydratePhase7({ returns: [], auditLogs: [] }); outbox.hydrateOutbox([]);
}
function order(ids = ["fabric"], quantity = 3) {
  const made = procurement.createPurchaseOrder({ supplierId: "vendor", lines: ids.map(productId => ({
    productId, description: productId, quantity, unitCost: 50, taxRate: 0,
  })) });
  assert.deepEqual(made.errors, []);
  assert.equal(procurement.approvePurchaseOrder(made.purchaseOrder.id).error, undefined);
  return made.purchaseOrder;
}
function receive(po, quantity) {
  return procurement.receivePurchaseOrder({ purchaseOrderId: po.id,
    lines: po.lines.map(line => ({ purchaseOrderLineId: line.id, quantity })) });
}
const cart = (quantity, unitPrice = 100) => ({ productId: "fabric", productName: "fabric", quantity,
  unitPrice, costPrice: 50, stockQuantity: core.getProduct("fabric").stockQuantity, discountPercent: 0, taxRate: 0 });
const balance = key => {
  const a = ledger.getSystemAccount(key), row = ledger.buildTrialBalance().find(x => x.accountId === a.id);
  return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0)) * 100) / 100;
};
const fingerprint = () => JSON.stringify({ core: [core.listProducts(), core.listSales(), core.listCustomers(), core.listPayments()],
  vendors: vendors.listSuppliers(), procurement: procurement.exportProcurementState(), ledger: ledger.exportAccountingState(),
  returns: refunds.listReturns(), outbox: outbox.exportOutbox() });

test("commercial journey: partial receipts and supplier settlement through sale, refund, exchange and fresh-process restore", () => {
  reset(); const po = order();
  assert.deepEqual(receive(po, 1.25).errors, []);
  assert.deepEqual(receive(po, 1.75).errors, []);
  const bill = procurement.createPurchaseInvoice({ purchaseOrderId: po.id, invoiceDate: "2026-10-13",
    lines: [{ purchaseOrderLineId: po.lines[0].id, quantity: 3 }] }).purchaseInvoice;
  assert.equal(procurement.postPurchaseInvoice(bill.id).error, undefined);
  assert.equal(procurement.payPurchaseInvoice({ purchaseInvoiceId: bill.id, amount: 50, paymentMethod: "bank" }).error, undefined);
  assert.deepEqual(vendors.recordSupplierPayment({ supplierId: "vendor", amount: 100, paymentMethod: "cash" }).errors, []);
  assert.equal(balance("accounts_payable"), 0); assert.equal(balance("inventory_asset"), 150);
  permissions.setCurrentRole("cashier");
  const sale = core.createSale({ customerId: "buyer", lines: [cart(1.25)], paidAmount: 125, paymentMethod: "cash",
    paymentSplits: [{ method: "cash", amount: 80 }, { method: "card", amount: 45 }] });
  assert.deepEqual(sale.errors, []); permissions.setCurrentRole("admin");
  const selected = quantity => ({ saleItemId: sale.sale.items[0].id, productId: "fabric", productName: "fabric", quantity, unitPrice: 100, restock: true });
  const partial = refunds.createReturn({ saleId: sale.sale.id, reason: "other", refundMethod: "cash", items: [selected(0.25)] });
  assert.deepEqual(partial.errors, []);
  const exchange = refunds.createExchange({ saleId: sale.sale.id, reason: "other", refundMethod: "cash", paymentMethod: "cash",
    returnItems: [selected(0.5)], replacementLines: [cart(0.5, 80)], additionalPaidAmount: 0 });
  assert.deepEqual(exchange.errors, []); assert.equal(exchange.extraRefund, 10);
  assert.equal(core.getProduct("fabric").stockQuantity, 2);
  assert.equal(balance("inventory_asset"), 100); assert.equal(balance("cogs"), 50);
  assert.equal(balance("product_sales"), -90); assert.equal(balance("accounts_receivable"), 0);
  assert.equal(balance("cash"), -55); assert.equal(balance("payment_clearing"), 45); assert.equal(balance("bank"), -50);
  assert.equal(ledger.buildProfitAndLoss().netProfit, 40); assert.equal(ledger.buildBalanceSheet().balanced, true);
  const snapshot = persistence.exportDomainSnapshotJson();
  assert.ok(outbox.listPendingOutbox().length > 0, "offline journal is retained for later authorized sync");
  const runner = `const fs=require('node:fs'),ts=require('typescript');require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,p);const p=require('../persistence.ts');const r=p.importDomainSnapshotJson(fs.readFileSync(0,'utf8'));if(!r.ok)throw Error(r.error);process.stdout.write(p.exportDomainSnapshotJson());`;
  const restored = JSON.parse(execFileSync(process.execPath, ["-e", runner], {
    cwd: fileURLToPath(new URL(".", import.meta.url)), input: snapshot, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  }));
  const before = JSON.parse(snapshot);
  for (const field of ["products", "sales", "payments", "returns", "suppliers", "customers", "procurement", "accounting", "outbox"])
    assert.deepEqual(restored[field], before[field], `${field} must survive actual process restart`);
});

test("goods receipt rejects unsafe later stock without advancing earlier products or PO quantities", () => {
  reset(); const po = order(["fabric", "lining"], 1);
  core.getProduct("lining").stockQuantity = Infinity;
  const before = fingerprint();
  const result = receive(po, 1);
  assert.ok(result.errors.length > 0); assert.equal(result.goodsReceipt, null);
  assert.equal(fingerprint(), before);
});

test("refund rejects sub-milli and unsafe input without consuming history or changing invoices", () => {
  reset(); const po = order(); assert.deepEqual(receive(po, 3).errors, []);
  const sale = core.createSale({ customerId: "buyer", lines: [cart(1)], paidAmount: 100, paymentMethod: "cash" }).sale;
  for (const quantity of [0.0004, 0.1004, 1e20]) {
    const before = fingerprint();
    const result = refunds.createReturn({ saleId: sale.id, reason: "other", refundMethod: "cash",
      items: [{ saleItemId: sale.items[0].id, productId: "fabric", productName: "fabric", quantity, unitPrice: 100, restock: true }] });
    assert.ok(result.errors.length > 0); assert.equal(result.ret, null); assert.equal(fingerprint(), before);
  }
});

test("refused receipt can be corrected and retried once with unchanged received quantities", () => {
  reset(); const po = order(["fabric", "lining"], 1);
  core.getProduct("lining").stockQuantity = NaN;
  assert.ok(receive(po, 1).errors.length);
  core.getProduct("lining").stockQuantity = 0;
  assert.deepEqual(receive(po, 1).errors, []);
  const after = fingerprint();
  assert.ok(receive(po, 1).errors.length, "completed PO cannot receive twice");
  assert.equal(fingerprint(), after);
  assert.equal(core.getProduct("fabric").stockQuantity, 1);
  assert.equal(core.getProduct("lining").stockQuantity, 1);
});

test("same-product receipt lines are checked cumulatively before any stock update", () => {
  reset(); const po = order(["fabric", "fabric"], 0.5);
  core.getProduct("fabric").stockQuantity = 9007199254740;
  const before = fingerprint();
  assert.ok(receive(po, 0.5).errors.length);
  assert.equal(fingerprint(), before);
});

test("cashier cannot receive goods and denied actions preserve the commercial workflow", () => {
  reset(); const po = order(); const before = fingerprint();
  permissions.setCurrentRole("cashier");
  try { assert.throws(() => receive(po, 3), /denied/i); }
  finally { permissions.setCurrentRole("admin"); }
  assert.equal(fingerprint(), before);
});

test("invalid refund precision also blocks exchange before returning the original invoice", () => {
  reset(); const po = order(); assert.deepEqual(receive(po, 3).errors, []);
  const sale = core.createSale({ lines: [cart(1)], paidAmount: 100, paymentMethod: "cash" }).sale;
  const before = fingerprint();
  const result = refunds.createExchange({ saleId: sale.id, reason: "other", refundMethod: "cash", paymentMethod: "cash",
    returnItems: [{ saleItemId: sale.items[0].id, productId: "fabric", productName: "fabric", quantity: 0.1004, unitPrice: 100, restock: true }],
    replacementLines: [cart(0.1)], additionalPaidAmount: 0 });
  assert.ok(result.errors.length); assert.equal(result.ret, null); assert.equal(fingerprint(), before);
});
