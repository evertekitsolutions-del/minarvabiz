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
  const ack=domain.recordServiceVisitSignatureDecline({visitId:v.id,
    expectedVersion:version,reason:"Customer declined handover signature"});
  version=ack.version;
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
  const ack=domain.recordServiceVisitSignatureDecline({visitId:v.id,
    expectedVersion:version,reason:"Customer was unavailable at handover"});
  const done=domain.completeServiceSiteVisit(v.id,ack.version);
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



const PNG_BASE64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==";
function fileInput(visit,overrides={}){
  return {visitId:visit.id,expectedVersion:visit.version,fileName:"camera-before.png",
    mimeType:"image/png",purpose:"before",notes:"Camera mounting state",
    byteLength:Buffer.from(PNG_BASE64,"base64").length,dataBase64:PNG_BASE64,
    ...overrides};
}
test("SVC-008 stores actual image bytes with visit, branch and audit without logging payload",()=>{
  reset();
  const visit=domain.markServiceSiteArrival(schedule().id,1);
  const oldPersist=persist;
  const added=domain.addServiceSiteVisitEvidence(fileInput(visit));
  assert.equal(added.version,3);
  assert.equal(added.evidence.length,1);
  assert.equal(added.evidence[0].fileName,"camera-before.png");
  assert.equal(added.evidence[0].dataBase64,PNG_BASE64);
  assert.equal(added.evidence[0].byteLength,Buffer.from(PNG_BASE64,"base64").length);
  assert.equal(events.at(-1)[0],"service_site_visit.evidence_add");
  assert.ok(!JSON.stringify(events.at(-1)).includes(PNG_BASE64));
  assert.equal(persist,oldPersist+1);
  const state=domain.exportServiceSiteVisits();
  const copy=domain.listServiceSiteVisits();
  copy[0].evidence[0].notes="tampered";
  assert.equal(domain.listServiceSiteVisits()[0].evidence[0].notes,"Camera mounting state");
  domain.hydrateServiceSiteVisits([]);
  domain.hydrateServiceSiteVisits(state);
  assert.deepEqual(domain.exportServiceSiteVisits(),state);
});
test("SVC-008 PDFs, JPEG and WebP attachments use allowlisted signatures, not filenames alone",()=>{
  reset();
  const visit=domain.markServiceSiteArrival(schedule().id,1);
  const payloads=[
    {fileName:"work-report.pdf",mimeType:"application/pdf",
      dataBase64:Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF").toString("base64"),
      purpose:"document"},
    {fileName:"camera-after.jpg",mimeType:"image/jpeg",
      dataBase64:Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,2,3,4,5]).toString("base64"),
      purpose:"after"},
    {fileName:"nvr.webp",mimeType:"image/webp",
      dataBase64:Buffer.from("RIFF0000WEBPVP8 one-image").toString("base64"),
      purpose:"diagnostic"},
  ];
  let current=visit;
  for(const p of payloads){
    current=domain.addServiceSiteVisitEvidence(fileInput(current,{
      ...p,byteLength:Buffer.from(p.dataBase64,"base64").length,
    }));
  }
  assert.equal(current.evidence.length,3);
  assert.deepEqual(current.evidence.map(x=>x.purpose),["document","after","diagnostic"]);
});
test("SVC-008 enforces MIME magic bytes, content size, canonical base64 and safe filenames",()=>{
  reset();
  const visit=domain.markServiceSiteArrival(schedule().id,1);
  const bad=[
    {fileName:"danger.html"},
    {fileName:"../danger.png"},
    {fileName:"C:\\photo.png"},
    {fileName:"malware.svg",mimeType:"image/svg+xml"},
    {fileName:"photo.pdf",mimeType:"image/png"},
    {mimeType:"application/pdf"},
    {purpose:"system"},
    {byteLength:1},
    {byteLength:2*1024*1024+1},
    {dataBase64:"%%%%"},
    {dataBase64:"YWJj===="},
    {dataBase64:Buffer.from("not a PNG at all").toString("base64"),byteLength:16},
    {notes:"a".repeat(501)},
    {fileName:"x".repeat(170)+".png"},
  ];
  for(const override of bad){
    const p=fileInput(visit,override);
    assert.throws(()=>domain.addServiceSiteVisitEvidence(p),undefined,
      JSON.stringify({name:override.fileName,mime:override.mimeType,size:override.byteLength}));
  }
  assert.equal(domain.exportServiceSiteVisits()[0].version,2);
  assert.equal(domain.exportServiceSiteVisits()[0].evidence.length,0);
});
test("SVC-008 removal requires reason and CAS; no binary data copied into audit events",()=>{
  reset();let visit=domain.markServiceSiteArrival(schedule().id,1);
  visit=domain.addServiceSiteVisitEvidence(fileInput(visit));
  const itemId=visit.evidence[0].id;
  const beforeAudit=events.length;
  assert.throws(()=>domain.removeServiceSiteVisitEvidence({
    visitId:visit.id,expectedVersion:visit.version,evidenceId:itemId,reason:"no",
  }),/reason/);
  assert.throws(()=>domain.removeServiceSiteVisitEvidence({
    visitId:visit.id,expectedVersion:visit.version-1,evidenceId:itemId,
    reason:"Wrong photo selected",
  }),/changed/);
  assert.equal(events.length,beforeAudit);
  const gone=domain.removeServiceSiteVisitEvidence({
    visitId:visit.id,expectedVersion:visit.version,evidenceId:itemId,
    reason:"Wrong photo selected",
  });
  assert.equal(gone.evidence.length,0);
  assert.equal(events.at(-1)[0],"service_site_visit.evidence_remove");
  assert.equal(events.at(-1)[4].reason,"Wrong photo selected");
  assert.ok(!JSON.stringify(events.at(-1)).includes(PNG_BASE64));
  assert.throws(()=>domain.removeServiceSiteVisitEvidence({
    visitId:visit.id,expectedVersion:gone.version,evidenceId:itemId,
    reason:"Wrong photo selected",
  }),/not found/);
});
test("SVC-008 permission, tenant and lifecycle boundaries protect evidence writes",()=>{
  reset();
  const scheduled=schedule();
  assert.throws(()=>domain.addServiceSiteVisitEvidence(fileInput(scheduled)),/after arrival/);
  const arrived=domain.markServiceSiteArrival(scheduled.id,1);
  branch.id="foreign";
  assert.throws(()=>domain.addServiceSiteVisitEvidence(fileInput(arrived)),/active branch/);
  branch.id="b1";
  permissions.delete("orders.assign");
  assert.throws(()=>domain.addServiceSiteVisitEvidence(fileInput(arrived)),/Denied/);
  permissions.add("orders.assign");
  isProd=true;
  assert.throws(()=>domain.addServiceSiteVisitEvidence(fileInput(arrived)),/installed Windows SQLite/);
  isProd=false;
  assignment.status="cancelled";
  assert.throws(()=>domain.addServiceSiteVisitEvidence(fileInput(arrived)),/assignment/);
  assignment.status="assigned";
  const added=domain.addServiceSiteVisitEvidence(fileInput(arrived));
  const id=added.evidence[0].id;
  for(const check of added.checklist){
    const current=domain.listServiceSiteVisits()[0];
    domain.setServiceSiteVisitCheck({visitId:current.id,expectedVersion:current.version,
      itemId:check.id,result:"passed",notes:"Verified"});
  }
  const final=domain.listServiceSiteVisits()[0];
  const ack=domain.recordServiceVisitSignatureDecline({visitId:final.id,
    expectedVersion:final.version,reason:"Customer unable to sign at handover"});
  const completed=domain.completeServiceSiteVisit(final.id,ack.version);
  assert.equal(completed.evidence.length,1);
  assert.throws(()=>domain.addServiceSiteVisitEvidence(fileInput(completed)),/after arrival/);
  assert.throws(()=>domain.removeServiceSiteVisitEvidence({
    visitId:completed.id,expectedVersion:completed.version,evidenceId:id,
    reason:"Too late to remove",
  }),/after arrival/);
});
test("SVC-008 backup validation rejects tampering without partially applying any record",()=>{
  reset();let visit=domain.markServiceSiteArrival(schedule().id,1);
  visit=domain.addServiceSiteVisitEvidence(fileInput(visit));
  const original=domain.exportServiceSiteVisits();
  const evidence=visit.evidence[0];
  const tampered=[
    [{...visit,evidence:[{...evidence,dataBase64:"aa"}]}],
    [{...visit,evidence:[{...evidence,byteLength:9999}]}],
    [{...visit,evidence:[{...evidence,mimeType:"image/svg+xml"}]}],
    [{...visit,evidence:[{...evidence,purpose:"unknown"}]}],
    [{...visit,evidence:[{...evidence,uploadedAt:"2025-01-01T00:00:00.000Z"}]}],
    [{...visit,evidence:[evidence,evidence]}],
    [{...visit,evidence:[{...evidence,bogus:"extra"}]}],
    [{...visit,status:"scheduled",arrivedAt:null,evidence:[evidence]}],
    [{...visit,evidence:"wrong"}],
    [{...visit,evidence:Array(7).fill(evidence)}],
  ];
  for(const state of tampered){
    assert.throws(()=>domain.hydrateServiceSiteVisits(state));
    assert.deepEqual(domain.exportServiceSiteVisits(),original);
  }
  const legacy=structuredClone(visit);
  delete legacy.evidence;
  domain.hydrateServiceSiteVisits([legacy]);
  assert.deepEqual(domain.exportServiceSiteVisits(),[legacy]);
  domain.hydrateServiceSiteVisits(original);
  assert.deepEqual(domain.exportServiceSiteVisits(),original);
});
test("SVC-008 upload/download controls, existing snapshot path and raw-evidence audit isolation",()=>{
  const root=new URL("../../../",import.meta.url);
  const component=fs.readFileSync(new URL(
    "ui/src/components/orders/ServiceSiteVisitEvidencePanel.tsx",root),"utf8");
  const panel=fs.readFileSync(new URL(
    "ui/src/components/orders/ServiceSiteVisitPanel.tsx",root),"utf8");
  const service=fs.readFileSync(new URL(
    "business-logic/src/service-site-visit-register.ts",root),"utf8");
  const exports=fs.readFileSync(new URL(
    "business-logic/src/index.ts",root),"utf8");
  assert.match(panel,/ServiceSiteVisitEvidencePanel visit=\{v\}/);
  assert.match(component,/addServiceSiteVisitEvidence\(/);
  assert.match(component,/removeServiceSiteVisitEvidence\(/);
  assert.match(component,/readAsDataURL\(file\)/);
  assert.match(component,/URL\.createObjectURL\(blob\)/);
  assert.match(exports,/export \* from "\.\/service-site-visit-evidence"/);
  assert.match(service,/validateServiceVisitEvidenceList\(/);
  assert.match(service,/serviceVisitEvidenceBytes\(/);
  assert.match(service,/const \{dataBase64:ignored/);
});



function handoverPng(width=64,height=64){
  // Real 64x64 RGBA PNG with deflated scanlines and valid PNG CRC chunks.
  const zlib=require("node:zlib");
  const crc32=buf=>{
    let c=0xffffffff;
    for(const b of buf){
      c^=b;
      for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);
    }
    return (c^0xffffffff)>>>0;
  };
  const chunk=(name,body)=>{
    const nameBuf=Buffer.from(name,"ascii"),len=Buffer.alloc(4),crc=Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    crc.writeUInt32BE(crc32(Buffer.concat([nameBuf,body])));
    return Buffer.concat([len,nameBuf,body,crc]);
  };
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
  ihdr[8]=8;ihdr[9]=2;
  const scanline=Buffer.concat([Buffer.from([0]),Buffer.alloc(width*3,255)]);
  const signature=Buffer.from([137,80,78,71,13,10,26,10]);
  const bytes=Buffer.concat([signature,chunk("IHDR",ihdr),chunk("IDAT",
    zlib.deflateSync(Buffer.concat(Array.from({length:height},()=>scanline)))),
    chunk("IEND",Buffer.alloc(0))]);
  return bytes.toString("base64");
}
function readyVisit(){
  let visit=domain.markServiceSiteArrival(schedule().id,1);
  for(const item of visit.checklist){
    visit=domain.setServiceSiteVisitCheck({visitId:visit.id,expectedVersion:visit.version,
      itemId:item.id,result:"passed",notes:"Pass"});
  }
  return visit;
}
test("SVC-009 signing records user consent, protects original image and permits visit completion",()=>{
  reset();
  const visit=readyVisit();
  assert.equal(visit.handover,null);
  assert.throws(()=>domain.completeServiceSiteVisit(visit.id,visit.version),/signature or reasoned refusal/);
  const png=handoverPng();
  const before=persist;
  const signed=domain.captureServiceVisitSignature({
    visitId:visit.id,expectedVersion:visit.version,
    signerName:"Customer Representative",signaturePngBase64:png,
  });
  assert.equal(signed.handover.status,"signed");
  assert.equal(signed.handover.signerName,"Customer Representative");
  assert.equal(signed.handover.signaturePngBase64,png);
  assert.equal(signed.version,visit.version+1);
  assert.equal(persist,before+1);
  assert.equal(events.at(-1)[0],"service_site_visit.handover");
  assert.ok(!JSON.stringify(events.at(-1)).includes(png));
  assert.equal(events.at(-1)[4].handover.signatureCaptured,true);
  const completed=domain.completeServiceSiteVisit(signed.id,signed.version);
  assert.equal(completed.status,"completed");
  assert.equal(completed.handover.status,"signed");
  assert.ok(!JSON.stringify(events.at(-1)).includes(png));
  assert.throws(()=>domain.captureServiceVisitSignature({
    visitId:signed.id,expectedVersion:completed.version,
    signerName:"Customer Representative",signaturePngBase64:png,
  }),/only be recorded once/);
  const cloned=domain.listServiceSiteVisits()[0];
  cloned.handover.signaturePngBase64="tampered";
  assert.equal(domain.exportServiceSiteVisits()[0].handover.signaturePngBase64,png);
  const snapshot=domain.exportServiceSiteVisits();
  domain.hydrateServiceSiteVisits([]);
  domain.hydrateServiceSiteVisits(snapshot);
  assert.deepEqual(domain.exportServiceSiteVisits(),snapshot);
});
test("SVC-009 refusal is explicit, reasoned and accepted instead of forcing signature",()=>{
  reset();
  const visit=readyVisit();
  assert.throws(()=>domain.recordServiceVisitSignatureDecline({
    visitId:visit.id,expectedVersion:visit.version,reason:"no",
  }),/reason/);
  const declined=domain.recordServiceVisitSignatureDecline({
    visitId:visit.id,expectedVersion:visit.version,
    reason:"Customer does not wish to sign the handover",
  });
  assert.equal(declined.handover.status,"declined");
  assert.equal(declined.handover.signerName,null);
  assert.equal(declined.handover.signaturePngBase64,null);
  assert.equal(declined.handover.notice,require("../service-site-visit-signature.ts").SITE_VISIT_HANDOVER_NOTICE);
  assert.equal(domain.completeServiceSiteVisit(visit.id,declined.version).status,"completed");
  assert.ok(!JSON.stringify(events.at(-1)).includes("data:image/png"));
});
test("SVC-009 permission, branch, order, assignment and installed-Web safeguards",()=>{
  reset();
  const scheduled=schedule();
  assert.throws(()=>domain.recordServiceVisitSignatureDecline({
    visitId:scheduled.id,expectedVersion:1,reason:"Customer not available",
  }),/after site arrival/);
  const arrived=domain.markServiceSiteArrival(scheduled.id,1);
  const input={visitId:arrived.id,expectedVersion:arrived.version,reason:"Customer refused signature"};
  branch.id="branch-b";
  assert.throws(()=>domain.recordServiceVisitSignatureDecline(input),/active branch/);
  branch.id="b1";
  permissions.delete("orders.assign");
  assert.throws(()=>domain.recordServiceVisitSignatureDecline(input),/Denied/);
  permissions.add("orders.assign");
  isProd=true;
  assert.throws(()=>domain.recordServiceVisitSignatureDecline(input),/installed Windows SQLite/);
  isProd=false;
  assignment.status="cancelled";
  assert.throws(()=>domain.recordServiceVisitSignatureDecline(input),/assignment/);
  assignment.status="assigned";
  order.status="delivered";
  assert.throws(()=>domain.recordServiceVisitSignatureDecline(input),/active order/);
  order.status="processing";
  const declined=domain.recordServiceVisitSignatureDecline(input);
  assert.throws(()=>domain.recordServiceVisitSignatureDecline({
    ...input,expectedVersion:declined.version,
  }),/only be recorded once/);
});
test("SVC-009 rejects fake/tampered signatures and forged snapshot acknowledgments without partial hydration",()=>{
  reset();const v=readyVisit();
  const png=handoverPng();
  for(const signaturePngBase64 of [
    "", "%%%%", "eGVj",Buffer.alloc(200000,33).toString("base64"),
    Buffer.from("<svg onload=alert(1)>","utf8").toString("base64"),
    handoverPng(1,1),
  ]){
    assert.throws(()=>domain.captureServiceVisitSignature({
      visitId:v.id,expectedVersion:v.version,
      signerName:"Person",signaturePngBase64,
    }),undefined,signaturePngBase64.slice(0,20));
  }
  assert.equal(domain.exportServiceSiteVisits()[0].handover,null);
  const s=domain.captureServiceVisitSignature({
    visitId:v.id,expectedVersion:v.version,
    signerName:"Person",signaturePngBase64:png,
  });
  const original=domain.exportServiceSiteVisits();
  const bad=[
    [{...s,handover:{...s.handover,notice:"All warranty rights waived"}}],
    [{...s,handover:{...s.handover,status:"declined"}}],
    [{...s,handover:{...s.handover,signaturePngBase64:"tampered"}}],
    [{...s,handover:{...s.handover,signerName:""}}],
    [{...s,handover:{...s.handover,confirmedAt:"2024-01-01T00:00:00.000Z"}}],
    [{...s,handover:{...s.handover,bogus:true}}],
    [{...s,status:"scheduled",arrivedAt:null,handover:s.handover}],
  ];
  for(const snapshot of bad){
    assert.throws(()=>domain.hydrateServiceSiteVisits(snapshot));
    assert.deepEqual(domain.exportServiceSiteVisits(),original);
  }
  const legacy=structuredClone(s);
  delete legacy.handover;
  domain.hydrateServiceSiteVisits([legacy]);
  assert.deepEqual(domain.exportServiceSiteVisits(),[legacy]);
  domain.hydrateServiceSiteVisits(original);
});
test("SVC-009 existing photo evidence bytes remain absent from all visit/checklist/complete audits",()=>{
  reset();let visit=domain.markServiceSiteArrival(schedule().id,1);
  visit=domain.addServiceSiteVisitEvidence(fileInput(visit));
  for(const item of visit.checklist){
    visit=domain.setServiceSiteVisitCheck({visitId:visit.id,expectedVersion:visit.version,
      itemId:item.id,result:"passed",notes:"Checked"});
    assert.ok(!JSON.stringify(events.at(-1)).includes(PNG_BASE64));
  }
  const signed=domain.recordServiceVisitSignatureDecline({
    visitId:visit.id,expectedVersion:visit.version,reason:"Customer unavailable for signing",
  });
  assert.ok(!JSON.stringify(events.at(-1)).includes(PNG_BASE64));
  domain.completeServiceSiteVisit(signed.id,signed.version);
  assert.ok(!JSON.stringify(events.at(-1)).includes(PNG_BASE64));
});
test("SVC-009 customer signature canvas, consent, refusal and safe audit wiring",()=>{
  const root=new URL("../../../",import.meta.url);
  const ui=fs.readFileSync(new URL("ui/src/components/orders/ServiceVisitSignaturePanel.tsx",root),"utf8");
  const panel=fs.readFileSync(new URL("ui/src/components/orders/ServiceSiteVisitPanel.tsx",root),"utf8");
  const snapshot=fs.readFileSync(new URL("business-logic/src/persistence.ts",root),"utf8");
  const domainSrc=fs.readFileSync(new URL("business-logic/src/service-site-visit-register.ts",root),"utf8");
  assert.match(ui,/onPointerDown=\{down\}/);
  assert.match(ui,/toDataURL\("image\/png"\)/);
  assert.match(ui,/recordServiceVisitSignatureDecline\(/);
  assert.match(ui,/SITE_VISIT_HANDOVER_NOTICE/);
  assert.match(panel,/<ServiceVisitSignaturePanel visit=\{v\}/);
  assert.match(domainSrc,/auditVisit\(before\),auditVisit\(next\)/);
  assert.match(domainSrc,/signature or reasoned refusal/);
  assert.match(snapshot,/siteVisits\.hydrateServiceSiteVisits/);
});
