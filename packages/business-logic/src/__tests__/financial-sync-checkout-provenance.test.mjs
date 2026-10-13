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
};
const scope = ids.org + ":" + ids.user;
const chart = structuredClone(account.exportAccountingState().accounts);
const baseProfile = shop.getShopProfile();

function prepare({ branchId = ids.branch, currency = "USD", quantity = 1.25, warehouse = true } = {}) {
  cloud.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope(scope);
  outbox.setOutboxDeviceId(ids.device);
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  shop.hydrateShopProfile({ ...baseProfile, currency });
  branchStore.hydratePhase9({
    branches: [{ id: branchId, name: "Main Branch", isHeadquarters: true, isActive: true,
      createdAt: "2026-10-13T12:00:00.000Z", updatedAt: "2026-10-13T12:00:00.000Z" }],
    activeBranchId: branchId,
  });
  account.hydrateAccountingState({ accounts: structuredClone(chart), journals: [], journalSequence: 0 });
  store.hydrateCore({
    products: [{ id: ids.product, name: "Material", isActive: true, branchId: ids.branch,
      stockQuantity: 7.5, costPrice: 40, sellingPrice: 100, version: 8 }],
    customers: [{ id: ids.customer, name: "Buyer", totalSpending: 0, outstandingBalance: 0, version: 1 }],
    sales: [], payments: [],
  });
  const w = warehouse ? {
    warehouses: [{ id: ids.warehouse, name: "Warehouse", code: "WH", branchId: ids.branch,
      isDefault: true, isActive: true, version: 1 }],
    locations: [{ id: ids.location, warehouseId: ids.warehouse, code: "A", name: "Shelf",
      isActive: true, version: 1 }],
    stock: [{ id: ids.position, productId: ids.product, warehouseId: ids.warehouse,
      locationId: ids.location, onHand: 5, reserved: 0, version: 4 }],
    transfers: [],
  } : { warehouses: [], locations: [], stock: [], transfers: [] };
  // Module name is also a parameter: call through the imported module.
  require("../warehouse-store.ts").hydrateWarehouseState(w);
  return store.createSale({
    customerId: ids.customer, lines: [{
      productId: ids.product, productName: "Material", quantity,
      unitPrice: 100, costPrice: 40, taxRate: 0, discountPercent: 0,
      stockQuantity: 7.5,
    }],
    paidAmount: 125, paymentMethod: "cash",
    paymentSplits: [{ method: "cash", amount: 80 }, { method: "card", amount: 45 }],
  });
}

test("UUID branch sale persists immutable pre-checkout stock versions and posted journal source", () => {
  const result = prepare();
  assert.deepEqual(result.errors, []);
  assert.equal(result.sale.branchId, ids.branch);
  assert.equal(store.getProduct(ids.product).stockQuantity, 6.25);
  const position = warehouse.listWarehouseStock()[0];
  assert.equal(position.onHand, 3.75);
  assert.equal(position.version, 5);
  const events = outbox.exportOutbox().filter(e => e.aggregateType === "sales" || e.aggregateType === "payments");
  assert.equal(events.length, 3);
  const proof = events[0].financialSyncProof;
  assert.ok(proof, "validated sale must retain immutable financial proof with original outbox event");
  assert.equal(proof.expectedVersions[ids.product], 8, "capture product version before mutation");
  assert.equal(proof.stockLines[0].expectedWarehouseVersion, 4, "capture warehouse version before mutation");
  assert.equal(proof.stockLines[0].priorOnHand, 5);
  assert.equal(proof.stockLines[0].resultingOnHand, 3.75);
  assert.deepEqual(proof.paymentEventIds, events.slice(1).map(e => e.id));
  const posted = account.listJournalEntries().find(j => j.referenceType === "auto_sale" && j.referenceId === result.sale.id);
  assert.ok(posted);
  assert.equal(proof.journalId, posted.id);
  assert.equal(posted.branchId, ids.branch);
  const envelope = buildSaleFinancialEnvelope(persistence.exportDomainSnapshot(), events[0].id, scope);
  assert.equal(envelope.operation, "sale.post", JSON.stringify(envelope));
  assert.equal(envelope.stockLines[0].priorProductStock, 7.5);
  assert.equal(envelope.payments.length, 2);
  assert.equal(envelope.journal.id, posted.id);
});

test("missing physical allocation sells normally but never fabricates financial authority", () => {
  const result = prepare({ warehouse: false });
  assert.deepEqual(result.errors, []);
  assert.equal(result.sale.total, 125);
  const event = outbox.exportOutbox().find(e => e.aggregateType === "sales");
  assert.equal(event.financialSyncProof, undefined);
  assert.equal(buildSaleFinancialEnvelope(persistence.exportDomainSnapshot(), event.id, scope).held,
    "missing_pre_operation_authority");
});

test("non-UUID legacy branch and unsupported currency stay on existing offline path", () => {
  let result = prepare({ branchId: "branch-hq" });
  assert.deepEqual(result.errors, []);
  assert.equal(outbox.exportOutbox().find(e => e.aggregateType === "sales").financialSyncProof, undefined);
  result = prepare({ currency: "OMR" });
  assert.deepEqual(result.errors, []);
  assert.equal(outbox.exportOutbox().find(e => e.aggregateType === "sales").financialSyncProof, undefined);
});

test("financial source proof remains durable across snapshot import and outbox rehydration", () => {
  const result = prepare();
  assert.deepEqual(result.errors, []);
  const saved = JSON.parse(persistence.exportDomainSnapshotJson());
  const original = saved.outbox.find(e => e.aggregateType === "sales");
  assert.ok(original.financialSyncProof);
  const restore = persistence.importDomainSnapshot(saved);
  assert.equal(restore.ok, true, restore.error);
  const rebuilt = outbox.exportOutbox().find(e => e.aggregateType === "sales");
  assert.deepEqual(rebuilt.financialSyncProof, original.financialSyncProof);
});
