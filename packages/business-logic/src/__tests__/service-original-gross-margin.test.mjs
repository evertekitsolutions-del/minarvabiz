import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(
 ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  fileName:filename,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
 }).outputText,filename);
const {calculateServiceOriginalGrossMargins,listAuthorizedServiceOriginalGrossMargins}=
 require("../service-original-gross-margin.ts");
const {setCurrentRole}=require("../permissions.ts");
const orders=require("../orders-store.ts");
const service=(id,serviceType,price,material,expenses,patch={})=>({
 id,orderNumber:"ORD-"+id,serviceType,orderDate:"2026-10-20T10:00:00Z",
 status:"delivered",price,externalMaterialCost:material,orderExpensesTotal:expenses,
 customerId:"customer-a",version:1,createdAt:"2026-10-20T10:00:00Z",
 ...patch,
});
test("aggregate delivered service direct-cost margin with already discounted order price",()=>{
 const rows=calculateServiceOriginalGrossMargins([
  service("a","ladies_tailoring",500,100,50),
  service("b","ladies_tailoring",400,60,40),
  service("c","tshirt_printing",100,110,10),
  service("notyet","ladies_tailoring",1000,1,1,{status:"processing"}),
  service("cancel","ladies_tailoring",1000,1,1,{status:"cancelled"}),
  service("deleted","ladies_tailoring",1000,1,1,{deletedAt:"2026-10-21"}),
 ]);
 assert.deepEqual(rows[0],{
  serviceType:"ladies_tailoring",serviceName:"Ladies Tailoring",
  deliveredOrderCount:2,orderRevenue:900,recordedMaterialCost:160,
  recordedDirectExpenses:90,estimatedGrossProfit:650,
  estimatedMarginPercent:72.22,
 });
 assert.equal(rows[1].estimatedGrossProfit,-20);
 assert.equal(rows.length,2);
});
test("date range, cents and invalid expenses fail closed",()=>{
 const sample=service("a","uniform",100.01,35.25,0.25);
 assert.equal(calculateServiceOriginalGrossMargins([sample])[0].estimatedGrossProfit,64.51);
 assert.deepEqual(calculateServiceOriginalGrossMargins([sample],"2026-10-21"),[]);
 assert.throws(()=>calculateServiceOriginalGrossMargins([sample],"2026-02-30"));
 assert.throws(()=>calculateServiceOriginalGrossMargins([sample],"2026-11-01","2026-01-01"));
 for(const value of [NaN,Infinity,-1]){
  assert.throws(()=>calculateServiceOriginalGrossMargins([
    {...sample,orderExpensesTotal:value},
  ]),/invalid/);
 }
});
test("domain authorization and branch isolation for delivered service profit",()=>{
 orders.hydrateOrders({orders:[service("a","ladies_tailoring",100,30,10)]});
 try {
  for(const role of ["cashier","staff","tailor"]){
   setCurrentRole(role);
   assert.throws(()=>listAuthorizedServiceOriginalGrossMargins(),/Permission denied/);
  }
  for(const role of ["manager","admin","super_admin"]){
   setCurrentRole(role);
   assert.equal(listAuthorizedServiceOriginalGrossMargins()[0].estimatedGrossProfit,60);
  }
  orders.hydrateOrders({orders:[service("foreign","ladies_tailoring",100,30,10,
    {branchId:"other-branch"})]});
  setCurrentRole("manager");
  assert.deepEqual(listAuthorizedServiceOriginalGrossMargins(),[]);
 }finally{
  setCurrentRole(null);
  orders.hydrateOrders({orders:[]});
 }
});
test("service margin reports have gated UI and CSV/PDF/Excel exports",()=>{
 const s=fs.readFileSync(new URL("../../../ui/src/components/reports/ReportsPanel.tsx",import.meta.url),"utf8");
 assert.match(s,/service-profit/);
 assert.match(s,/listAuthorizedServiceOriginalGrossMargins/);
 assert.match(s,/estimatedGrossProfit/);
 assert.match(s,/mayReadServiceMargins = can\("accounting.view"\)/);
});
