import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const salesList = read("packages/ui/src/components/sales/SalesList.tsx");
const quotationsPanel = read("packages/ui/src/components/quotations/QuotationsPanel.tsx");
const quotationsLogic = read("packages/business-logic/src/quotations.ts");
const returnsPanel = read("packages/ui/src/components/returns/ReturnsPanel.tsx");
const desktop = read("apps/desktop/src/App.tsx");
const webSales = read("apps/web/src/app/(app)/sales/page.tsx");
const webReturns = read("apps/web/src/app/(app)/returns/page.tsx");

for (const token of [
  "Search invoice, customer, product or SKU",
  "All customers",
  "All statuses",
  'type="date"',
  "Details",
  "Return / Refund",
  "Posted invoices are financial records and are not hard-deleted",
]) assert.equal(salesList.includes(token), true, `Missing Sales History control: ${token}`);

assert.equal(/>Delete</.test(salesList), false, "Posted invoices must not expose hard-delete");

for (const token of [
  "Search quotation, customer or item",
  "All statuses",
  "Edit",
  "Archive",
  "soft archive",
  "Only draft or sent quotations are editable",
]) assert.equal(quotationsPanel.includes(token), true, `Missing quotation management control: ${token}`);

assert.equal(quotationsLogic.includes("export function updateQuotation"), true);
assert.equal(quotationsLogic.includes("export function archiveQuotation"), true);
assert.equal(quotationsLogic.includes("export function canSetQuotationStatus"), true);
assert.equal(quotationsPanel.includes("canSetQuotationStatus(q, status)"), true);
assert.equal(quotationsLogic.includes('auditAction("quotation.update"'), true);
assert.equal(quotationsLogic.includes('auditAction("quotation.archive"'), true);
assert.equal(quotationsLogic.includes("dateFrom?: string; dateTo?: string"), true);

assert.equal(returnsPanel.includes("preferredSaleId"), true);
assert.equal(desktop.includes("returnSaleId"), true);
assert.equal(desktop.includes('navTo("returns")'), true);
assert.equal(webSales.includes("/returns?saleId="), true);
assert.equal(webReturns.includes('searchParams.get("saleId")'), true);

console.log("Sales/quotation record management contract PASS");
