import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const filename=require.resolve("../service-site-visit-register.ts");
const permissions=new Set(["orders.assign","reports.view"]);
let isProd=false,seq=0,persist=0;
const events=[];
const branch={id:"b1",isActive:true,deletedAt:null};
let order={id:"o1",customerId:"c1",branchId:"b1",orderDate:"2026-10-01",
  status:"processing",deletedAt:null};
let member={id:"s1",status:"active"};
let assignment={id:"a1",staffId:"s1",orderId:"o1",status:"assigned"};
const mocked={
  "@minarvabiz/utils":{generateId:()=>String(++seq),
    nowISO:()=>"2026-10-22T08:00:00.000Z"},
  "./permissions":{assertPermission:p=>{if(!permissions.has(p))throw new Error("Denied "+p)}},
  "./runtime-mode":{isProductionMode:()=>isProd},
  "./phase9-store":{getActiveBranch:()=>branch},
  "./audit-actions":{auditAction:(...args)=>events.push(args)},
  "./autosave":{touchPersistence:()=>persist++},
  "./orders-store":{getOrder:id=>id===order.id?order:null},
  "./phase6-store":{listAssignments:({orderId})=>assignment.orderId===orderId?[assignment]:[],
    getStaff:id=>id===member.id?member:null},
};
const originalExtension=require.extensions[".ts"];
const originalLoad=Module._load;
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,
      target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,file,
);
Module._load=function(request,parent,isMain){
  if(parent?.filename===filename&&Object.hasOwn(mocked,request))return mocked[request];
  return originalLoad.apply(this,arguments);
};
let domain;
try{
  delete require.cache[filename];
  domain=require(filename);
}finally{
  Module._load=originalLoad;
  if(originalExtension)require.extensions[".ts"]=originalExtension;
  else delete require.extensions[".ts"];
}
function reset(){
  domain.hydrateServiceSiteVisits([]);
  branch.id="b1";branch.isActive=true;branch.deletedAt=null;
  order={id:"o1",customerId:"c1",branchId:"b1",orderDate:"2026-10-01",
    status:"processing",deletedAt:null};
  member={id:"s1",status:"active"};
  assignment={id:"a1",staffId:"s1",orderId:"o1",status:"assigned"};
  permissions.add("orders.assign");permissions.add("reports.view");isProd=false;
}
function schedule(override={}){
  return domain.scheduleServiceSiteVisit({orderId:"o1",assignmentId:"a1",
    scheduledOn:"2026-10-23",siteAddress:"Customer service location",
    notes:"Inspect CCTV",...override});
}
test("real site visit captures immutable source identity and branch-scoped audit",()=>{
  reset();const old=persist;
  const v=schedule();
  assert.equal(v.customerId,"c1");assert.equal(v.branchId,"b1");
  assert.equal(v.staffId,"s1");assert.equal(v.status,"scheduled");
  assert.equal(v.version,1);assert.equal(v.arrivedAt,null);
  assert.equal(persist,old+1);
  assert.equal(events.at(-1)[0],"service_site_visit.schedule");
  const copy=domain.listServiceSiteVisits();assert.equal(copy.length,1);
  copy[0].notes="changed";
  assert.equal(domain.listServiceSiteVisits()[0].notes,"Inspect CCTV");
  assert.throws(()=>schedule(),/already scheduled/);
});
test("arrival and completion form durable, one-way versioned lifecycle",()=>{
  reset();const v=schedule();
  assert.throws(()=>domain.completeServiceSiteVisit(v.id,v.version),/transition/);
  assert.throws(()=>domain.markServiceSiteArrival(v.id,2),/changed/);
  const arrived=domain.markServiceSiteArrival(v.id,1);
  assert.equal(arrived.status,"arrived");
  assert.equal(arrived.version,2);
  assert.ok(arrived.arrivedAt);
  assert.throws(()=>domain.markServiceSiteArrival(v.id,2),/transition/);
  assert.throws(()=>domain.completeServiceSiteVisit(v.id,1),/changed/);
  const completed=domain.completeServiceSiteVisit(v.id,2);
  assert.equal(completed.status,"completed");
  assert.equal(completed.version,3);
  assert.ok(completed.completedAt);
  assert.equal(domain.exportServiceSiteVisits()[0].status,"completed");
  assert.throws(()=>domain.cancelServiceSiteVisit(v.id,3,"changed plans"),/transition/);
});
test("cancellation needs reason, stays audit-only, cannot be restarted",()=>{
  reset();const v=schedule();
  assert.throws(()=>domain.cancelServiceSiteVisit(v.id,1,"x"),/reason/);
  assert.equal(domain.exportServiceSiteVisits()[0].version,1);
  const cancelled=domain.cancelServiceSiteVisit(v.id,1,"Site inaccessible");
  assert.equal(cancelled.status,"cancelled");
  assert.equal(cancelled.cancellationReason,"Site inaccessible");
  assert.equal(cancelled.arrivedAt,null);
  assert.equal(events.at(-1)[0],"service_site_visit.cancel");
  assert.throws(()=>domain.markServiceSiteArrival(v.id,2),/transition/);
});
test("active branch, orders, assignment and authorization fail closed",()=>{
  reset();const v=schedule();
  branch.id="b2";assert.equal(domain.listServiceSiteVisits().length,0);
  assert.throws(()=>domain.markServiceSiteArrival(v.id,1),/active branch/);
  assert.throws(()=>schedule(),/verified branch/);
  branch.id="b1";
  permissions.delete("orders.assign");
  assert.throws(()=>schedule({scheduledOn:"2026-10-24"}),/Denied/);
  assert.throws(()=>domain.markServiceSiteArrival(v.id,1),/Denied/);
  permissions.add("orders.assign");
  permissions.delete("reports.view");
  assert.throws(()=>domain.listServiceSiteVisits(),/Denied/);
  permissions.add("reports.view");
  assignment.status="cancelled";
  assert.throws(()=>schedule({scheduledOn:"2026-10-24"}),/assignment/);
  assert.throws(()=>domain.markServiceSiteArrival(v.id,1),/assignment/);
  assignment.status="assigned";member.status="inactive";
  assert.throws(()=>schedule({scheduledOn:"2026-10-24"}),/assignment/);
  member.status="active";order.status="delivered";
  assert.throws(()=>schedule({scheduledOn:"2026-10-24"}),/active order/);
  order.status="processing";branch.isActive=false;
  assert.throws(()=>schedule({scheduledOn:"2026-10-24"}),/active site-visit branch/);
});
test("production Web writes fail closed and no audit/persistence mutation occurs",()=>{
  reset();const old=persist;const auditCount=events.length;
  isProd=true;
  assert.throws(()=>schedule(),/installed Windows SQLite/);
  assert.equal(domain.exportServiceSiteVisits().length,0);
  assert.equal(persist,old);assert.equal(events.length,auditCount);
  isProd=false;
});
test("input validation checks real calendar dates, branch, duplicates and length",()=>{
  reset();
  for(const input of [
    {scheduledOn:"2026-02-30"},{scheduledOn:"2026-09-30"},
    {siteAddress:" "},{siteAddress:"x".repeat(501)},
    {siteAddress:"A\nB"},{notes:"x".repeat(2001)},
    {assignmentId:"wrong"},{orderId:"wrong"},
  ])assert.throws(()=>schedule(input),undefined,JSON.stringify(input));
  assert.equal(domain.exportServiceSiteVisits().length,0);
});
test("legacy snapshots, full roundtrip, invalid lifecycle, duplicates reject without partial replacement",()=>{
  reset();const v=schedule();
  const s=domain.exportServiceSiteVisits();
  domain.hydrateServiceSiteVisits([]);
  assert.equal(domain.exportServiceSiteVisits().length,0);
  domain.hydrateServiceSiteVisits(s);
  assert.deepEqual(domain.exportServiceSiteVisits(),s);
  for(const invalid of [
    [...s,...s], [{...v,status:"completed"}],
    [{...v,status:"arrived",arrivedAt:"2025-10-22T08:00:00.000Z"}],
    [{...v,scheduledOn:"2026-02-30"}],
    [{...v,version:0}], [{...v,siteAddress:""}], [{...v,bogus:true}],
    [{...v,status:"cancelled",cancellationReason:""}],
    "bad", {},
  ]){
    assert.throws(()=>domain.hydrateServiceSiteVisits(invalid),undefined,JSON.stringify(invalid));
    assert.deepEqual(domain.exportServiceSiteVisits(),s);
  }
  assert.deepEqual(domain.validateServiceSiteVisits(undefined),[]);
  domain.hydrateServiceSiteVisits(undefined);
  assert.deepEqual(domain.exportServiceSiteVisits(),[]);
});
test("UI, domain export and atomic snapshot roundtrip wiring is present",()=>{
  const root=new URL("../../../",import.meta.url);
  const ui=fs.readFileSync(new URL("ui/src/components/orders/ServiceSiteVisitPanel.tsx",root),"utf8");
  const list=fs.readFileSync(new URL("ui/src/components/orders/OrderList.tsx",root),"utf8");
  const snapshot=fs.readFileSync(new URL("business-logic/src/persistence.ts",root),"utf8");
  const index=fs.readFileSync(new URL("business-logic/src/index.ts",root),"utf8");
  assert.match(ui,/markServiceSiteArrival\(v\.id,v\.version\)/);
  assert.match(ui,/completeServiceSiteVisit\(v\.id,v\.version\)/);
  assert.match(ui,/cancelServiceSiteVisit\(v\.id,v\.version,cancelReason\)/);
  assert.match(list,/<ServiceSiteVisitPanel orders=\{orders\} assignments=\{staffAssignments\} \/>/);
  assert.match(index,/export \* from "\.\/service-site-visit-register"/);
  assert.match(snapshot,/siteVisits\.validateServiceSiteVisits\(input\.serviceSiteVisits/);
  assert.match(snapshot,/siteVisits\.hydrateServiceSiteVisits\(snap\.serviceSiteVisits/);
  assert.match(snapshot,/siteVisits\.exportServiceSiteVisits\(\)/);
});
