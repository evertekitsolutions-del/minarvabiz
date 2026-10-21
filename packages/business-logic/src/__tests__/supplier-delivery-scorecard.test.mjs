import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const { buildSupplierDeliveryScores } = require("../supplier-delivery-scorecard.ts");

const supplier = (id, patch = {}) => ({ id, name: "Supplier " + id, openingBalance: 0, outstandingBalance: 0, ...patch });
const order = (id, supplierId, quantity, patch = {}) => ({
  id, supplierId, status: "approved", orderDate: "2026-10-10",
  expectedDeliveryDate: "2026-10-15",
  lines: [{ id: id + "-line", purchaseOrderId: id, orderedQuantity: quantity, receivedQuantity: 0 }],
  total: 100, ...patch,
});
const receipt = (id, po, quantity, date, patch = {}) => ({
  id, purchaseOrderId: po.id, supplierId: po.supplierId, receiptDate: date,
  lines: [{ id: id + "-line", purchaseOrderLineId: po.id + "-line", receivedQuantity: quantity }],
  ...patch,
});

test("on-time fulfillment, late open order and comparable per-line receipt progress", () => {
  const suppliers = [supplier("a"), supplier("b")];
  const p1 = order("p1", "a", 2);
  const p2 = order("p2", "a", 4, { expectedDeliveryDate: "2026-10-18" });
  const p3 = order("p3", "b", 1);
  const orders = [p1, p2, p3, order("p4", "a", 1, { status: "draft" })];
  const receipts = [
    receipt("r1", p1, 2, "2026-10-14"),
    receipt("r2", p2, 1, "2026-10-19"),
    receipt("r3", p3, 1, "2026-10-17"),
  ];
  const before = JSON.stringify([suppliers, orders, receipts]);
  const rows = buildSupplierDeliveryScores(suppliers, orders, receipts, "2026-10-21");
  assert.deepEqual(rows.map(r => r.supplierId), ["a", "b"]);
  assert.deepEqual(
    [rows[0].approvedOrders, rows[0].receivedOrders, rows[0].deadlineDeliveries,
      rows[0].deliveredOnTime, rows[0].onTimePercent, rows[0].receiptFillPercent,
      rows[0].overdueOpenOrders, rows[0].orderedValue],
    [2, 1, 1, 1, 100, 62.5, 1, 200],
  );
  assert.equal(rows[1].onTimePercent, 0);
  assert.equal(rows[1].overdueOpenOrders, 0);
  assert.equal(JSON.stringify([suppliers, orders, receipts]), before);
});

test("duplicate receipt replay is counted once and un-dated PO gets no invented on-time rating", () => {
  const po = order("p1", "a", 0.003, { expectedDeliveryDate: null });
  const grn = receipt("r1", po, 0.001, "2026-10-15");
  const [score] = buildSupplierDeliveryScores([supplier("a")], [po], [grn, grn], "2026-10-21");
  assert.equal(score.receiptFillPercent, 33.3);
  assert.equal(score.onTimePercent, null);
  assert.equal(score.receivedOrders, 0);
});

test("cross-supplier and foreign-branch GRNs cannot count toward order fulfillment", () => {
  const po = order("p1", "a", 5, { branchId: "east" });
  const receipts = [
    receipt("wrong-supplier", po, 5, "2026-10-11", { supplierId: "b" }),
    receipt("wrong-branch", po, 5, "2026-10-11", { branchId: "west" }),
  ];
  const [score] = buildSupplierDeliveryScores([supplier("a")], [po], receipts, "2026-10-21");
  assert.equal(score.receiptFillPercent, 0);
  assert.equal(score.overdueOpenOrders, 1);
});

test("draft, cancelled and deleted POs do not inflate performance", () => {
  const base = order("p1", "a", 1);
  const orders = [
    { ...base, status: "cancelled" },
    { ...base, id: "p2", status: "draft" },
    { ...base, id: "p3", deletedAt: "2026-10-11" },
  ];
  const [score] = buildSupplierDeliveryScores([supplier("a")], orders, [], "2026-10-21");
  assert.equal(score.approvedOrders, 0);
  assert.equal(score.receiptFillPercent, null);
  assert.equal(score.orderedValue, 0);
});

test("invalid delivery quantities, zero ordered quantity and malformed dates fail closed", () => {
  const po = order("p1", "a", 1);
  for (const quantity of [-1, NaN, Infinity, 0.0001]) {
    assert.throws(() => buildSupplierDeliveryScores(
      [supplier("a")], [po], [receipt("r1", po, quantity, "2026-10-12")], "2026-10-21"));
  }
  assert.throws(() => buildSupplierDeliveryScores([supplier("a")], [
    order("bad", "a", 0)], [], "2026-10-21"), /zero/i);
  assert.throws(() => buildSupplierDeliveryScores([supplier("a")], [po], [], "invalid"), /date/i);
});

test("Web and Windows procurement panel includes real supplier performance scorecard", () => {
  const text = fs.readFileSync(new URL("../../../ui/src/components/purchases/ProcurementPanel.tsx", import.meta.url), "utf8");
  assert.match(text, /Supplier performance/);
  assert.match(text, /buildSupplierDeliveryScores/);
  assert.match(text, /Overdue open/);
});
