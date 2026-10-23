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
let product={id:"p1",name:"CCTV Power Supply",sku:"SMPS-12V",unit:"pcs",
  branchId:"b1",isActive:true,costPrice:120.25,stockQuantity:10};
const mocked={
  "@minarvabiz/utils":{generateId:()=>String(++seq),
    nowISO:()=>"2026-10-22T08:00:00.000Z"},
  "./permissions":{assertPermission:p=>{if(!permissions.has(p))throw new Error("Denied "+p)}},
  "./runtime-mode":{isProductionMode:()=>isProd},
  "./phase9-store":{getActiveBranch:()=>branch},
  "./audit-actions":{auditAction:(...args)=>events.push(args)},
  "./autosave":{touchPersistence:()=>persist++},
  "./orders-store":{getOrder:id=>id===order.id?order:null},
  "./store":{getProduct:id=>id===product.id?product:undefined},
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
  product={id:"p1",name:"CCTV Power Supply",sku:"SMPS-12V",unit:"pcs",
    branchId:"b1",isActive:true,costPrice:120.25,stockQuantity:10};
  permissions.add("orders.assign");permissions.add("reports.view");isProd=false;
}
function schedule(override={}){
  return domain.scheduleServiceSiteVisit({orderId:"o1",assignmentId:"a1",
    scheduledOn:"2026-10-23",siteAddress:"Customer service location",
    notes:"Inspect CCTV",...override});
}

function completedVisitForFeedback(){
  const v=schedule();
  let current=domain.markServiceSiteArrival(v.id,v.version);
  for(const check of current.checklist){
    current=domain.setServiceSiteVisitCheck({
      visitId:current.id,expectedVersion:current.version,
      itemId:check.id,result:"passed",notes:"Checked onsite"});
  }
  current=domain.recordServiceVisitSignatureDecline({
    visitId:current.id,expectedVersion:current.version,
    reason:"Authorized representative had left the site"});
  return domain.completeServiceSiteVisit(current.id,current.version);
}

