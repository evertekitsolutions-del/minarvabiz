import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(
 ts.transpileModule(fs.readFileSync(filename,"utf8"),{
   fileName:filename,
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
 }).outputText,filename);
const {calculateCustomerSegments,listAuthorizedCustomerSegments}=require("../customer-segments-report.ts");
const {setCurrentRole}=require("../permissions.ts");
const store=require("../store.ts");
const orders=require("../orders-store.ts");

const now=new Date("2026-10-21T00:00:00.000Z");
const customers=[
 {id:"c-1",name:"Alice",createdAt:"2025-01-01"},
 {id:"c-2",name:"Bob",createdAt:"2025-01-01"},
 {id:"c-3",name:"Chris",createdAt:"2025-01-01"},
];
const sale=(id,customerId,status,total,patch={})=>({
 id,customerId,status,total,saleDate:"2026-10-20T08:00:00Z",...patch,
});
const service=(id,customerId,status,price,patch={})=>({
 id,customerId,status,price,orderDate:"2026-10-20T08:00:00Z",...patch,
});
test("CRM-007 uses existing RFM engine across finalized sales and delivered service orders",()=>{
 const rows=calculateCustomerSegments(customers,[
   sale("one","c-1","completed",100),
   sale("two","c-1","partial",200),
   sale("draft","c-1","draft",900),
   sale("returned","c-1","returned",999),
   sale("del","c-2","completed",100,{deletedAt:"2026-10-21"}),
 ],[
   service("svc","c-1","delivered",50),
   service("pending","c-2","processing",2000),
 ],now);
 const alice=rows.find(r=>r.customerId==="c-1");
 assert.equal(alice.completedTransactions,3);
 assert.equal(alice.totalBilled,350);
 assert.equal(alice.daysSinceLastTransaction,1);
 assert.equal(rows.find(r=>r.customerId==="c-2").segment,"new");
 assert.equal(rows.find(r=>r.customerId==="c-3").segment,"new");
 assert.equal(rows.length,3);
});
test("historical inactive buyers receive hibernating/lost segment via existing RFM",()=>{
 const rows=calculateCustomerSegments(customers,[
   sale("old","c-1","completed",100,{saleDate:"2025-01-01T00:00:00Z"}),
 ],[],now);
 assert.equal(rows.find(r=>r.customerId==="c-1").segment,"hibernating");
 assert.equal(rows.find(r=>r.customerId==="c-1").churnRisk,"high");
});
test("non-finite or negative billed value and invalid date are rejected",()=>{
 assert.throws(()=>calculateCustomerSegments(customers,[sale("bad","c-1","completed",NaN)],[],now),/invalid issued/);
 assert.throws(()=>calculateCustomerSegments(customers,[],[service("bad","c-1","delivered",-1)],now),/invalid issued/);
 assert.throws(()=>calculateCustomerSegments(customers,[],[],new Date(NaN)),/as-of date/);
});
test("customer segments require customers.manage and do not leak across branches",()=>{
 store.hydrateCore({customers:[
   {...customers[0],outstandingBalance:0,totalSpending:0,updatedAt:"2026-10-20",version:1},
 ]});
 orders.hydrateOrders({orders:[]});
 try {
   setCurrentRole("staff");
   assert.throws(()=>listAuthorizedCustomerSegments(now),/Permission denied/);
   // Tailors and cashiers already have customers.manage in the approved
   // role policy, so segmentation is allowed for those roles.
   for(const role of ["tailor","cashier","manager"]){
     setCurrentRole(role);
     assert.equal(listAuthorizedCustomerSegments(now)[0].customerId,"c-1");
   }
   setCurrentRole("manager");
   assert.equal(listAuthorizedCustomerSegments(now)[0].customerId,"c-1");
   store.hydrateCore({customers:[
     {...customers[0],branchId:"foreign",outstandingBalance:0,totalSpending:0,updatedAt:"2026-10-20"},
   ]});
   assert.deepEqual(listAuthorizedCustomerSegments(now),[]);
 }finally{
  setCurrentRole(null);
  store.hydrateCore({customers:[]});
  orders.hydrateOrders({orders:[]});
 }
});
test("shared customer list shows segment filters and resets filters",()=>{
 const ui=fs.readFileSync(new URL("../../../ui/src/components/customers/CustomerList.tsx",import.meta.url),"utf8");
 assert.match(ui,/segmentFilter/);
 assert.match(ui,/listAuthorizedCustomerSegments/);
 assert.match(ui,/Customer segment/);
 assert.match(ui,/setSegmentFilter\("all"\)/);
});
