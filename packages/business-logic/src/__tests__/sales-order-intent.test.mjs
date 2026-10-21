import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const { planSalesOrderCreate, planSalesOrderTransition } = require("../sales-order-intent.ts");
const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const auth = { organizationId: uuid(1), companyId: uuid(2), branchId: uuid(3), warehouseId: uuid(4), canManageSalesOrders: true };
const request = (extra = {}) => ({
  organizationId: auth.organizationId, companyId: auth.companyId,
  branchId: auth.branchId, warehouseId: auth.warehouseId,
  id: uuid(5), operationId: uuid(6), orderNumber: "SO-2026-0001",
  customerId: uuid(7), currency: "INR", createdAt: "2026-10-21T07:00:00.000Z",
  lines: [{ id: uuid(8), productId: uuid(9), description: "Notebook", quantityMilli: 1500,
    unitPriceMinor: 1200, discountMinor: 100, taxMinor: 180 }],
  ...extra,
});
const draft = () => planSalesOrderCreate(request(), auth, [], true).order;
const action = (a, op, version, extra = {}) => ({
  action: a, operationId: uuid(op), expectedVersion: version,
  occurredAt: "2026-10-21T07:01:00.000Z", ...extra,
});
const invoice = (extra={}) => ({
  id: uuid(20), organizationId: auth.organizationId, companyId: auth.companyId,
  branchId: auth.branchId, customerId: uuid(7), currency: "INR", totalMinor: 1880, ...extra,
});

