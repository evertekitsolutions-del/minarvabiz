import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
 ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
 }).outputText,file);
const {calculateInactiveStock,listAuthorizedInactiveStock}=require("../inventory-dormancy.ts");
const {setCurrentRole}=require("../permissions.ts");
const store=require("../store.ts");
const now="2026-10-21";
const prod=(id,age,stock,cost,patch={})=>({
 id,name:id,sku:"SKU-"+id,createdAt:age+"T00:00:00Z",
 costPrice:cost,stockQuantity:stock,isActive:true,...patch,
});
const sale=(id,date,products,status="completed",patch={})=>({
 id,invoiceNumber:"INV-"+id,saleDate:date+"T12:00:00Z",
 status,items:products.map((productId,i)=>({id:id+"-"+i,productId,quantity:1})),
 ...patch,
});
test("inactivity buckets use LAST valid sale for CURRENT stock, never fake receipt ages",()=>{
 const products=[
  prod("never","2025-01-01",10,25),
  prod("recent","2025-01-01",12,20),
  prod("slow","2025-01-01",2,15),
  prod("zero","2025-01-01",0,20),
  prod("fresh","2026-10-01",10,20),
 ];
 const sales=[
  sale("recent","2026-10-20",["recent"]),
  sale("old","2026-06-01",["slow"]),
  sale("draft","2026-10-20",["never"],"draft"),
  sale("returned","2026-10-20",["never"],"returned"),
  sale("deleted","2026-10-20",["never"],"completed",{deletedAt:"2026-10-21"}),
 ];
 const at90=calculateInactiveStock(products,sales,now,90);
 assert.deepEqual(at90.map(r=>r.productId),["never","slow"]);
 assert.equal(at90[0].historicalCostValue,250);
 assert.equal(at90[0].lastSaleDate,null);
 assert.equal(at90[0].band,"dead_365");
 assert.equal(at90[1].band,"slow_90");
 assert.equal(at90[1].lastSaleDate,"2026-06-01");
 assert.deepEqual(calculateInactiveStock(products,sales,now,180).map(r=>r.productId),["never"]);
 assert.equal(calculateInactiveStock(products,sales,now,365)[0].productId,"never");
});
test("fractional current stock, negative/broken amounts and future dates",()=>{
 const fractional=prod("p","2025-01-01",1.125,25.50);
 const row=calculateInactiveStock([fractional],[],now)[0];
 assert.equal(row.currentStock,1.125);
 assert.equal(row.historicalCostValue,28.69);
 assert.throws(()=>calculateInactiveStock([prod("p","2025-01-01",1.0001,1)],[],now),/precision/);
 assert.throws(()=>calculateInactiveStock([prod("p","2025-01-01",NaN,1)],[],now),/invalid/);
 assert.throws(()=>calculateInactiveStock([prod("p","2025-01-01",1,-1)],[],now),/invalid/);
 assert.throws(()=>calculateInactiveStock([prod("p","2026-02-30",1,1)],[],now),/date/);
 assert.throws(()=>calculateInactiveStock([fractional],[],"2026-02-30"),/date/);
 assert.throws(()=>calculateInactiveStock([fractional],[],now,60),/Unsupported/);
 assert.deepEqual(calculateInactiveStock([prod("future","2026-11-01",2,1)],[],now),[]);
});
test("manager sees only authorized branch inventory; unauthenticated users denied",()=>{
 store.hydrateCore({products:[
  prod("allowed","2025-01-01",2,25),
  prod("foreign","2025-01-01",10,100,{branchId:"another-branch"}),
 ],sales:[]});
 try{
  setCurrentRole(null);
  assert.throws(()=>listAuthorizedInactiveStock(180,new Date(now+"T10:00:00Z")),/Permission denied/);
  setCurrentRole("manager");
  assert.deepEqual(listAuthorizedInactiveStock(180,new Date(now+"T10:00:00Z")).map(r=>r.productId),["allowed"]);
 }finally{
  setCurrentRole(null);
  store.hydrateCore({products:[],sales:[]});
 }
});
test("Reports panel offers labelled inactivity/stock report and normal export",()=>{
 const src=fs.readFileSync(new URL("../../../ui/src/components/reports/ReportsPanel.tsx",import.meta.url),"utf8");
 assert.match(src,/dead-stock/);
 assert.match(src,/listAuthorizedInactiveStock/);
 assert.match(src,/mayReadDormancy = can\("reports.view"\)/);
 assert.match(src,/Stock inactivity/);
});
