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

test("vendor incident/rework recovery comparison excludes rejected, duplicate and cancelled-source claims",()=>{
  const orders=[
    order("v1",{totalCustomerCharge:70,totalSupplierCost:40}),
    order("v2",{mode:"in_house_ironing",supplierId:null,supplierName:null,totalSupplierCost:0}),
    order("cancelled",{status:"cancelled"}),
  ];
  const caseOf=(id,orderId,kind,status="open",customerEstimate=0,vendorEstimate=0)=>({
    id,orderId,status,incidentType:kind,estimatedCustomerCompensation:customerEstimate,
    estimatedVendorRecovery:vendorEstimate,
  });
  const cases=[
    caseOf("damage","v1","damage","open",25,12.5),
    caseOf("rework","v1","rework","resolved",10,8),
    caseOf("rejected","v1","lost","rejected",50,40),
    caseOf("local","v2","lost","open",10,0),
    caseOf("cancel","cancelled","damage","open",500,500),
    caseOf("foreign","no-such-ticket","damage","open",500,500),
  ];
  const before=JSON.stringify([orders,cases]);
  const scores=buildLaundryVendorScorecard(orders,"2026-11-05",[...cases,cases[0]]);
  const vendor=scores.find(x=>x.supplierId==="vendor-a");
  const local=scores.find(x=>x.mode==="in_house_ironing");
  assert(vendor&&local);
  assert.deepEqual([vendor.incidentCases,vendor.reworkCases,vendor.damageLossCases,
    vendor.estimatedCustomerCompensation,vendor.estimatedVendorRecovery],[2,1,1,35,20.5]);
  assert.deepEqual([local.incidentCases,local.damageLossCases,local.estimatedVendorRecovery],[1,1,0]);
  assert.equal(vendor.contributionBeforeInternalCosts,30,"estimates are not posted journal deductions");
  assert.equal(JSON.stringify([orders,cases]),before);
});
test("vendor panel recomputes historical claims after incident registration/finalization",()=>{
  const panel=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
  const claims=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryIncidentsPanel.tsx",import.meta.url),"utf8");
  assert.match(panel,/buildLaundryVendorScorecard\(orders, day, listLaundryIncidents\(\)\)/);
  assert.match(panel,/setIncidentRevision/);
  assert.match(panel,/Est\. recovery/);
  assert.match(claims,/onChange\?\.\(\)/);
});
