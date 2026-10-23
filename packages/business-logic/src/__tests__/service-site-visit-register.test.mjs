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
  assert.match(list,/<ServiceSiteVisitPanel orders=\{orders\} assignments=\{staffAssignments\} customers=\{customers\} \/>/);
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


test("SVC-012 stores visit SLA targets only when explicitly provided and roundtrips offline backup",()=>{
  reset();
  const deadlines={arrivalDueAt:"2026-10-23T10:00:00.000Z",
    completionDueAt:"2026-10-23T18:00:00.000Z"};
  const visit=schedule({sla:deadlines});
  assert.deepEqual(visit.sla,deadlines);
  const exported=domain.exportServiceSiteVisits();
  exported[0].sla.arrivalDueAt="tampered";
  assert.equal(domain.exportServiceSiteVisits()[0].sla.arrivalDueAt,deadlines.arrivalDueAt);
  const safe=domain.exportServiceSiteVisits();
  domain.hydrateServiceSiteVisits([]);
  domain.hydrateServiceSiteVisits(safe);
  assert.deepEqual(domain.exportServiceSiteVisits(),safe);
  let current=domain.markServiceSiteArrival(visit.id,visit.version);
  assert.deepEqual(current.sla,deadlines);
  for(const item of current.checklist){
    current=domain.setServiceSiteVisitCheck({visitId:current.id,expectedVersion:current.version,
      itemId:item.id,result:"passed",notes:"Checked"});
  }
  current=domain.recordServiceVisitSignatureDecline({visitId:current.id,
    expectedVersion:current.version,reason:"Customer left location"});
  const completed=domain.completeServiceSiteVisit(current.id,current.version);
  assert.deepEqual(completed.sla,deadlines);
  assert.equal(events.at(-1)[0],"service_site_visit.complete");
});
test("SVC-012 invalid scheduled deadlines fail without mutation and tampered backups reject atomically",()=>{
  reset();const baseline=domain.exportServiceSiteVisits(),startAudit=events.length;
  const bad=[
    {arrivalDueAt:null,completionDueAt:null},
    {arrivalDueAt:"2026-10-20T10:00:00.000Z",completionDueAt:null},
    {arrivalDueAt:"2026-10-23T18:00:00.000Z",
      completionDueAt:"2026-10-23T09:00:00.000Z"},
    {arrivalDueAt:"tomorrow",completionDueAt:null},
    {arrivalDueAt:"2026-10-23T10:00:00.000Z",
      completionDueAt:null,tenantId:"spoof"},
  ];
  for(const sla of bad)assert.throws(()=>schedule({sla}),undefined,JSON.stringify(sla));
  assert.deepEqual(domain.exportServiceSiteVisits(),baseline);
  assert.equal(events.length,startAudit);
  const visit=schedule({sla:{
    arrivalDueAt:"2026-10-23T10:00:00.000Z",
    completionDueAt:"2026-10-23T18:00:00.000Z",
  }});
  const state=domain.exportServiceSiteVisits();
  for(const sla of bad){
    assert.throws(()=>domain.hydrateServiceSiteVisits([{...visit,sla}]));
    assert.deepEqual(domain.exportServiceSiteVisits(),state);
  }
  const older={...visit};
  delete older.sla;
  domain.hydrateServiceSiteVisits([older]);
  assert.deepEqual(domain.exportServiceSiteVisits(),[older]);
});
test("SVC-012 authorized branch is the only source for shared SLA worksheet",()=>{
  reset();const v=schedule({sla:{arrivalDueAt:"2026-10-23T10:00:00.000Z",completionDueAt:null}});
  assert.equal(domain.listServiceSiteVisits().length,1);
  branch.id="other";
  assert.deepEqual(domain.listServiceSiteVisits(),[]);
  permissions.delete("reports.view");
  assert.throws(()=>domain.listServiceSiteVisits(),/Denied/);
  branch.id="b1";permissions.add("reports.view");
  assert.equal(domain.listServiceSiteVisits()[0].id,v.id);
});


