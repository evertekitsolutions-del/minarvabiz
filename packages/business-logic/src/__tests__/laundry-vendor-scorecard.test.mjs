import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const { buildLaundryVendorScorecard } = require("../laundry-vendor-scorecard.ts");
const order = (id, overrides={}) => ({
  id, mode: "outsourced", supplierId: "vendor-a", supplierName: "Vendor A",
  quantity: 1, status: "pending", totalCustomerCharge: 50, totalSupplierCost: 30,
  createdAt: "2026-11-01", dueAt: "2026-11-03", ...overrides,
});
test("vendor costs, in-house contribution, overdue and QC issues use source tickets", () => {
  const rows = [
    order("v1", { quantity: 2, totalCustomerCharge: 100, totalSupplierCost: 70, items: [{qualityStatus:"failed"}] }),
    order("v2", { status:"delivered", totalCustomerCharge:50, totalSupplierCost:20 }),
    order("local", { mode:"in_house_ironing", supplierId:null, supplierName:null, quantity:2,
      totalCustomerCharge:80,totalSupplierCost:0,dueAt:"2026-11-06" }),
    order("cancelled", { status:"cancelled",totalCustomerCharge:100000,totalSupplierCost:100000 }),
  ];
  const copy=JSON.stringify(rows);
  const scores=buildLaundryVendorScorecard([...rows, rows[0]],"2026-11-04");
  assert.equal(scores.length,2);
  assert.deepEqual([scores[0].supplierName,scores[0].orders,scores[0].garments,
    scores[0].delivered,scores[0].overdueOpen,scores[0].qcFailedItems,
    scores[0].customerRevenue,scores[0].supplierCost,scores[0].contributionBeforeInternalCosts],
    ["Vendor A",2,3,1,1,1,150,90,60]);
  assert.equal(scores[1].supplierName,"In-house ironing");
  assert.equal(scores[1].supplierCost,0);
  assert.equal(scores[1].contributionBeforeInternalCosts,80);
  assert.equal(JSON.stringify(rows),copy);
});
test("undated overdue not guessed and invalid money or date fail closed", () => {
  assert.equal(buildLaundryVendorScorecard([order("no-date",{dueAt:null})],"2026-11-04")[0].overdueOpen,0);
  assert.throws(()=>buildLaundryVendorScorecard([],"04/11/2026"),/YYYY-MM-DD/);
  assert.throws(()=>buildLaundryVendorScorecard([order("bad",{totalSupplierCost:NaN})],"2026-11-04"));
});
test("Laundry UI exposes vendor comparison for both Desktop and Web shared component",()=>{
  const source=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
  assert.match(source,/buildLaundryVendorScorecard/);
  assert.match(source,/Laundry supplier performance/);
  assert.match(source,/Contribution excludes in-house wages/);
});
