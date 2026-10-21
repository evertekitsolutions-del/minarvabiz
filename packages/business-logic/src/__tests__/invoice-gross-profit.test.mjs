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
const { calculateOriginalInvoiceGrossProfit } = require("../invoice-gross-profit.ts");
const { readAuthorizedInvoiceGrossProfit } = require("../invoice-profit-authorized.ts");
const { setCurrentRole } = require("../permissions.ts");
const store = require("../store.ts");

const sale = (patch = {}) => ({
  id: "sale-profit", invoiceNumber: "INV-2026-01", customerId: "buyer",
  saleDate: "2026-10-21T09:00:00.000Z", subtotal: 200, discountAmount: 10,
  taxAmount: 18, total: 208, paidAmount: 208, balanceAmount: 0,
  status: "completed", createdAt: "2026-10-21T09:00:00.000Z",
  updatedAt: "2026-10-21T09:00:00.000Z", version: 1,
  items: [
    { id: "line1", productId: "product1", productName: "Stock item",
      saleId: "sale-profit", quantity: 2.5, unitPrice: 80, costPrice: 45.20,
      discountPercent: 5, taxRate: 10, lineTotal: 208 },
  ],
  ...patch,
});

test("SAL-026 original posted invoice profit excludes tax and historical line cost uses milli quantities", () => {
  const report = calculateOriginalInvoiceGrossProfit(sale());
  assert.equal(report.revenueExcludingTax, 190);
  assert.equal(report.historicalCostOfGoods, 113);
  assert.equal(report.grossProfit, 77);
  assert.equal(report.grossMarginPercent, 40.53);
  assert.equal(report.excludesOperatingExpenses, true);
  assert.equal(report.includesReturnsOrRefunds, false);
  assert.equal(report.invoiceNumber, "INV-2026-01");
});

test("negative margin, taxes, fractional quantities and multi-row COGS stay precise", () => {
  const x = sale({
    subtotal: 100, discountAmount: 0, taxAmount: 10, total: 110,
    items: [
      { id: "a", productId: "a", quantity: 0.333, costPrice: 90 },
      { id: "b", productId: "b", quantity: 1, costPrice: 120 },
    ],
  });
  const data = calculateOriginalInvoiceGrossProfit(x);
  assert.equal(data.revenueExcludingTax, 100);
  assert.equal(data.historicalCostOfGoods, 149.97);
  assert.equal(data.grossProfit, -49.97);
  assert.equal(data.grossMarginPercent, -49.97);
});

test("rejected drafts, returned/deleted/cancelled invoices and corrupt amounts stay private", () => {
  for (const update of [
    { status: "draft" }, { status: "returned" }, { status: "cancelled" },
    { deletedAt: "2026-10-21T10:00:00.000Z" }, { items: [] },
  ]) {
    assert.throws(() => calculateOriginalInvoiceGrossProfit(sale(update)), /only for/);
  }
  for (const update of [
    { taxAmount: Infinity }, { taxAmount: -1 }, { total: 99 },
    { items: [{ id: "x", productId: "x", costPrice: NaN, quantity: 1 }] },
    { items: [{ id: "x", productId: "x", costPrice: 50, quantity: 1.0011 }] },
  ]) assert.throws(() => calculateOriginalInvoiceGrossProfit(sale(update)));
});

test("domain lookup refuses cashier/staff, allows manager/admin, denies foreign branches", () => {
  store.hydrateCore({ sales: [sale()] });
  try {
    for (const role of ["cashier", "staff", "tailor"]) {
      setCurrentRole(role);
      assert.throws(() => readAuthorizedInvoiceGrossProfit("sale-profit"), /permission|denied|not allowed|Role/i);
    }
    for (const role of ["manager", "admin", "super_admin"]) {
      setCurrentRole(role);
      const result = readAuthorizedInvoiceGrossProfit("sale-profit");
      assert.equal(result.grossProfit, 77);
      assert.equal(result.revenueExcludingTax, 190);
    }
    store.hydrateCore({ sales: [sale({ branchId: "foreign-branch" })] });
    setCurrentRole("manager");
    assert.throws(() => readAuthorizedInvoiceGrossProfit("sale-profit"), /outside the active branch/);
    assert.throws(() => readAuthorizedInvoiceGrossProfit("unknown"), /not found/);
  } finally {
    setCurrentRole(null);
    store.hydrateCore({ sales: [] });
  }
});

test("SAL-026 UI is reached only through allowed financial role; no profit in printing or exports", () => {
  const root = new URL("../../../../", import.meta.url);
  const read = (p) => fs.readFileSync(new URL(p, root), "utf8");
  const web = read("apps/web/src/app/(app)/sales/page.tsx");
  const desktop = read("apps/desktop/src/App.tsx");
  const ui = read("packages/ui/src/components/sales/SalesList.tsx");
  assert.match(web, /onShowProfit=\{can\("accounting\.view"\)/);
  assert.match(desktop, /onShowProfit=\{can\("accounting\.view"\)/);
  assert.match(ui, /onShowProfit && \["completed", "partial"\]\.includes\(row\.status\)/);
  assert.match(ui, /gross profit/i);
  assert.doesNotMatch(read("packages/business-logic/src/sales-history-csv.ts"), /InvoiceGrossProfit|grossMarginPercent/);
  assert.doesNotMatch(read("packages/business-logic/src/invoice.ts"), /InvoiceGrossProfit|grossMarginPercent/);
});