function usedInput(visit,overrides={}){
  return {visitId:visit.id,expectedVersion:visit.version,productId:"p1",
    quantity:"2.125",notes:"Replaced faulty supply",...overrides};
}
test("SVC-007 records branch-linked part usage cost snapshots, without stock debits",()=>{
  reset();
  const arrived=domain.markServiceSiteArrival(schedule().id,1);
  const oldStock=product.stockQuantity,oldPersist=persist;
  const current=domain.recordServiceVisitPart(usedInput(arrived));
  assert.equal(current.version,3);
  assert.equal(current.parts.length,1);
  const part=current.parts[0];
  assert.equal(part.quantityMilli,2125);
  assert.equal(part.unitCostMinor,12025);
  assert.equal(part.totalCostMinor,25553);
  assert.equal(part.productId,"p1");
  assert.equal(part.productName,"CCTV Power Supply");
  assert.equal(part.status,"used");
  assert.equal(product.stockQuantity,oldStock,"No automatic inventory debit");
  assert.equal(events.at(-1)[0],"service_site_visit.part_record");
  assert.equal(events.at(-1)[4].stockPosted,false);
  assert.equal(persist,oldPersist+1);
  const copy=domain.listServiceSiteVisits();copy[0].parts[0].notes="modified";
  assert.equal(domain.listServiceSiteVisits()[0].parts[0].notes,"Replaced faulty supply");
  const snap=domain.exportServiceSiteVisits();
  domain.hydrateServiceSiteVisits([]);
  domain.hydrateServiceSiteVisits(snap);
  assert.deepEqual(domain.exportServiceSiteVisits(),snap);
});
test("SVC-007 refuses duplicate stock effects, stale revisions, out of branch products and deleted SKU",()=>{
  reset();const arrived=domain.markServiceSiteArrival(schedule().id,1);
  const count=events.length,oldPersist=persist;
  for(const wrong of [
    {productId:"other"},{quantity:"0"},{quantity:"-2"},{quantity:"1.0001"},
    {quantity:"Infinity"},{quantity:"1e3"},{quantity:""},
    {notes:"x".repeat(501)},
  ])assert.throws(()=>domain.recordServiceVisitPart(usedInput(arrived,wrong)),
    undefined,JSON.stringify(wrong));
  product.branchId="b2";
  assert.throws(()=>domain.recordServiceVisitPart(usedInput(arrived)),/shared catalog/);
  product.branchId="b1";product.isActive=false;
  assert.throws(()=>domain.recordServiceVisitPart(usedInput(arrived)),/active product/);
  product.isActive=true;product.costPrice=12.345;
  assert.throws(()=>domain.recordServiceVisitPart(usedInput(arrived)),/precise cost/);
  product.costPrice=120.25;
  branch.id="b2";
  assert.throws(()=>domain.recordServiceVisitPart(usedInput(arrived)),/active branch/);
  branch.id="b1";permissions.delete("orders.assign");
  assert.throws(()=>domain.recordServiceVisitPart(usedInput(arrived)),/Denied/);
  permissions.add("orders.assign");isProd=true;
  assert.throws(()=>domain.recordServiceVisitPart(usedInput(arrived)),/installed Windows SQLite/);
  isProd=false;
  assignment.status="cancelled";
  assert.throws(()=>domain.recordServiceVisitPart(usedInput(arrived)),/assignment/);
  assignment.status="assigned";
  assert.deepEqual(domain.exportServiceSiteVisits()[0].parts,[]);
  assert.equal(events.length,count);
  assert.equal(persist,oldPersist);
  const recorded=domain.recordServiceVisitPart(usedInput(arrived));
  assert.throws(()=>domain.recordServiceVisitPart(usedInput(arrived)),/changed/);
  assert.equal(recorded.parts.length,1);
});
test("SVC-007 corrections preserve immutable usage entries and exclude voided costs",()=>{
  reset();let current=domain.markServiceSiteArrival(schedule().id,1);
  current=domain.recordServiceVisitPart(usedInput(current));
  assert.throws(()=>domain.voidServiceVisitPart({visitId:current.id,
    expectedVersion:current.version,partId:current.parts[0].id,reason:"x"}),/reason/);
  const active=current.parts[0];
  const voided=domain.voidServiceVisitPart({
    visitId:current.id,expectedVersion:current.version,partId:active.id,
    reason:"Incorrect part quantity, reentered separately",
  });
  assert.equal(voided.parts.length,1);
  assert.equal(voided.parts[0].status,"voided");
  assert.equal(voided.parts[0].voidReason,"Incorrect part quantity, reentered separately");
  assert.equal(events.at(-1)[0],"service_site_visit.part_void");
  assert.equal(events.at(-1)[4].stockPosted,false);
  assert.throws(()=>domain.voidServiceVisitPart({
    visitId:voided.id,expectedVersion:voided.version,partId:active.id,reason:"Again"}),/not found/);
  assert.equal(product.stockQuantity,10);
});
test("SVC-007 part usage is immutable after visit completion and available in backup",()=>{
  reset();let current=domain.markServiceSiteArrival(schedule().id,1);
  current=domain.recordServiceVisitPart(usedInput(current,{quantity:"0.5"}));
  for(const check of current.checklist)current=domain.setServiceSiteVisitCheck({
    visitId:current.id,expectedVersion:current.version,itemId:check.id,
    result:"passed",notes:"Confirmed"});
  current=domain.recordServiceVisitSignatureDecline({
    visitId:current.id,expectedVersion:current.version,reason:"Customer unavailable"});
  const completed=domain.completeServiceSiteVisit(current.id,current.version);
  assert.equal(completed.parts[0].quantityMilli,500);
  assert.throws(()=>domain.recordServiceVisitPart(usedInput(completed)),/during an arrived visit/);
  assert.throws(()=>domain.voidServiceVisitPart({visitId:completed.id,
    expectedVersion:completed.version,partId:completed.parts[0].id,reason:"Correct error"}),
    /before completion/);
  const previous=domain.exportServiceSiteVisits();
  domain.hydrateServiceSiteVisits(previous);
  assert.deepEqual(domain.exportServiceSiteVisits(),previous);
});
test("SVC-007 rejects corrupted cost, timestamps, identity and side-load state atomically",()=>{
  reset();let current=domain.markServiceSiteArrival(schedule().id,1);
  current=domain.recordServiceVisitPart(usedInput(current));
  const snapshot=domain.exportServiceSiteVisits();
  const part=current.parts[0];
  for(const entry of [
    {...part,totalCostMinor:1},
    {...part,quantityMilli:0},
    {...part,quantityMilli:1.5},
    {...part,unitCostMinor:-1},
    {...part,id:""},
    {...part,recordedAt:"2024-01-01T00:00:00.000Z"},
    {...part,status:"voided"},
    {...part,notes:"bad\ninput"},
    {...part,other:"data"},
  ]){
    assert.throws(()=>domain.hydrateServiceSiteVisits([{...current,parts:[entry]}]),
      undefined,JSON.stringify(entry));
    assert.deepEqual(domain.exportServiceSiteVisits(),snapshot);
  }
  assert.throws(()=>domain.hydrateServiceSiteVisits([{...current,parts:[part,part]}]),
    /Duplicate service part/);
  assert.deepEqual(domain.exportServiceSiteVisits(),snapshot);
  const legacy={...current};delete legacy.parts;
  domain.hydrateServiceSiteVisits([legacy]);
  assert.deepEqual(domain.exportServiceSiteVisits(),[legacy]);
  domain.hydrateServiceSiteVisits(snapshot);
});
test("SVC-007 runtime wiring presents product-linked usage and local ledger warning",()=>{
  const root=new URL("../../../",import.meta.url);
  const src=fs.readFileSync(new URL("ui/src/components/orders/ServiceVisitPartsPanel.tsx",root),"utf8");
  const panel=fs.readFileSync(new URL("ui/src/components/orders/ServiceSiteVisitPanel.tsx",root),"utf8");
  const domainSrc=fs.readFileSync(new URL("business-logic/src/service-site-visit-register.ts",root),"utf8");
  assert.match(src,/recordServiceVisitPart\(/);
  assert.match(src,/voidServiceVisitPart\(/);
  assert.match(src,/does not reduce product stock/);
  assert.match(panel,/<ServiceVisitPartsPanel visit=\{v\}/);
  assert.match(domainSrc,/productsStore\.getProduct\(productId\)/);
  assert.doesNotMatch(domainSrc,/remoteAdjustStock\(/);
});


test("SVC-013 route stop updates are optimistic, audited and included in Windows backup",()=>{
  reset();const v=schedule();
  assert.equal(v.routeSequence,null);
  const first=domain.setServiceSiteVisitRouteSequence({
    visitId:v.id,expectedVersion:v.version,routeSequence:2,
  });
  assert.equal(first.version,2);
  assert.equal(first.routeSequence,2);
  assert.equal(events.at(-1)[0],"service_site_visit.route_sequence");
  assert.equal(events.at(-1)[4].routeSequence,2);
  assert.throws(()=>domain.setServiceSiteVisitRouteSequence({
    visitId:v.id,expectedVersion:1,routeSequence:3,
  }),/changed/);
  const saved=domain.exportServiceSiteVisits();
  domain.hydrateServiceSiteVisits([]);
  domain.hydrateServiceSiteVisits(saved);
  assert.deepEqual(domain.exportServiceSiteVisits(),saved);
  const cleared=domain.setServiceSiteVisitRouteSequence({
    visitId:v.id,expectedVersion:2,routeSequence:null,
  });
  assert.equal(cleared.version,3);
  assert.equal(cleared.routeSequence,null);
  assert.equal(domain.listServiceSiteVisits()[0].routeSequence,null);
});

test("SVC-013 branch, staff assignment, production and role guard stop route changes",()=>{
  reset();const v=schedule();
  const before=domain.exportServiceSiteVisits();
  const auditCount=events.length,autoBefore=persist;
  for(const n of [0,-1,101,1.5,NaN,Infinity,undefined,"3"]){
    assert.throws(()=>domain.setServiceSiteVisitRouteSequence({
      visitId:v.id,expectedVersion:v.version,routeSequence:n,
    }),undefined,String(n));
  }
  branch.id="b2";
  assert.throws(()=>domain.setServiceSiteVisitRouteSequence({
    visitId:v.id,expectedVersion:v.version,routeSequence:1,
  }),/active branch/);
  branch.id="b1";
  permissions.delete("orders.assign");
  assert.throws(()=>domain.setServiceSiteVisitRouteSequence({
    visitId:v.id,expectedVersion:v.version,routeSequence:1,
  }),/Denied/);
  permissions.add("orders.assign");isProd=true;
  assert.throws(()=>domain.setServiceSiteVisitRouteSequence({
    visitId:v.id,expectedVersion:v.version,routeSequence:1,
  }),/installed Windows SQLite/);
  isProd=false;assignment.status="cancelled";
  assert.throws(()=>domain.setServiceSiteVisitRouteSequence({
    visitId:v.id,expectedVersion:v.version,routeSequence:1,
  }),/assignment/);
  assignment.status="assigned";
  assert.deepEqual(domain.exportServiceSiteVisits(),before);
  assert.equal(events.length,auditCount);assert.equal(persist,autoBefore);
});

test("SVC-013 conflicting route slots fail before snapshot replacement or live mutation",()=>{
  reset();const visit=schedule();
  const assigned=domain.setServiceSiteVisitRouteSequence({
    visitId:visit.id,expectedVersion:visit.version,routeSequence:1,
  });
  const other={...assigned,id:"other",orderId:"o2",assignmentId:"a2",
    createdAt:assigned.createdAt,version:1};
  const snapshot=domain.exportServiceSiteVisits();
  assert.throws(()=>domain.hydrateServiceSiteVisits([assigned,other]),
    /Duplicate technician route stop/);
  assert.deepEqual(domain.exportServiceSiteVisits(),snapshot);
  domain.hydrateServiceSiteVisits([assigned,{...other,routeSequence:2}]);
  assert.throws(()=>domain.setServiceSiteVisitRouteSequence({
    visitId:assigned.id,expectedVersion:assigned.version,routeSequence:2,
  }),/already used/);
  const current=domain.exportServiceSiteVisits();
  assert.equal(current[0].routeSequence,1);
  assert.equal(current[1].routeSequence,2);
  domain.hydrateServiceSiteVisits(snapshot);
});

test("SVC-013 finished visits cannot be reordered and old visit backups remain readable",()=>{
  reset();let visit=schedule();visit=domain.markServiceSiteArrival(visit.id,visit.version);
  for(const check of visit.checklist)visit=domain.setServiceSiteVisitCheck({
    visitId:visit.id,expectedVersion:visit.version,itemId:check.id,
    result:"passed",notes:"Confirmed"});
  visit=domain.recordServiceVisitSignatureDecline({visitId:visit.id,
    expectedVersion:visit.version,reason:"Signer was away from site"});
  const complete=domain.completeServiceSiteVisit(visit.id,visit.version);
  assert.throws(()=>domain.setServiceSiteVisitRouteSequence({
    visitId:complete.id,expectedVersion:complete.version,routeSequence:1,
  }),/closed site visit/);
  const legacy={...complete};delete legacy.routeSequence;
  domain.hydrateServiceSiteVisits([legacy]);
  assert.deepEqual(domain.exportServiceSiteVisits(),[legacy]);
  const wrong={...legacy,routeSequence:0};
  assert.throws(()=>domain.hydrateServiceSiteVisits([wrong]),/route/i);
  assert.deepEqual(domain.exportServiceSiteVisits(),[legacy]);
});


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
test("SVC-FB01 staff captures volunteered rating only after finished visit",()=>{
  reset();
  const scheduled=schedule();
  assert.throws(()=>domain.recordServiceVisitFeedback({
    visitId:scheduled.id,expectedVersion:scheduled.version,
    outcome:"rated",rating:5,comment:"",source:"in_person",
    customerResponseConfirmed:true}),/completed/);
  domain.hydrateServiceSiteVisits([]);
  const finished=completedVisitForFeedback(),before=persist;
  const response=domain.recordServiceVisitFeedback({
    visitId:finished.id,expectedVersion:finished.version,
    outcome:"rated",rating:2,comment:"Camera disconnects after rain",
    source:"phone",customerResponseConfirmed:true,
  });
  assert.equal(response.status,"completed");
  assert.equal(response.version,finished.version+1);
  assert.deepEqual(response.feedback,{
    outcome:"rated",rating:2,comment:"Camera disconnects after rain",
    source:"phone",recordedAt:"2026-10-22T08:00:00.000Z",
  });
  assert.equal(persist,before+1);
  assert.equal(events.at(-1)[0],"service_site_visit.feedback");
  assert.ok(!JSON.stringify(events.at(-1)).includes("Camera disconnects"));
  assert.equal(events.at(-1)[4].feedback.needsRecovery,true);
  const read=domain.listServiceSiteVisits();
  read[0].feedback.comment="Tampered";
  assert.equal(domain.listServiceSiteVisits()[0].feedback.comment,
    "Camera disconnects after rain");
  const snap=domain.exportServiceSiteVisits();
  domain.hydrateServiceSiteVisits([]);
  domain.hydrateServiceSiteVisits(snap);
  assert.deepEqual(domain.exportServiceSiteVisits(),snap);
});
test("SVC-FB01 customer may decline response with reason, never fake rating",()=>{
  reset();const finished=completedVisitForFeedback();
  const denied=domain.recordServiceVisitFeedback({
    visitId:finished.id,expectedVersion:finished.version,
    outcome:"declined",rating:null,comment:"Customer prefers not to respond",
    source:"in_person",customerResponseConfirmed:true,
  });
  assert.equal(denied.feedback.outcome,"declined");
  assert.equal(denied.feedback.rating,null);
  assert.equal(denied.feedback.comment,"Customer prefers not to respond");
  assert.throws(()=>domain.recordServiceVisitFeedback({
    visitId:denied.id,expectedVersion:denied.version,
    outcome:"rated",rating:5,comment:"",source:"phone",
    customerResponseConfirmed:true}),/only be captured once/);
});
test("SVC-FB01 requires customer response attestation and refuses stale, cross-branch and web writes",()=>{
  reset();const finished=completedVisitForFeedback();
  const data={visitId:finished.id,expectedVersion:finished.version,
    outcome:"rated",rating:5,comment:"Great service",source:"in_person",
    customerResponseConfirmed:true};
  const before=persist,eventsBefore=events.length;
  assert.throws(()=>domain.recordServiceVisitFeedback({...data,customerResponseConfirmed:false}),/Confirm/);
  assert.throws(()=>domain.recordServiceVisitFeedback({...data,expectedVersion:1}),/changed/);
  branch.id="b2";
  assert.throws(()=>domain.recordServiceVisitFeedback(data),/active branch/);
  branch.id="b1";
  permissions.delete("orders.assign");
  assert.throws(()=>domain.recordServiceVisitFeedback(data),/Denied/);
  permissions.add("orders.assign");
  isProd=true;
  assert.throws(()=>domain.recordServiceVisitFeedback(data),/installed Windows SQLite/);
  isProd=false;
  order.customerId="changed";
  assert.throws(()=>domain.recordServiceVisitFeedback(data),/order\/customer/);
  order.customerId="c1";order.status="delivered";
  const response=domain.recordServiceVisitFeedback(data);
  assert.equal(response.feedback.rating,5);
  assert.equal(persist,before+1);
  assert.equal(events.length,eventsBefore+1);
});
test("SVC-FB01 rejects malformed backup response and preserves state without partial hydration",()=>{
  reset();let finished=completedVisitForFeedback();
  finished=domain.recordServiceVisitFeedback({
    visitId:finished.id,expectedVersion:finished.version,
    outcome:"rated",rating:4,comment:"All equipment working",
    source:"whatsapp",customerResponseConfirmed:true,
  });
  const backup=domain.exportServiceSiteVisits();
  for(const tamper of [
    {...finished.feedback,rating:7},
    {...finished.feedback,recordedAt:"2026-10-21T00:00:00.000Z"},
    {...finished.feedback,recordedAt:"2026-10-25T00:00:00.000Z"},
    {...finished.feedback,comment:"Injected\nscript"},
    {...finished.feedback,outcome:"declined",rating:4},
    {...finished.feedback,extra:"forged"},
  ]){
    assert.throws(()=>domain.hydrateServiceSiteVisits([{...finished,feedback:tamper}]));
    assert.deepEqual(domain.exportServiceSiteVisits(),backup);
  }
  assert.throws(()=>domain.hydrateServiceSiteVisits([
    {...finished,status:"arrived",completedAt:null}]),/completed/);
  assert.deepEqual(domain.exportServiceSiteVisits(),backup);
  const legacy={...finished};delete legacy.feedback;
  domain.hydrateServiceSiteVisits([legacy]);
  assert.deepEqual(domain.exportServiceSiteVisits(),[legacy]);
  domain.hydrateServiceSiteVisits(backup);
});


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
