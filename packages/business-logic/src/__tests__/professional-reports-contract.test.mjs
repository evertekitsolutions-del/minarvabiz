import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const ui = read("packages/ui/src/components/reports/ReportsPanel.tsx");
const accounting = read("packages/business-logic/src/accounting-store.ts");
const web = read("apps/web/src/app/(app)/reports/page.tsx");
const desktop = read("apps/desktop/src/App.tsx");
const desktopHelper = read("apps/desktop/src/lib/report-data.ts");

for (const token of [
  "Stock Valuation",
  "Receivables",
  "Payables Aging",
  "Financial Statements",
  "GST / Tax",
  "Export CSV",
  "Export Excel",
  "Download PDF",
  "Trial Balance",
  "Profit & Loss",
  "Balance Sheet",
  "Supplier payables aging",
  "Customer receivables",
]) assert.equal(ui.includes(token), true, `Missing professional report surface: ${token}`);

assert.equal(ui.includes("window.print()"), true);
assert.equal(ui.includes("Purchase tax remains in"), true);
assert.equal(ui.includes("internal reconciliation report, not a filed GST return"), true);
assert.equal(ui.includes("reportError"), true);

assert.equal(accounting.includes("export function buildTaxReconciliation"), true);
assert.equal(accounting.includes('taxAccountNet("tax_payable"'), true);
assert.equal(accounting.includes('taxAccountNet("input_tax"'), true);
assert.equal(accounting.includes('taxAccountNet("purchase_tax_pending"'), true);
assert.equal(accounting.includes("Report start date must be on or before end date"), true);

assert.equal(web.includes("accountingStore.buildTrialBalance"), true);
assert.equal(web.includes("accountingStore.buildProfitAndLoss"), true);
assert.equal(web.includes("accountingStore.buildBalanceSheet"), true);
assert.equal(web.includes("accountingStore.buildTaxReconciliation"), true);
assert.equal(web.includes("procurementStore.buildSupplierPayableAging"), true);

assert.equal(desktop.includes("buildProfessionalReportData"), true);
assert.equal(desktop.includes("professionalReports.payables"), true);
assert.equal(desktopHelper.includes("accountingStore.buildTaxReconciliation"), true);
assert.equal(desktopHelper.includes("procurementStore.buildSupplierPayableAging"), true);

console.log("Professional reports contract PASS");
