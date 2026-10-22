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
  assert.throws(()=>domain.completeServiceSiteVisit(v.id,2),/checklist/);
  let version=arrived.version;
  for(const item of arrived.checklist){
    const updated=domain.setServiceSiteVisitCheck({visitId:v.id,expectedVersion:version,
      itemId:item.id,result:"passed",notes:"Verified"});
    version=updated.version;
  }
  const completed=domain.completeServiceSiteVisit(v.id,version);
  assert.equal(completed.status,"completed");
  assert.equal(completed.version,version+1);
  assert.ok(completed.completedAt);
  assert.equal(domain.exportServiceSiteVisits()[0].status,"completed");
  assert.throws(()=>domain.cancelServiceSiteVisit(v.id,completed.version,"changed plans"),/transition/);
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
  const checklistUi=fs.readFileSync(new URL("ui/src/components/orders/ServiceSiteVisitChecklist.tsx",root),"utf8");
  assert.match(ui,/ServiceSiteVisitChecklist visit=\{v\}/);
  assert.match(checklistUi,/setServiceSiteVisitCheck\(/);
  assert.match(ui,/cancelServiceSiteVisit\(v\.id,v\.version,cancelReason\)/);
  assert.match(list,/<ServiceSiteVisitPanel orders=\{orders\} assignments=\{staffAssignments\} \/>/);
  assert.match(index,/export \* from "\.\/service-site-visit-register"/);
  assert.match(snapshot,/siteVisits\.validateServiceSiteVisits\(input\.serviceSiteVisits/);
  assert.match(snapshot,/siteVisits\.hydrateServiceSiteVisits\(snap\.serviceSiteVisits/);
  assert.match(snapshot,/siteVisits\.exportServiceSiteVisits\(\)/);
});


test("required checklist blocks premature completion; failed item must be corrected or justified",()=>{
  reset();const v=schedule();
  const arrived=domain.markServiceSiteArrival(v.id,1);
  const checks=arrived.checklist;
  assert.equal(checks.length,4);
  assert.throws(()=>domain.completeServiceSiteVisit(v.id,2),/checklist/);
  assert.throws(()=>domain.setServiceSiteVisitCheck({visitId:v.id,
    expectedVersion:2,itemId:checks[0].id,result:"failed",notes:""}),/reason/);
  assert.throws(()=>domain.setServiceSiteVisitCheck({visitId:v.id,
    expectedVersion:2,itemId:checks[0].id,result:"not_applicable",notes:"no"}),/reason/);
  const failed=domain.setServiceSiteVisitCheck({visitId:v.id,
    expectedVersion:2,itemId:checks[0].id,result:"failed",notes:"Device short circuit"});
  assert.equal(failed.checklist[0].result,"failed");
  assert.equal(failed.version,3);
  assert.throws(()=>domain.completeServiceSiteVisit(v.id,3),/checklist/);
  let version=3;
  const waived=domain.setServiceSiteVisitCheck({visitId:v.id,expectedVersion:version++,
    itemId:checks[0].id,result:"not_applicable",notes:"Power isolated by site electrician"});
  assert.equal(waived.checklist[0].result,"not_applicable");
  for(const check of checks.slice(1)){
    domain.setServiceSiteVisitCheck({visitId:v.id,expectedVersion:version++,
      itemId:check.id,result:"passed",notes:"Checked"});
  }
  const done=domain.completeServiceSiteVisit(v.id,version);
  assert.equal(done.status,"completed");
  assert.deepEqual(done.checklist.map(x=>x.result),
    ["not_applicable","passed","passed","passed"]);
  assert.throws(()=>domain.setServiceSiteVisitCheck({visitId:v.id,expectedVersion:done.version,
    itemId:checks[0].id,result:"passed"}),/after site arrival/);
});

test("checklist CAS, unknown item and branch or permission denials never partially persist",()=>{
  reset();const created=schedule();
  assert.throws(()=>domain.setServiceSiteVisitCheck({visitId:created.id,expectedVersion:1,
    itemId:"safety",result:"passed"}),/after site arrival/);
  const arrived=domain.markServiceSiteArrival(created.id,1);
  const before=domain.exportServiceSiteVisits();
  const old=persist,eventsBefore=events.length;
  const base={visitId:created.id,expectedVersion:2,itemId:"safety",result:"passed"};
  assert.throws(()=>domain.setServiceSiteVisitCheck({...base,itemId:"unknown"}),/Unknown/);
  assert.throws(()=>domain.setServiceSiteVisitCheck({...base,result:"bogus"}),/Invalid/);
  assert.throws(()=>domain.setServiceSiteVisitCheck({...base,expectedVersion:1}),/changed/);
  assert.equal(persist,old);assert.equal(events.length,eventsBefore);
  assert.deepEqual(domain.exportServiceSiteVisits(),before);
  branch.id="branch2";
  assert.throws(()=>domain.setServiceSiteVisitCheck(base),/active branch/);
  branch.id="b1";
  permissions.delete("orders.assign");
  assert.throws(()=>domain.setServiceSiteVisitCheck(base),/Denied/);
  permissions.add("orders.assign");
  isProd=true;
  assert.throws(()=>domain.setServiceSiteVisitCheck(base),/installed Windows SQLite/);
  isProd=false;
  const saved=domain.setServiceSiteVisitCheck(base);
  assert.equal(saved.version,3);
  assert.equal(events.at(-1)[0],"service_site_visit.checklist_update");
  assert.throws(()=>domain.setServiceSiteVisitCheck(base),/changed/);
  saved.checklist[0].notes="tampered";
  assert.notEqual(domain.exportServiceSiteVisits()[0].checklist[0].notes,"tampered");
  const leaked=domain.listServiceSiteVisits();
  leaked[0].checklist[0].notes="changed";
  assert.notEqual(domain.listServiceSiteVisits()[0].checklist[0].notes,"changed");
});

test("checklist backup validation rejects malformed or tampered completions atomically",()=>{
  reset();const created=schedule();
  const snapshot=domain.exportServiceSiteVisits();
  const examples=[
    [{...created,checklist:[]}],
    [{...created,checklist:[...created.checklist,...created.checklist]}],
    [{...created,checklist:[{...created.checklist[0],result:"passed"}]}],
    [{...created,checklist:[{...created.checklist[0],bogus:true}]}],
    [{...created,checklist:[{...created.checklist[0],id:"UPPER"}]}],
    [{...created,checklist:[{...created.checklist[0],required:"yes"}]}],
    [{...created,checklist:[{...created.checklist[0],notes:"Injected"}]}],
    [{...created,status:"completed",arrivedAt:created.createdAt,
       completedAt:created.createdAt,checklist:created.checklist}],
  ];
  for(const invalid of examples){
    assert.throws(()=>domain.hydrateServiceSiteVisits(invalid),undefined,JSON.stringify(invalid));
    assert.deepEqual(domain.exportServiceSiteVisits(),snapshot);
  }
  const legacy=structuredClone(created);delete legacy.checklist;
  domain.hydrateServiceSiteVisits([legacy]);
  assert.deepEqual(domain.exportServiceSiteVisits(),[legacy]);
  const arrivedLegacy=domain.markServiceSiteArrival(legacy.id,legacy.version);
  const started=domain.startLegacySiteVisitChecklist(legacy.id,arrivedLegacy.version);
  assert.equal(started.checklist.length,4);
  assert.throws(()=>domain.startLegacySiteVisitChecklist(legacy.id,started.version),/legacy arrived/);
  assert.throws(()=>domain.completeServiceSiteVisit(legacy.id,started.version),/checklist/);
});
