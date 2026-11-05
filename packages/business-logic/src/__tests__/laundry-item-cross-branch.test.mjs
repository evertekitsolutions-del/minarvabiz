import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const phase9 = require("../phase9-store.ts");
const phase5 = require("../phase5-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const stamp = "2026-11-05T10:00:00.000Z", HQ = "hq", SECOND = "second";
const branches = [
  { id: HQ, name: "Main", code: "HQ", isHeadquarters: true, isActive: true, createdAt: stamp, updatedAt: stamp },
  { id: SECOND, name: "Second", code: "B2", isHeadquarters: false, isActive: true, createdAt: stamp, updatedAt: stamp },
];
function order(id, branchId) {
  return {
    id, branchId, orderNumber: "LDY-" + id, customerId: "customer-" + id, mode: "in_house_ironing",
    quantity: 1, status: "pending", customerRate: 15, supplierRate: 0, totalCustomerCharge: 15,
    totalSupplierCost: 0, paidAmount: 0, balanceAmount: 15, profit: 15,
    createdAt: stamp, updatedAt: stamp, version: 1,
    items: [{
      id: "garment-" + id, label: "Shirt", quantity: 1, tagCode: "TAG-" + id,
      processingStatus: "received", qualityStatus: "pending", notes: null,
    }],
  };
}
function setup(branchId) {
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  phase9.hydratePhase9({ branches, activeBranchId: branchId });
  phase5.hydratePhase5({
    suppliers: [], expenses: [], purchases: [],
    laundryOrders: [order("hq", HQ), order("legacy", null), order("second", SECOND)],
  });
  outbox.hydrateOutbox([]);
}
test("direct garment workflow rejects cross-branch and HQ legacy records without mutations or outbox", () => {
  setup(SECOND);
  for (const id of ["hq", "legacy"]) {
    const result = phase5.updateLaundryItemWorkflow(id, "garment-" + id, "washing");
    assert.equal(result.order, null);
    assert.match(result.errors.join(" "), /active branch/i);
  }
  assert.equal(outbox.listPendingOutbox().length, 0);
  assert.deepEqual(phase5.listLaundryOrders().map(entry => entry.id), ["second"]);
  phase9.hydratePhase9({ branches, activeBranchId: HQ });
  const allVisible = phase5.listLaundryOrders();
  assert.equal(allVisible.length, 2);
  for (const current of allVisible) {
    assert.equal(current.items[0].processingStatus, "received");
    assert.equal(current.version, 1);
    assert.equal(current.status, "pending");
  }
});
test("same-branch item workflow succeeds and wrong branch cannot change it on subsequent calls", () => {
  setup(SECOND);
  const updated = phase5.updateLaundryItemWorkflow("second", "garment-second", "washing");
  assert.deepEqual(updated.errors, []);
  assert.equal(updated.order.items[0].processingStatus, "washing");
  assert.equal(updated.order.version, 2);
  assert(outbox.listPendingOutbox().some(x => x.aggregateId === "second" && x.eventType === "update"));
  outbox.hydrateOutbox([]);
  phase9.hydratePhase9({ branches, activeBranchId: HQ });
  const denied = phase5.updateLaundryItemWorkflow("second", "garment-second", "ironing");
  assert.equal(denied.order, null);
  assert.equal(outbox.listPendingOutbox().length, 0);
  phase9.hydratePhase9({ branches, activeBranchId: SECOND });
  assert.equal(phase5.listLaundryOrders()[0].items[0].processingStatus, "washing");
  assert.equal(phase5.listLaundryOrders()[0].version, 2);
});
test("without an active branch, direct garment mutations fail closed", () => {
  setup(HQ);
  phase9.hydratePhase9({ branches: [], activeBranchId: null });
  const result = phase5.updateLaundryItemWorkflow("hq", "garment-hq", "washing");
  assert.equal(result.order, null);
  assert.equal(outbox.listPendingOutbox().length, 0);
});