test("SAL-003 is opt-in and RBAC/scope denial precedes mutation", () => {
  assert.throws(() => planSalesOrderCreate(request(), auth), /disabled/);
  assert.throws(() => planSalesOrderCreate(request(), { ...auth, canManageSalesOrders: false }, [], true), /permission denied/);
  assert.throws(() => planSalesOrderCreate(request({ branchId: uuid(11) }), auth, [], true), /scope mismatch/);
  assert.throws(() => planSalesOrderCreate(request({ companyId: uuid(10) }), auth, [], true), /scope mismatch/);
  assert.throws(() => planSalesOrderTransition(draft(), action("confirm", 10, 1), auth), /disabled/);
});
test("exact milli quantities and minor money calculate deterministic order totals", () => {
  const r = planSalesOrderCreate(request(), auth, [], true);
  assert.equal(r.disposition, "new");
  assert.equal(r.order.subtotalMinor, 1800);
  assert.equal(r.order.discountMinor, 100);
  assert.equal(r.order.taxMinor, 180);
  assert.equal(r.order.totalMinor, 1880);
  assert.equal(r.order.version, 1);
  assert.equal(r.order.status, "draft");
  assert.equal(r.order.lines[0].totalMinor, 1880);
  assert.equal(r.order.invoiceId, null);
});
test("idempotency replay returns stored order, altered same key rejects", () => {
  const original = draft();
  const confirmed = { ...original, status: "confirmed", version: 2 };
  let replay = planSalesOrderCreate(request(), auth, [confirmed], true);
  assert.equal(replay.disposition, "replay");
  assert.equal(replay.order, confirmed);
  assert.throws(() => planSalesOrderCreate(request({ orderNumber: "SO-DIFFERENT" }), auth, [original], true), /payload conflict/);
  assert.throws(() => planSalesOrderCreate(request({ operationId: uuid(42) }), auth, [original], true), /ID collision/);
  assert.throws(() => planSalesOrderCreate(request({ id: uuid(41), operationId: uuid(42) }), auth, [original], true), /number already exists/);
});
test("invalid quantity/price/rounding/discount/tax reject before any state changes", () => {
  const source = request(); const original = JSON.stringify(source);
  const bad = [
    [{quantityMilli: 0}, /positive/],
    [{quantityMilli: NaN}, /safe integer/],
    [{quantityMilli: 1200.1}, /safe integer/],
    [{unitPriceMinor: Infinity}, /safe integer/],
    [{unitPriceMinor: -1}, /safe integer/],
    [{quantityMilli: 500,unitPriceMinor: 3}, /fractional minor/],
    [{discountMinor: 9999}, /discount exceeds/],
    [{taxMinor: -1}, /safe integer/],
    [{quantityMilli: 2000,unitPriceMinor: Number.MAX_SAFE_INTEGER,taxMinor: 0}, /safe minor-unit/],
  ];
  for (const [line, pattern] of bad) {
    assert.throws(() => planSalesOrderCreate(request({ lines: [{ ...source.lines[0], ...line }] }), auth, [], true), pattern);
  }
  assert.equal(JSON.stringify(source), original);
  assert.throws(() => planSalesOrderCreate(request({ lines: [] }), auth, [], true), /requires 1 to 100/);
  assert.throws(() => planSalesOrderCreate(request({ lines: [source.lines[0],source.lines[0]] }), auth, [], true), /Duplicate/);
});
test("invalid identity, date, order number and currency reject", () => {
  assert.throws(() => planSalesOrderCreate(request({ id: "not-uuid" }), auth, [], true), /UUID/);
  assert.throws(() => planSalesOrderCreate(request({ dueDate: "2026-02-30" }), auth, [], true), /due date/);
  assert.throws(() => planSalesOrderCreate(request({ createdAt: "wrong" }), auth, [], true), /timestamp/);
  assert.throws(() => planSalesOrderCreate(request({ orderNumber: "INV / bad" }), auth, [], true), /characters/);
  assert.throws(() => planSalesOrderCreate(request({ currency: "INR4" }), auth, [], true), /currency/);
});
test("confirm/cancel CAS and operation retry are idempotent and scoped", () => {
  const a = draft();
  const b = planSalesOrderTransition(a, action("confirm", 10, 1), auth, true);
  assert.equal(b.disposition, "update");
  assert.equal(b.order.status, "confirmed");
  assert.equal(b.order.version, 2);
  assert.equal(a.status, "draft");
  assert.equal(planSalesOrderTransition(b.order, action("confirm", 10, 1), auth, true).disposition, "replay");
  assert.throws(() => planSalesOrderTransition(b.order, action("cancel", 10, 2), auth, true), /key reused/);
  assert.throws(() => planSalesOrderTransition(b.order, action("cancel", 11, 1), auth, true), /Stale/);
  assert.throws(() => planSalesOrderTransition(b.order, action("cancel", 11, 2), { ...auth, branchId: uuid(66) }, true), /scope mismatch/);
  const c = planSalesOrderTransition(b.order, action("cancel", 11, 2), auth, true).order;
  assert.equal(c.status, "cancelled");
  assert.throws(() => planSalesOrderTransition(c, action("confirm", 12, 3), auth, true), /Only draft/);
});
test("verified committed invoice linkage refuses mismatched invoice and a second conversion", () => {
  const order = planSalesOrderTransition(draft(), action("confirm", 10, 1), auth, true).order;
  for (const different of [
    { branchId: uuid(31) }, { organizationId: uuid(32) }, { companyId: uuid(33) },
    { customerId: uuid(34) }, { totalMinor: 1 }, { currency: "USD" },
  ]) assert.throws(() => planSalesOrderTransition(order, action("link-invoice", 11, 2,
    { committedInvoice: invoice(different) }), auth, true), /does not match/);
  assert.throws(() => planSalesOrderTransition(order, action("link-invoice", 11, 2), auth, true), /does not match/);
  const input = action("link-invoice", 11, 2, { committedInvoice: invoice() });
  const done = planSalesOrderTransition(order, input, auth, true).order;
  assert.equal(done.invoiceId, uuid(20));
  assert.equal(done.status, "invoiced");
  assert.equal(planSalesOrderTransition(done, input, auth, true).disposition, "replay");
  assert.throws(() => planSalesOrderTransition(done, action("link-invoice", 12, 3,
    { committedInvoice: invoice({ id: uuid(25) }) }), auth, true), /must be confirmed/);
  assert.throws(() => planSalesOrderTransition(done, action("cancel", 13, 3), auth, true), /cannot be cancelled/);
});
test("archived orders, backward timestamps, exhausted revisions and malformed idempotency reject", () => {
  const a = draft();
  assert.throws(() => planSalesOrderTransition({ ...a, deletedAt: a.createdAt }, action("confirm", 10, 1), auth, true), /Archived/);
  assert.throws(() => planSalesOrderTransition(a, action("confirm", 10, 1,
    { occurredAt: "2026-10-21T06:00:00.000Z" }), auth, true), /backwards/);
  assert.throws(() => planSalesOrderTransition({ ...a, version: Number.MAX_SAFE_INTEGER },
    action("confirm", 10, Number.MAX_SAFE_INTEGER), auth, true), /exhausted/);
  assert.throws(() => planSalesOrderCreate(request({ operationId: "" }), auth, [], true), /UUID/);
});
