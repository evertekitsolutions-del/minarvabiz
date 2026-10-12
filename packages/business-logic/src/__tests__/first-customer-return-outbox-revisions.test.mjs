import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  filename,
);
const core = require("../store.ts");
const phase7 = require("../phase7-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const accounts = structuredClone(accounting.exportAccountingState().accounts);

function setup() {
  accounting.hydrateAccountingState({ accounts: structuredClone(accounts), journals: [], journalSequence: 0 });
  core.hydrateCore({
    products: [{ id: "p", name: "Fabric", isActive: true, stockQuantity: 6, costPrice: 40, sellingPrice: 100, version: 5 }],
    customers: [{ id: "c", name: "Buyer", totalSpending: 0, outstandingBalance: 0, version: 8 }],
    sales: [], payments: [],
  });
  phase7.hydratePhase7({ returns: [], auditLogs: [] });
  outbox.hydrateOutbox([]);
  const created = core.createSale({
    customerId: "c",
    lines: [{ productId: "p", productName: "Fabric", quantity: 3, unitPrice: 100,
      costPrice: 40, stockQuantity: 6, taxRate: 0, discountPercent: 0 }],
    paidAmount: 300, paymentMethod: "cash",
  });
  assert.deepEqual(created.errors, []);
  assert.equal(created.sale.total, 300);
  outbox.hydrateOutbox([]);
  return created.sale;
}

function refund(sale, quantity = 1, restock = true) {
  return phase7.createReturn({
    saleId: sale.id,
    reason: "other",
    refundMethod: "cash",
    items: [{ saleItemId: sale.items[0].id, productId: "p", productName: "Fabric",
      quantity, unitPrice: 100, restock }],
  });
}
function events(kind) {
  return outbox.listPendingOutbox().filter(event => event.aggregateType === kind);
}

test("successive partial returns increment product and customer versions without rewriting prior outbox payloads", () => {
  const sale = setup();
  const baseProductVersion = core.getProduct("p").version;
  const baseCustomerVersion = core.getCustomer("c").version;
  const first = refund(sale);
  assert.deepEqual(first.errors, []);
  assert.equal(first.paidRefund, 100);
  assert.equal(core.getProduct("p").version, baseProductVersion + 1);
  assert.equal(core.getCustomer("c").version, baseCustomerVersion + 1);
  assert.equal(core.getProduct("p").stockQuantity, 4);
  const firstProduct = structuredClone(events("products")[0].payload);
  const firstCustomer = structuredClone(events("customers")[0].payload);
  const firstSale = structuredClone(events("sales")[0].payload);
  const firstReturn = structuredClone(events("returns")[0].payload);
  assert.equal(firstSale.total, 200);
  assert.equal(firstProduct.stockQuantity, 4);
  assert.equal(firstProduct.version, baseProductVersion + 1);
  assert.equal(firstCustomer.version, baseCustomerVersion + 1);
  assert.equal(firstReturn.totalRefund, 100);

  const second = refund(sale);
  assert.deepEqual(second.errors, []);
  assert.equal(core.getProduct("p").stockQuantity, 5);
  assert.equal(core.getProduct("p").version, baseProductVersion + 2);
  assert.equal(core.getCustomer("c").version, baseCustomerVersion + 2);
  assert.equal(events("products").length, 2);
  assert.equal(events("customers").length, 2);
  assert.equal(events("sales").length, 2);
  assert.deepEqual(events("products")[0].payload, firstProduct);
  assert.deepEqual(events("customers")[0].payload, firstCustomer);
  assert.deepEqual(events("sales")[0].payload, firstSale);
  assert.deepEqual(events("returns")[0].payload, firstReturn);
  assert.equal(events("products")[1].payload.version, baseProductVersion + 2);
  assert.equal(events("customers")[1].payload.version, baseCustomerVersion + 2);
  assert.equal(events("sales")[1].payload.total, 100);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("non-restocking refund does not emit product change but updates customer and sale revisions", () => {
  const sale = setup();
  const currentProductVersion = core.getProduct("p").version;
  const initialCustomerVersion = core.getCustomer("c").version;
  const result = refund(sale, 1, false);
  assert.deepEqual(result.errors, []);
  assert.equal(core.getProduct("p").version, currentProductVersion);
  assert.equal(core.getProduct("p").stockQuantity, 3);
  assert.equal(events("products").length, 0);
  assert.equal(core.getCustomer("c").version, initialCustomerVersion + 1);
  assert.equal(events("customers")[0].payload.version, initialCustomerVersion + 1);
  assert.equal(events("sales")[0].payload.version, 2);
});

test("failed over-return cannot issue new versions or outbox events", () => {
  const sale = setup();
  const initial = JSON.stringify({
    product: core.getProduct("p"), customer: core.getCustomer("c"),
    sale: core.getSale(sale.id), returns: phase7.listReturns(), outbox: outbox.exportOutbox(),
  });
  const denied = refund(sale, 10);
  assert.ok(denied.errors.length);
  assert.equal(JSON.stringify({
    product: core.getProduct("p"), customer: core.getCustomer("c"),
    sale: core.getSale(sale.id), returns: phase7.listReturns(), outbox: outbox.exportOutbox(),
  }), initial);
});

test("exchange insert and subsequent return update are distinct historical outbox snapshots", () => {
  const sale = setup();
  const result = phase7.createExchange({
    saleId: sale.id, reason: "other", paymentMethod: "cash", refundMethod: "cash",
    additionalPaidAmount: 0,
    returnItems: [{ saleItemId: sale.items[0].id, productId: "p", productName: "Fabric",
      quantity: 1, unitPrice: 100, restock: true }],
    replacementLines: [{ productId: "p", productName: "Fabric", quantity: 1, unitPrice: 80,
      costPrice: 40, stockQuantity: 6, taxRate: 0, discountPercent: 0 }],
  });
  assert.deepEqual(result.errors, []);
  assert.ok(result.ret);
  const retEvents = events("returns");
  assert.equal(retEvents.length, 2);
  assert.equal(retEvents[0].eventType, "insert");
  assert.equal(retEvents[1].eventType, "update");
  assert.equal(retEvents[0].payload.exchangeSaleId, undefined);
  assert.equal(retEvents[1].payload.exchangeSaleId, result.replacementSale.id);
  assert.notEqual(retEvents[0].payload, retEvents[1].payload);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});
