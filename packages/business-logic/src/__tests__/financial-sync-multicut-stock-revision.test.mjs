import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file,
);

const store = require("../store.ts");
const branchStore = require("../phase9-store.ts");
const warehouse = require("../warehouse-store.ts");
const account = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const cloud = require("../remote-write.ts");
const persistence = require("../persistence.ts");
const shop = require("../shop-profile.ts");
const permissions = require("../permissions.ts");
const { previewDimensionRow } = require("../dimensional-billing.ts");
const { aggregateSaleLineQuantities } = require("../inventory.ts");
const { buildSaleFinancialEnvelope } = require("../financial-sync-envelope.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

const ids = {
  org: "10000000-0000-4000-8000-000000000001",
  user: "10000000-0000-4000-8000-000000000002",
  branch: "10000000-0000-4000-8000-000000000003",
  warehouse: "10000000-0000-4000-8000-000000000004",
  location: "10000000-0000-4000-8000-000000000005",
  device: "10000000-0000-4000-8000-000000000006",
  product: "10000000-0000-4000-8000-000000000007",
  customer: "10000000-0000-4000-8000-000000000008",
  position: "10000000-0000-4000-8000-000000000009",
  productB: "10000000-0000-4000-8000-000000000030",
  positionB: "10000000-0000-4000-8000-000000000031",
  locationB: "10000000-0000-4000-8000-000000000032",
};
const scope = ids.org + ":" + ids.user;
const chart = structuredClone(account.exportAccountingState().accounts);
const baseProfile = shop.getShopProfile();

function measurement(width, pieces = "1") {
  const preview = previewDimensionRow({
    length: "12", width, lengthUnit: "in", widthUnit: "in", billableUnit: "sqft", pieces,
  });
  assert.equal(preview.valid, true);
  return preview.measurement;
}

function hydrate({ extraProduct = false, extraLocation = false } = {}) {
  cloud.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope(scope);
  outbox.setOutboxDeviceId(ids.device);
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  shop.hydrateShopProfile({ ...baseProfile, currency: "USD" });
  branchStore.hydratePhase9({
    branches: [{
      id: ids.branch, name: "Main Branch", isHeadquarters: true, isActive: true,
      createdAt: "2026-10-13T12:00:00.000Z", updatedAt: "2026-10-13T12:00:00.000Z",
    }],
    activeBranchId: ids.branch,
  });
  account.hydrateAccountingState({ accounts: structuredClone(chart), journals: [], journalSequence: 0 });
  const products = [{
    id: ids.product, name: "Area Material", isActive: true, branchId: ids.branch,
    stockQuantity: 10, costPrice: 40, sellingPrice: 100, version: 8,
  }];
  if (extraProduct) {
    products.push({
      id: ids.productB, name: "Trim", isActive: true, branchId: ids.branch,
      stockQuantity: 6, costPrice: 10, sellingPrice: 20, version: 3,
    });
  }
  store.hydrateCore({
    products,
    customers: [{ id: ids.customer, name: "Buyer", totalSpending: 0, outstandingBalance: 0, version: 1 }],
    sales: [], payments: [],
  });
  const stock = [{
    id: ids.position, productId: ids.product, warehouseId: ids.warehouse,
    locationId: ids.location, onHand: 8, reserved: 0, version: 4,
  }];
  const locations = [{
    id: ids.location, warehouseId: ids.warehouse, code: "A", name: "Shelf",
    isActive: true, version: 1,
  }];
  if (extraProduct) {
    stock.push({
      id: ids.positionB, productId: ids.productB, warehouseId: ids.warehouse,
      locationId: ids.location, onHand: 6, reserved: 0, version: 2,
    });
  }
  if (extraLocation) {
    locations.push({
      id: ids.locationB, warehouseId: ids.warehouse, code: "B", name: "Bin",
      isActive: true, version: 1,
    });
    stock.push({
      id: "10000000-0000-4000-8000-000000000033",
      productId: ids.product, warehouseId: ids.warehouse,
      locationId: ids.locationB, onHand: 2, reserved: 0, version: 1,
    });
  }
  warehouse.hydrateWarehouseState({
    warehouses: [{
      id: ids.warehouse, name: "Warehouse", code: "WH", branchId: ids.branch,
      isDefault: true, isActive: true, version: 1,
    }],
    locations, stock: stock.map((position) => ({
      ...position, updatedAt: "2026-10-13T12:00:00.000Z",
    })), transfers: [],
  });
}

function cuts(productId, unitPrice) {
  const a = measurement("18", "2"); // 3 sqft
  const b = measurement("12"); // 1 sqft
  return [a, b].map((m, i) => ({
    productId, productName: productId === ids.product ? "Area Material" : "Trim",
    quantity: m.quantity, unitPrice: i ? unitPrice * 2 : unitPrice, costPrice: productId === ids.product ? 40 : 10,
    taxRate: 0, discountPercent: 0, stockQuantity: 10,
    dimensionMetadata: {
      schema: "dimension-line-v1", algorithm: "area-v1",
      length: m.length, width: m.width, lengthUnit: m.lengthUnit, widthUnit: m.widthUnit,
      billableUnit: m.billableUnit, pieces: m.pieces, quantityMilli: m.quantityMilli,
    },
  }));
}

test("integer milli aggregation conserves 0.1 + 0.2 as exactly 0.3", () => {
  assert.equal(aggregateSaleLineQuantities([
    { productId: ids.product, quantity: 0.1 },
    { productId: ids.product, quantity: 0.2 },
  ]).get(ids.product), 0.3);
});

test("two cuts of one SKU keep distinct audits and one product plus warehouse revision", () => {
  hydrate();
  const result = store.createSale({
    customerId: ids.customer, lines: cuts(ids.product, 100),
    paidAmount: 500, paymentMethod: "card",
    paymentSplits: [{ method: "card", amount: 350 }, { method: "cash", amount: 150 }],
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.sale.items.length, 2);
  assert.notEqual(result.sale.items[0].id, result.sale.items[1].id);
  assert.deepEqual(result.sale.items.map((item) => item.dimensionMetadata.quantityMilli), [3000, 1000]);
  assert.equal(store.getProduct(ids.product).stockQuantity, 6);
  assert.equal(store.getProduct(ids.product).version, 9);
  const position = warehouse.listWarehouseStock().find((row) => row.productId === ids.product);
  assert.equal(position.onHand, 4);
  assert.equal(position.version, 5);
  const saleEvent = outbox.exportOutbox().find((event) => event.aggregateType === "sales");
  const proof = saleEvent.financialSyncProof;
  assert.equal(proof.stockLines.length, 1);
  assert.equal(proof.stockLines[0].quantity, 4);
  assert.equal(proof.expectedVersions[ids.product], 8);
  assert.equal(proof.stockLines[0].expectedWarehouseVersion, 4);
  const envelope = buildSaleFinancialEnvelope(persistence.exportDomainSnapshot(), saleEvent.id, scope);
  assert.equal(envelope.operation, "sale.post", JSON.stringify(envelope));
  assert.equal(envelope.sale.items.length, 2);
  assert.equal(envelope.stockLines.length, 1);
  assert.ok(outbox.exportOutbox().every((event) => event.status !== "synced"));
});

test("two SKUs at one authorized location each receive one stock revision", () => {
  hydrate({ extraProduct: true });
  const result = store.createSale({
    customerId: ids.customer,
    lines: [...cuts(ids.product, 100), {
      productId: ids.productB, productName: "Trim", quantity: 2,
      unitPrice: 20, costPrice: 10, taxRate: 0, discountPercent: 0, stockQuantity: 6,
    }],
    paidAmount: 540, paymentMethod: "cash",
  });
  assert.deepEqual(result.errors, []);
  assert.equal(store.getProduct(ids.product).version, 9);
  assert.equal(store.getProduct(ids.productB).version, 4);
  assert.equal(store.getProduct(ids.product).stockQuantity, 6);
  assert.equal(store.getProduct(ids.productB).stockQuantity, 4);
  const proof = outbox.exportOutbox().find((event) => event.aggregateType === "sales").financialSyncProof;
  assert.equal(proof.stockLines.length, 2);
  assert.equal(proof.expectedVersions[ids.product], 8);
  assert.equal(proof.expectedVersions[ids.productB], 3);
  const envelope = buildSaleFinancialEnvelope(
    persistence.exportDomainSnapshot(),
    outbox.exportOutbox().find((event) => event.aggregateType === "sales").id,
    scope,
  );
  assert.equal(envelope.operation, "sale.post", JSON.stringify(envelope));
});

test("ambiguous multi-location stock sells locally but never claims a financial envelope", () => {
  hydrate({ extraLocation: true });
  const result = store.createSale({
    customerId: ids.customer, lines: cuts(ids.product, 100),
    paidAmount: 500, paymentMethod: "cash",
  });
  assert.deepEqual(result.errors, []);
  const saleEvent = outbox.exportOutbox().find((event) => event.aggregateType === "sales");
  assert.equal(saleEvent.financialSyncProof, undefined);
  assert.equal(
    buildSaleFinancialEnvelope(persistence.exportDomainSnapshot(), saleEvent.id, scope).held,
    "missing_pre_operation_authority",
  );
});

test("duplicate sale event identity cannot mint a second accepted envelope", () => {
  hydrate();
  store.createSale({
    customerId: ids.customer, lines: cuts(ids.product, 100),
    paidAmount: 500, paymentMethod: "cash",
  });
  const snapshot = persistence.exportDomainSnapshot();
  snapshot.outbox.push(structuredClone(snapshot.outbox.find((event) => event.aggregateType === "sales")));
  const eventId = snapshot.outbox.find((event) => event.aggregateType === "sales").id;
  assert.ok("held" in buildSaleFinancialEnvelope(snapshot, eventId, scope));
});

test("a concurrent extra warehouse revision after checkout holds the envelope", () => {
  hydrate();
  store.createSale({
    customerId: ids.customer, lines: cuts(ids.product, 100),
    paidAmount: 500, paymentMethod: "cash",
  });
  // listWarehouseStock returns detached copies. Change the persisted snapshot
  // that the envelope actually consumes, not a discarded read-only view.
  const snapshot = persistence.exportDomainSnapshot();
  snapshot.warehouse.stock.find((row) => row.productId === ids.product).version += 1;
  const saleEvent = outbox.exportOutbox().find((event) => event.aggregateType === "sales");
  assert.equal(
    buildSaleFinancialEnvelope(snapshot, saleEvent.id, scope).held,
    "stock_snapshot_revision_conflict",
  );
});

test("snapshot restore keeps the aggregated proof and unacknowledged outbox identities", () => {
  hydrate();
  const posted = store.createSale({
    customerId: ids.customer, lines: cuts(ids.product, 100),
    paidAmount: 500, paymentMethod: "cash",
  });
  const saved = JSON.parse(persistence.exportDomainSnapshotJson());
  const original = saved.outbox.find((event) => event.aggregateType === "sales");
  assert.equal(original.financialSyncProof.stockLines[0].quantity, 4);
  const restore = persistence.importDomainSnapshot(saved);
  assert.equal(restore.ok, true, restore.error);
  const rebuilt = outbox.exportOutbox().find((event) => event.aggregateType === "sales");
  assert.deepEqual(rebuilt.financialSyncProof, original.financialSyncProof);
  assert.equal(rebuilt.id, original.id);
  assert.equal(store.getProduct(ids.product).stockQuantity, 6);
  assert.equal(store.listSales()[0].id, posted.sale.id);
});

test("unsupported dimensional cloud writer never acknowledges a multi-cut sale", async () => {
  hydrate();
  let plainSaleCalls = 0;
  cloud.registerRemoteWriter({
    createSale: async () => { plainSaleCalls += 1; },
  }, scope);
  const result = store.createSale({
    customerId: ids.customer, lines: cuts(ids.product, 100),
    paidAmount: 500, paymentMethod: "cash",
  });
  assert.deepEqual(result.errors, []);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(plainSaleCalls, 0);
  const events = outbox.exportOutbox().filter((event) =>
    event.aggregateType === "sales" || event.aggregateType === "payments");
  assert.ok(events.length >= 2);
  assert.ok(events.every((event) => event.status === "failed"));
  assert.ok(events.every((event) => event.status !== "synced"));
});
