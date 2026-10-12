import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(
  ts.transpileModule(fs.readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  path,
);
const store = require("../store.ts");
const warehouse = require("../warehouse-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const accounts = structuredClone(accounting.exportAccountingState().accounts);
const cart = (quantity) => ({
  productId: "fabric", productName: "Linen", quantity,
  stockQuantity: 10, costPrice: 20, unitPrice: 100, discountPercent: 0, taxRate: 0,
});

function setup({ allocated = 0, reserved = 0, inTransit = 0 } = {}) {
  accounting.hydrateAccountingState({ accounts: structuredClone(accounts), journals: [], journalSequence: 0 });
  store.hydrateCore({
    products: [{ id: "fabric", name: "Linen", isActive: true, stockQuantity: 10, costPrice: 20, sellingPrice: 100, version: 1 }],
    customers: [{ id: "buyer", name: "Buyer", totalSpending: 0, outstandingBalance: 0 }],
    sales: [], payments: [],
  });
  warehouse.hydrateWarehouseState({
    warehouses: [{ id: "w", name: "Main", code: "MAIN", isActive: true, branchId: null, version: 1 }],
    locations: [{ id: "l", warehouseId: "w", code: "BIN", isActive: true, version: 1 }],
    stock: allocated ? [{ id: "p", warehouseId: "w", locationId: "l", productId: "fabric", onHand: allocated, reserved, updatedAt: "2026-01-01T00:00:00.000Z", version: 1 }] : [],
    transfers: inTransit ? [{ id: "t", productId: "fabric", quantity: inTransit, status: "in_transit", transferNumber: "WTR-20260101-0001", sourceWarehouseId: "w", sourceLocationId: "l", destinationWarehouseId: "w2", destinationLocationId: "l2" }] : [],
    transferSequence: 0,
  });
  outbox.hydrateOutbox([]);
}
const sell = (quantity) => store.createSale({
  customerId: "buyer", lines: [cart(quantity)], paidAmount: quantity * 100, paymentMethod: "cash",
});
const snapshot = () => JSON.stringify({
  sales: store.listSales(), products: store.listProducts(), payments: store.listPayments(),
  customer: store.listCustomers(), warehouse: warehouse.exportWarehouseState(),
  journal: accounting.exportAccountingState(), outbox: outbox.exportOutbox(),
});
const balance = (name) => {
  const a = accounting.getSystemAccount(name);
  const row = accounting.buildTrialBalance().find(x => x.accountId === a?.id);
  return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0)) * 100) / 100;
};

