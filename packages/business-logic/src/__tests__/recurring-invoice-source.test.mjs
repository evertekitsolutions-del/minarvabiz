import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, filename,
);
const { createRecurringInvoiceScheduleFromSource } = require("../recurring-invoice-source.ts");

const tenant = { organizationId: "org-a", companyId: "company-a", branchId: "branch-a" };
const request = (patch = {}) => ({
  ...tenant, id: "recurrence-1", sourceSaleId: "sale-a",
  currency: "INR", firstDueDate: "2026-10-31", frequency: "monthly",
  interval: 1, ...patch,
});
const sale = (patch = {}) => ({
  id: "sale-a", status: "completed", customerId: "customer-a",
  branchId: "branch-a", items: [
    { productId: "product-a", quantity: 1.25 },
    { productId: "product-a", quantity: 0.75 },
    { productId: "product-b", quantity: 2 },
  ], ...patch,
});
const trusted = (patch = {}) => ({
  authorizeScheduleCreation(orgId, companyId, branchId) {
    assert.equal(orgId, tenant.organizationId);
    assert.equal(companyId, tenant.companyId);
    assert.equal(branchId, tenant.branchId);
  },
  getSale: () => sale(),
  getCustomer: () => ({ id: "customer-a", branchId: "branch-a" }),
  getProduct: (id) => ({ id, isActive: true, branchId: "branch-a" }),
  ...patch,
});
test("source invoice determines immutable customer, quantities and duplicate product grouping", () => {
  const result = createRecurringInvoiceScheduleFromSource(request(), trusted());
  assert.deepEqual(result.lines, [
    { productId: "product-a", quantityMilli: 2000 },
    { productId: "product-b", quantityMilli: 2000 },
  ]);
  assert.equal(result.customerId, "customer-a");
  assert.equal(result.sourceSaleId, "sale-a");
  assert.equal(result.status, "active");
  assert.equal(result.version, 1);
  assert.equal(result.frequency, "monthly");
});
test("host must authorise creation before reading protected source", () => {
  let read = false;
  assert.throws(() => createRecurringInvoiceScheduleFromSource(request(), trusted({
    authorizeScheduleCreation: () => { throw Error("permission denied"); },
    getSale: () => { read = true; return sale(); },
  })), /permission denied/);
  assert.equal(read, false);
  assert.throws(() => createRecurringInvoiceScheduleFromSource(request(), null), /trusted/);
});
test("forged, draft, deleted and walk-in source invoices fail closed", () => {
  for (const patch of [
    { id: "sale-other" }, { status: "draft" }, { status: "returned" },
    { status: "cancelled" }, { branchId: "branch-other" },
    { customerId: null }, { deletedAt: "2026-10-20" }, { items: [] },
  ]) assert.throws(() => createRecurringInvoiceScheduleFromSource(
    request(), trusted({ getSale: () => sale(patch) })), /not eligible/);
});
test("reject invalid customer and product identities even from host callbacks", () => {
  for (const patch of [
    { id: "customer-foreign" }, { branchId: "branch-other" },
    { deletedAt: "2026-03-01" },
  ]) {
    assert.throws(() => createRecurringInvoiceScheduleFromSource(
      request(), trusted({ getCustomer: () => ({ id: "customer-a", ...patch }) })),
      /customer not found/);
  }
  for (const patch of [
    { id: "product-foreign" }, { branchId: "branch-other" },
    { isActive: false }, { deletedAt: "2026-03-01" },
  ]) {
    assert.throws(() => createRecurringInvoiceScheduleFromSource(
      request(), trusted({ getProduct: (id) => ({ id, isActive: true, branchId: "branch-a", ...patch }) })),
      /inactive or foreign/);
  }
});
test("quantity precision, product scope and dimension source constraints", () => {
  for (const q of [-1, 0, NaN, Infinity, 1.0001, 1000000000]) {
    assert.throws(() => createRecurringInvoiceScheduleFromSource(request(), trusted({
      getSale: () => sale({ items: [{ productId: "product-a", quantity: q }] }),
    })), /quantity/);
  }
  assert.throws(() => createRecurringInvoiceScheduleFromSource(request(), trusted({
    getSale: () => sale({ items: [{ productId: "product-a", quantity: 1, dimensionMetadata: {} }] }),
  })), /Measured/);
  assert.throws(() => createRecurringInvoiceScheduleFromSource(request(), trusted({
    getSale: () => sale({ items: [
      { productId: "product-a", quantity: 900000 },
      { productId: "product-a", quantity: 900000 },
    ] }),
  })), /aggregate quantity/);
});
