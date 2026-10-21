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
const { calculateCustomerOriginalGrossMargins, listAuthorizedCustomerOriginalGrossMargins } =
  require("../customer-original-gross-margin.ts");
const { setCurrentRole } = require("../permissions.ts");
const store = require("../store.ts");
const fixture = (id, customerId, cost, date = "2026-10-21", patch = {}) => ({
  id, invoiceNumber: "INV-" + id,
  customerId, customerName: customerId,
  saleDate: date + "T10:00:00.000Z",
  subtotal: 100, discountAmount: 0, taxAmount: 18, total: 118,
  paidAmount: 118, balanceAmount: 0,
  status: "completed", version: 1,
  createdAt: date + "T10:00:00.000Z",
  items: [{ id: id + "-line", saleId: id, productId: "item", productName: "Item",
    quantity: 1, costPrice: cost, unitPrice: 100,
    discountPercent: 0, taxRate: 18, lineTotal: 118 }],
  ...patch,
});
const names = new Map([["customer-a","Alpha"],["customer-b","Beta"]]);

test("customer report aggregates posted invoices with historical cost, no tax and stable order", () => {
  const sales = [
    fixture("one","customer-a",40),
    fixture("two","customer-a",30),
    fixture("three","customer-b",80),
    fixture("draft","customer-b",1,"2026-10-21",{ status:"draft" }),
    fixture("walkin",null,1),
    fixture("deleted","customer-a",1,"2026-10-21",{deletedAt:"2026-10-22"}),
    fixture("returned","customer-a",1,"2026-10-21",{status:"returned"}),
  ];
  const result = calculateCustomerOriginalGrossMargins(sales,names);
  assert.deepEqual(result, [
    {customerId:"customer-a", customerName:"Alpha",invoiceCount:2,revenueExcludingTax:200,
      historicalCost:70, originalGrossProfit:130,originalGrossMarginPercent:65},
    {customerId:"customer-b", customerName:"Beta",invoiceCount:1,revenueExcludingTax:100,
      historicalCost:80, originalGrossProfit:20,originalGrossMarginPercent:20},
  ]);
});

test("date-range filters, negative margin, invalid dates and corrupt historical invoices", () => {
  const sales = [fixture("one","customer-a",120,"2026-10-20"),
    fixture("two","customer-a",20,"2026-10-21")];
  const result = calculateCustomerOriginalGrossMargins(sales,names,"2026-10-20","2026-10-20");
  assert.equal(result[0].originalGrossProfit, -20);
  assert.equal(result[0].originalGrossMarginPercent, -20);
  assert.equal(calculateCustomerOriginalGrossMargins(sales,names,"2026-10-22").length,0);
  for(const [from,to] of [["2026-02-30",undefined],["2026-11-01","2026-10-01"],["foo",undefined]]) {
    assert.throws(()=>calculateCustomerOriginalGrossMargins(sales,names,from,to));
  }
  assert.throws(()=>calculateCustomerOriginalGrossMargins([
    fixture("corrupt","customer-a",20,"2026-10-21",{total:999})
  ],names),/inconsistent/);
});

test("financial authorization rejects cashier/staff and branch-scopes original customer margin", () => {
  store.hydrateCore({ sales:[fixture("first","customer-a",40)] });
  try {
    for (const role of ["cashier","staff","tailor"]) {
      setCurrentRole(role);
      assert.throws(() => listAuthorizedCustomerOriginalGrossMargins(), /Permission denied/);
    }
    for (const role of ["manager","admin","super_admin"]) {
      setCurrentRole(role);
      assert.equal(listAuthorizedCustomerOriginalGrossMargins()[0].originalGrossProfit,60);
    }
    store.hydrateCore({ sales:[fixture("foreign","customer-a",10,"2026-10-21",
      { branchId:"another-branch" })] });
    setCurrentRole("manager");
    assert.deepEqual(listAuthorizedCustomerOriginalGrossMargins(),[]);
  } finally {
    setCurrentRole(null);
    store.hydrateCore({ sales:[] });
  }
});

test("Reports has role-gated customer profit tab with protected exports", () => {
  const ui = fs.readFileSync(new URL("../../../ui/src/components/reports/ReportsPanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/customer-profit/);
  assert.match(ui,/can\("accounting.view"\)/);
  assert.match(ui,/listAuthorizedCustomerOriginalGrossMargins/);
  assert.match(ui,/Original posted invoice gross margin/);
});