test("reserved stock cannot be oversold by POS even if Product total is sufficient", () => {
  setup({ allocated: 8, reserved: 7 });
  assert.equal(warehouse.warehouseSaleableQuantity("fabric", 10), 3);
  const before = snapshot();
  const blocked = sell(4);
  assert.match(blocked.errors.join(" "), /insufficient unreserved stock/);
  assert.equal(snapshot(), before, "denied sale must not mutate products, reserved allocations, ledger or outbox");
  const accepted = sell(3);
  assert.deepEqual(accepted.errors, []);
  assert.equal(store.getProduct("fabric").stockQuantity, 7);
  const state = warehouse.listWarehouseStock({ productId: "fabric" })[0];
  assert.equal(state.onHand, 7);
  assert.equal(state.reserved, 7, "reserved order remains untouched");
  assert.equal(balance("cash"), 300);
  assert.equal(balance("cogs"), 60);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("in-transit warehouse transfers are not sellable before receipt", () => {
  setup({ allocated: 7, reserved: 0, inTransit: 3 });
  assert.equal(warehouse.warehouseSaleableQuantity("fabric", 10), 7);
  const before = snapshot();
  assert.match(sell(8).errors.join(" "), /insufficient unreserved stock/);
  assert.equal(snapshot(), before);
  assert.deepEqual(sell(7).errors, []);
  assert.equal(store.getProduct("fabric").stockQuantity, 3);
  assert.equal(warehouse.listWarehouseStock({ productId: "fabric" })[0].onHand, 0);
  assert.equal(warehouse.warehouseStockSummary({ fabric: 3 })[0].inTransit, 3);
});

test("fully unallocated and mixed stock remains sellable; released reservation becomes available", () => {
  setup();
  assert.equal(warehouse.warehouseSaleableQuantity("fabric", 10), 10);
  assert.deepEqual(sell(10).errors, []);
  setup({ allocated: 8, reserved: 7 });
  warehouse.releaseWarehouseReservation({ productId: "fabric", locationId: "l", quantity: 4 });
  assert.equal(warehouse.warehouseSaleableQuantity("fabric", 10), 7);
  assert.deepEqual(sell(7).errors, []);
  assert.equal(store.getProduct("fabric").stockQuantity, 3);
  assert.equal(warehouse.listWarehouseStock({ productId: "fabric" })[0].reserved, 3);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});

test("checkout source protects aggregated demand before mutating a sale", () => {
  const file = fs.readFileSync(new URL("../sale-checkout-guard.ts", import.meta.url), "utf8");
  const start = file.indexOf("export function validateLiveSaleCheckout");
  const body = file.slice(start);
  assert.match(body, /warehouseSaleableQuantity\(productId, live\.stockQuantity, live\.branchId\)/);
  assert.match(body, /requested > saleable/);
  const sale = fs.readFileSync(new URL("../store.ts", import.meta.url), "utf8");
  const submit = sale.slice(sale.indexOf("export function createSale("), sale.indexOf("export function listPayments("));
  assert.ok(submit.indexOf("validateLiveSaleCheckout(") < submit.indexOf("consumeWarehouseStock("));
});

test("branch checkout cannot sell stock allocated to another branch", () => {
  setup({ allocated: 8 });
  store.getProduct("fabric").branchId = "branch-a";
  const state = warehouse.exportWarehouseState();
  state.warehouses[0].branchId = "branch-b";
  warehouse.hydrateWarehouseState(state);
  const before = snapshot();
  const denied = sell(3);
  assert.match(denied.errors.join(" "), /insufficient unreserved stock/);
  assert.equal(snapshot(), before, "foreign stock must not fund a sale, ledger or outbox entry");
  assert.deepEqual(sell(2).errors, [], "genuinely unallocated stock is still available");
  assert.equal(store.getProduct("fabric").stockQuantity, 8);
  assert.equal(warehouse.listWarehouseStock({ productId: "fabric" })[0].onHand, 8);
  assert.equal(balance("cash"), 200);
});

test("branch checkout combines own unreserved allocation with unallocated stock only", () => {
  setup({ allocated: 4, reserved: 1 });
  store.getProduct("fabric").branchId = "branch-a";
  const state = warehouse.exportWarehouseState();
  state.warehouses[0].branchId = "branch-a";
  state.warehouses.push({ ...state.warehouses[0], id: "other", branchId: "branch-b" });
  state.stock.push({ ...state.stock[0], id: "foreign", warehouseId: "other", locationId: "foreign-bin", onHand: 4, reserved: 0 });
  warehouse.hydrateWarehouseState(state);
  const before = snapshot();
  assert.match(sell(6).errors.join(" "), /insufficient unreserved stock/);
  assert.equal(snapshot(), before);
  assert.deepEqual(sell(5).errors, []);
  assert.equal(store.getProduct("fabric").stockQuantity, 5);
  const positions = warehouse.listWarehouseStock({ productId: "fabric" });
  assert.equal(positions.find(p => p.id === "p").onHand, 1);
  assert.equal(positions.find(p => p.id === "p").reserved, 1);
  assert.equal(positions.find(p => p.id === "foreign").onHand, 4);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});


test("manual stock adjustment denies a reduction sourced from another branch", () => {
  setup({ allocated: 8 });
  store.getProduct("fabric").branchId = "branch-a";
  const state = warehouse.exportWarehouseState();
  state.warehouses[0].branchId = "branch-b";
  warehouse.hydrateWarehouseState(state);
  const before = snapshot();
  assert.throws(() => store.adjustStock("fabric", "adjustment", -3, "count correction"), /insufficient unreserved stock/i);
  assert.equal(snapshot(), before, "rejection must not mutate stock, WMS allocations, ledger or outbox");
  assert.equal(store.adjustStock("fabric", "adjustment", -2, "count correction").stockQuantity, 8);
  assert.equal(warehouse.listWarehouseStock({ productId: "fabric" })[0].onHand, 8);
});

test("manual stock adjustment respects reservations and stock in transit", () => {
  for (const config of [{ allocated: 8, reserved: 7 }, { allocated: 7, inTransit: 3 }]) {
    setup(config);
    const available = warehouse.warehouseSaleableQuantity("fabric", 10);
    const before = snapshot();
    assert.throws(() => store.adjustStock("fabric", "adjustment", -(available + 1)), /insufficient unreserved stock/i);
    assert.equal(snapshot(), before);
    assert.equal(store.adjustStock("fabric", "adjustment", -available).stockQuantity, 10 - available);
  }
});

test("stock-count target refuses stale or malformed edits before any mutation", () => {
  setup({ allocated: 3, reserved: 1 });
  const before = snapshot();
  assert.throws(() => store.adjustStockToQuantity("fabric", "", 10, "recount"), /stock quantity/i);
  assert.throws(() => store.adjustStockToQuantity("fabric", "2.7505", 10, "recount"), /stock quantity/i);
  assert.throws(() => store.adjustStockToQuantity("fabric", "8", 9, "recount"), /stock changed while editing/i);
  assert.equal(snapshot(), before);
  assert.equal(store.adjustStockToQuantity("fabric", "9.125", 10, "recount").stockQuantity, 9.125);
  assert.equal(warehouse.listWarehouseStock({ productId: "fabric" })[0].reserved, 1);
});
