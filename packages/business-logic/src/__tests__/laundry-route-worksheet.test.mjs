import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,f);
const {buildLaundryRouteDraft}=require("../laundry-route-worksheet.ts");
const day="2026-11-04";
const customer=(id,patch={})=>({id,name:"Customer "+id,address:"Street "+id+", Thiruvananthapuram",branchId:"east",...patch});
const order=(id,patch={})=>({id,orderNumber:"LDY-"+id,customerId:"c1",branchId:"east",
 mode:"in_house_ironing",status:"pending",pickupAt:day,dueAt:day,items:[{
 id:id+"i",processingStatus:"received",qualityStatus:"pending"}],...patch});
test("pickup route reuses customer addresses, deduplicates replay and groups tickets",()=>{
 const inputs=[order("a"),order("b"),order("a"),order("x",{customerId:"c2"})];
 const customers=[customer("c1"),customer("c2")];
 const copy=JSON.stringify(inputs);
 const draft=buildLaundryRouteDraft(inputs,customers,day,"pickup");
 assert.equal(draft.stops.length,2);
 assert.equal(draft.stops.find(s=>s.customerId==="c1")?.orderIds.length,2);
 assert.equal(draft.mapLinks.length,1);
 assert.match(draft.mapLinks[0].url,/^https:\/\/www\.google\.com\/maps\/dir\//);
 assert.equal(JSON.stringify(inputs),copy);
});
test("QC-incomplete due orders are not falsely marked ready for dropoff",()=>{
 const inputs=[order("a"),order("b",{mode:"outsourced",status:"sent",items:[{
  id:"b1",processingStatus:"ready",qualityStatus:"passed"}]}),order("c",{
   mode:"outsourced",status:"received",items:[{id:"c1",processingStatus:"ready",qualityStatus:"passed"}]
 })];
 const draft=buildLaundryRouteDraft(inputs,[customer("c1")],day,"dropoff");
 assert.deepEqual(draft.stops.flatMap(s=>s.orderIds),["c"]);
 assert.equal(draft.notReadyOrders,2);
});
test("invalid dates, missing address and foreign branch addresses fail closed",()=>{
 assert.throws(()=>buildLaundryRouteDraft([],[], "2026-02-31","pickup"),/Invalid route day/);
 assert.throws(()=>buildLaundryRouteDraft([],[],day,"invalid"),/Invalid laundry route input/);
 const missing=buildLaundryRouteDraft([order("a"),order("b",{customerId:"c2"})],[
  customer("c1",{address:""}),customer("c2",{branchId:"west"})
 ],day,"pickup");
 assert.equal(missing.stops.length,0);
 assert.equal(missing.missingAddressOrders,2);
});
test("more than eight customer addresses are split into safe Google Maps links",()=>{
 const orders=Array.from({length:17},(_,i)=>order(String(i),{customerId:"c"+i}));
 const customers=Array.from({length:17},(_,i)=>customer("c"+i));
 const result=buildLaundryRouteDraft(orders,customers,day,"pickup");
 assert.deepEqual(result.mapLinks.map(x=>x.stopIds.length),[8,8,1]);
});
test("shared Windows and Web laundry view includes the route worksheet",()=>{
 const list=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
 const panel=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryRoutePanel.tsx",import.meta.url),"utf8");
 assert.match(list,/LaundryRoutePanel/);
 assert.match(panel,/buildLaundryRouteDraft/);
 assert.match(panel,/No route optimization/);
});
