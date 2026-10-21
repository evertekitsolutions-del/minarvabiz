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
  }).outputText, filename,
);
const { createRecurringInvoiceSchedule, planRecurringInvoiceDue } = require("../recurring-invoice.ts");
const { prepareRecurringInvoiceCartPreview } = require("../recurring-invoice-checkout-preview.ts");

const scope = { organizationId: "org-1", companyId: "company-1", branchId: "branch-1" };
const schedule = (patch = {}) => createRecurringInvoiceSchedule({
  ...scope, id: "recurring-1", sourceSaleId: "sale-1", customerId: "customer-1",
  currency: "INR", firstDueDate: "2026-03-31", frequency: "monthly",
  lines: [{ productId: "sku-1", quantityMilli: 2500 }], ...patch,
});
const occurrence = (rule) => planRecurringInvoiceDue(rule, "2026-03-31", [])[0];
const sale = (patch = {}) => ({
  id: "sale-1", branchId: "branch-1", customerId: "customer-1",
  status: "completed", items: [{
    productId: "sku-1", quantity: 2.5, unitPrice: 1, taxRate: 0,
  }], ...patch,
});
const product = (patch = {}) => ({
  id: "sku-1", name: "Annual Service", sku: "SERVICE",
  sellingPrice: 120, costPrice: 60, stockQuantity: 25,
  discount: 10, taxRate: 5, isActive: true, branchId: "branch-1", ...patch,
});
const customer = (patch = {}) => ({
  id: "customer-1", branchId: "branch-1", name: "Customer", ...patch,
});
function context(patch = {}) {
  return {
    authorize(org, company, branch) {
      assert.equal(org, scope.organizationId);
      assert.equal(company, scope.companyId);
      assert.equal(branch, scope.branchId);
    },
    getSourceSale: () => sale(),
    getProduct: () => product(),
    getCustomer: () => customer(),
    ...patch,
  };
}
const preview = (rule = schedule(), draft = occurrence(rule), readers = context()) =>
  prepareRecurringInvoiceCartPreview(rule, draft, "2026-03-31", readers);

test("creates read-only cart from fresh catalog values, never repeats issued sale pricing", () => {
  const p = preview();
  assert.equal(p.kind, "nonbinding_recurring_invoice_checkout_preview");
  assert.equal(p.customerId, "customer-1");
  assert.equal(p.sourceSaleId, "sale-1");
  assert.equal(p.lines.length, 1);
  assert.deepEqual([p.lines[0].quantity, p.lines[0].unitPrice,
    p.lines[0].discountPercent, p.lines[0].taxRate, p.lines[0].costPrice],
    [2.5, 120, 10, 5, 60]);
  assert.equal(p.totals.grandTotal, 283.5);
  assert.equal(p.requiresManualApproval, true);
  assert.equal(p.requiresFinalCheckoutRevalidation, true);
  assert.equal("createSale" in p, false);
});

test("preview refuses forged recurrence sequence, date, branch, id, kind and future dates", () => {
  const r = schedule();
  const due = occurrence(r);
  for (const patched of [
    { id: "wrong" }, { sequence: 2 }, { dueDate: "2026-04-30" },
    { branchId: "branch-2" }, { scheduleId: "other" },
    { kind: "posted" }, { organizationId: "foreign-org" },
  ]) {
    assert.throws(() => preview(r, { ...due, ...patched }), /not an authorised/);
  }
  assert.throws(() => prepareRecurringInvoiceCartPreview(
    r, due, "2026-03-30", context()), /not an authorised/);
  assert.throws(() => prepareRecurringInvoiceCartPreview(
    r, due, "2026-02-30", context()), /valid business date/);
});

test("requires a trusted host, role and branch-scoped original sale", () => {
  assert.throws(() => preview(schedule(), occurrence(schedule()), {
    ...context(), authorize: () => { throw Error("read access denied"); },
  }), /read access denied/);
  assert.throws(() => preview(schedule(), occurrence(schedule()), {
    ...context(), getSourceSale: () => sale({ branchId: "branch-2" }),
  }), /scope/);
  assert.throws(() => preview(schedule(), occurrence(schedule()), {
    ...context(), getSourceSale: () => sale({ status: "draft" }),
  }), /scope/);
  assert.throws(() => preview(schedule(), occurrence(schedule()), {
    ...context(), getSourceSale: () => sale({ customerId: "customer-other" }),
  }), /scope/);
  assert.throws(() => preview(schedule(), occurrence(schedule()), null), /trusted host/);
});

test("customer and products must be active and in the trusted branch", () => {
  for (const modified of [{ isActive: false }, { deletedAt: "2026-01-01" },
    { branchId: "branch-other" }, { id: "product-other" }]) {
    const r = schedule();
    assert.throws(() => preview(r, occurrence(r), context({
      getProduct: () => product(modified),
    })), /inactive or outside branch/);
  }
  for (const modified of [{ deletedAt: "2026-01-01" },
    { branchId: "branch-other" }, { id: "customer-other" }]) {
    const r = schedule();
    assert.throws(() => preview(r, occurrence(r), context({
      getCustomer: () => customer(modified),
    })), /not active/);
  }
  const r = schedule({ lines: [{ productId: "sku-unknown", quantityMilli: 1000 }] });
  assert.throws(() => preview(r, occurrence(r)), /not on the original/);
});

test("blocked cart stock, invalid live prices and zero trust cannot reach checkout preview", () => {
  const r = schedule();
  for (const p of [
    { stockQuantity: 1 }, { sellingPrice: Number.POSITIVE_INFINITY },
    { costPrice: -2 }, { stockQuantity: NaN },
  ]) {
    assert.throws(() => preview(r, occurrence(r), context({
      getProduct: () => product(p),
    })), /blocked|safe|invalid/);
  }
  assert.throws(() => preview(r, occurrence(r), {
    ...context(), authorize: null,
  }), /trusted host/);
});

test("measured source invoices cannot be recurring without measurement metadata", () => {
  const r = schedule();
  assert.throws(() => preview(r, occurrence(r), context({
    getSourceSale: () => sale({
      items: [{ productId: "sku-1", dimensionMetadata: { schema: 1 } }],
    }),
  })), /dimension-aware/);
});

test("paused/cancelled schedules cannot be posted from a previously staged draft", () => {
  const r = schedule();
  const due = occurrence(r);
  for (const status of ["paused", "cancelled"]) {
    assert.throws(() => preview({ ...r, status }, due), /Only active/);
  }
});

test("read-only preview creates no side effects, keeping source input immutable", () => {
  const r = schedule();
  const draft = occurrence(r);
  const original = JSON.stringify({ r, draft });
  let reads = 0;
  const readers = context({
    getProduct(id) { ++reads; return product({ id }); },
  });
  const result = preview(r, draft, readers);
  assert.equal(reads, 1);
  assert.equal(result.totals.itemCount, 1);
  assert.equal(JSON.stringify({ r, draft }), original);
});