function lowRatingRecoveryVisit(){
  const finished=completedVisitForFeedback();
  return domain.recordServiceVisitFeedback({
    visitId:finished.id,expectedVersion:finished.version,
    outcome:"rated",rating:1,comment:"Camera loses signal repeatedly",
    source:"phone",customerResponseConfirmed:true,
  });
}
test("SVC-FB02 low rating opens offline follow-up and requires actual contact before closure",()=>{
  reset();
  let v=lowRatingRecoveryVisit();
  const startPersist=persist;
  assert.equal(v.recovery,null);
  assert.throws(()=>domain.closeServiceVisitRecovery({
    visitId:v.id,expectedVersion:v.version,outcome:"resolved",
    outcomeNotes:"Repaired and tested" }),/contact/);
  v=domain.openServiceVisitRecovery({visitId:v.id,expectedVersion:v.version,
    dueOn:"2026-10-23",plan:"Call to diagnose recurring signal loss"});
  assert.equal(v.recovery.status,"open");
  assert.equal(v.recovery.dueOn,"2026-10-23");
  assert.equal(events.at(-1)[0],"service_site_visit.recovery_open");
  assert.ok(!JSON.stringify(events.at(-1)).includes("signal loss"));
  assert.throws(()=>domain.closeServiceVisitRecovery({
    visitId:v.id,expectedVersion:v.version,
    outcome:"resolved",outcomeNotes:"Repaired"}),/record contact/);
  v=domain.confirmServiceVisitRecoveryContact({visitId:v.id,
    expectedVersion:v.version,method:"phone",
    notes:"Spoke to customer, they agreed to a follow-up call"});
  assert.equal(v.recovery.status,"contacted");
  assert.ok(!JSON.stringify(events.at(-1)).includes("Spoke to customer"));
  v=domain.closeServiceVisitRecovery({visitId:v.id,expectedVersion:v.version,
    outcome:"closed_unresolved",
    outcomeNotes:"Customer still experiences issue, new service visit required"});
  assert.equal(v.recovery.status,"closed_unresolved");
  assert.equal(persist,startPersist+3);
  const backup=domain.exportServiceSiteVisits();
  backup[0].recovery.plan="tampered";
  assert.notEqual(domain.exportServiceSiteVisits()[0].recovery.plan,"tampered");
  const copy=domain.listServiceSiteVisits();
  copy[0].recovery.contactNotes="tampered";
  assert.notEqual(domain.listServiceSiteVisits()[0].recovery.contactNotes,"tampered");
  assert.throws(()=>domain.closeServiceVisitRecovery({
    visitId:v.id,expectedVersion:v.version,
    outcome:"resolved",outcomeNotes:"Changed mind"}),/record contact/);
  const persisted=domain.exportServiceSiteVisits();
  domain.hydrateServiceSiteVisits([]);
  domain.hydrateServiceSiteVisits(persisted);
  assert.deepEqual(domain.exportServiceSiteVisits(),persisted);
});
test("SVC-FB02 permission, active branch, feedback and version boundaries are fail-closed",()=>{
  reset();const v=lowRatingRecoveryVisit();
  const cmd={visitId:v.id,expectedVersion:v.version,
    dueOn:"2026-10-23",plan:"Call customer after recurring equipment fault"};
  const startEvents=events.length,startPersist=persist;
  assert.throws(()=>domain.openServiceVisitRecovery({...cmd,expectedVersion:1}),/changed/);
  assert.throws(()=>domain.openServiceVisitRecovery({...cmd,plan:"no"}),/action plan/);
  assert.throws(()=>domain.openServiceVisitRecovery({...cmd,dueOn:"2026-10-21"}),/chronology/);
  branch.id="other";
  assert.throws(()=>domain.openServiceVisitRecovery(cmd),/active branch/);
  branch.id="b1";
  permissions.delete("orders.assign");
  assert.throws(()=>domain.openServiceVisitRecovery(cmd),/Denied/);
  permissions.add("orders.assign");
  isProd=true;
  assert.throws(()=>domain.openServiceVisitRecovery(cmd),/installed Windows SQLite/);
  isProd=false;
  order.customerId="mismatch";
  assert.throws(()=>domain.openServiceVisitRecovery(cmd),/order\/customer/);
  order.customerId="c1";
  assert.equal(domain.exportServiceSiteVisits()[0].recovery,null);
  assert.equal(events.length,startEvents);
  assert.equal(persist,startPersist);
  const opened=domain.openServiceVisitRecovery(cmd);
  assert.throws(()=>domain.openServiceVisitRecovery({...cmd,
    expectedVersion:opened.version}),/already opened/);
  assert.throws(()=>domain.confirmServiceVisitRecoveryContact({visitId:v.id,
    expectedVersion:opened.version,method:"phone",notes:"no"}),/contact note/);
  assert.throws(()=>domain.confirmServiceVisitRecoveryContact({visitId:v.id,
    expectedVersion:opened.version,method:"email",notes:"Called"}),/contact evidence/);
  assert.equal(domain.exportServiceSiteVisits()[0].recovery.status,"open");
});
test("SVC-FB02 all backup recovery data verified atomically; older visits remain valid",()=>{
  reset();let v=lowRatingRecoveryVisit();
  v=domain.openServiceVisitRecovery({visitId:v.id,expectedVersion:v.version,
    dueOn:"2026-10-23",plan:"Call customer privately"});
  const snapshot=domain.exportServiceSiteVisits();
  for(const x of [
    {...v.recovery,status:"resolved"},
    {...v.recovery,dueOn:"2026-02-30"},
    {...v.recovery,openedAt:"2026-10-24T09:00:00.000Z"},
    {...v.recovery,contactedAt:"2026-10-22T08:00:00.000Z"},
    {...v.recovery,plan:"A\nB"},
    {...v.recovery,foreign:true},
  ]){
    assert.throws(()=>domain.hydrateServiceSiteVisits([{...v,recovery:x}]));
    assert.deepEqual(domain.exportServiceSiteVisits(),snapshot);
  }
  const forged={...v,feedback:{...v.feedback,rating:5}};
  assert.throws(()=>domain.hydrateServiceSiteVisits([forged]),/low|rating/);
  assert.deepEqual(domain.exportServiceSiteVisits(),snapshot);
  const legacy={...v};
  delete legacy.recovery;
  domain.hydrateServiceSiteVisits([legacy]);
  assert.deepEqual(domain.exportServiceSiteVisits(),[legacy]);
  domain.hydrateServiceSiteVisits(snapshot);
});
