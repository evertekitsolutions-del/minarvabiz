import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
function loadTs(path,mocks){
  const js=ts.transpileModule(fs.readFileSync(path,"utf8"),{
    fileName:path.pathname,compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
    },
  }).outputText;
  const mod={exports:{}};
  new Function("require","module","exports",js)(
    id=>{if(Object.hasOwn(mocks,id))return mocks[id];throw new Error("Unexpected dependency "+id);},
    mod,mod.exports,
  );
  return mod.exports;
}
let seq=0,persist=0,production=false;
const logs=[],permissions=new Set(["orders.manage","reports.view"]);
const branch={id:"a",isActive:true};
let sourceOrder={id:"order1",orderNumber:"SVC-01",customerId:"customer1",
  orderDate:"2026-01-01",status:"delivered",branchId:"a"};
const subject=loadTs(new URL("../service-warranty-register.ts",import.meta.url),{
  "@minarvabiz/utils":{generateId:()=>String(++seq),nowISO:()=>"2026-10-22T08:00:00.000Z"},
  "./permissions":{assertPermission:x=>{if(!permissions.has(x))throw new Error("Denied "+x);}},
  "./runtime-mode":{isProductionMode:()=>production},
  "./audit-actions":{auditAction:(...args)=>logs.push(args)},
  "./autosave":{touchPersistence:()=>{persist++;}},
  "./phase9-store":{getActiveBranch:()=>branch},
  "./orders-store":{getOrder:id=>id===sourceOrder.id?sourceOrder:null},
});
function reset(){
 subject.hydrateServiceWarrantyState({warranties:[],claims:[]});
 branch.id="a";branch.isActive=true;production=false;
 sourceOrder={id:"order1",orderNumber:"SVC-01",customerId:"customer1",
  orderDate:"2026-01-01",status:"delivered",branchId:"a"};
 permissions.add("orders.manage");permissions.add("reports.view");
}
function register(overrides={}){
 return subject.registerServiceWarranty({
  orderId:"order1",assetReference:"NVR-123",startsOn:"2026-10-01",
  endsOn:"2027-09-30",coverageTerms:"Service workmanship only",...overrides,
 });
}
function claim(warrantyId,overrides={}){
 return subject.openServiceWarrantyClaim({
  warrantyId,reportedOn:"2026-10-22",issue:"Camera loses signal",...overrides,
 });
}
test("delivered service warranty saves branch, order customer and audits offline",()=>{
 reset();const old=persist;
 const w=register();
 assert.equal(w.branchId,"a");assert.equal(w.customerId,"customer1");
 assert.equal(w.assetReference,"NVR-123");assert.equal(w.version,1);
 assert.equal(persist,old+1);
 assert.equal(logs.at(-1)[0],"service_warranty.register");
 const copy=subject.listServiceWarranties();
 assert.equal(copy.warranties.length,1);
 assert.equal(copy.claims.length,0);
 copy.warranties[0].assetReference="modified";
 assert.equal(subject.listServiceWarranties().warranties[0].assetReference,"NVR-123");
 assert.throws(()=>register(),/already has warranty/);
 assert.throws(()=>register({assetReference:"nvr-123"}),/already has warranty/);
});
test("warranty cannot be created on unfinished/foreign/archived services, dates are explicit",()=>{
 reset();sourceOrder.status="processing";
 assert.throws(()=>register(),/delivered/);
 sourceOrder.status="delivered";sourceOrder.branchId="b";
 assert.throws(()=>register(),/active branch/);
 sourceOrder.branchId="a";sourceOrder.deletedAt="2026-05-01";
 assert.throws(()=>register(),/delivered/);
 delete sourceOrder.deletedAt;
 for(const args of [
  {startsOn:"2025-12-31"}, {startsOn:"2027-01-01",endsOn:"2026-01-01"},
  {startsOn:"2026-02-30"}, {endsOn:"2027-02-30"},
  {assetReference:"=SUM(1,1)\n"}, {coverageTerms:"x".repeat(501)},
 ]){
  assert.throws(()=>register(args),undefined,JSON.stringify(args));
 }
});
test("warranty claim date inclusive, duplicate open claim and terminal resolution CAS",()=>{
 reset();const w=register();
 const first=claim(w.id,{reportedOn:w.startsOn});
 assert.equal(first.status,"open");
 assert.throws(()=>claim(w.id),/existing open/);
 assert.throws(()=>claim(w.id,{reportedOn:"2027-10-01"}),/outside warranty/);
 assert.throws(()=>claim(w.id,{reportedOn:"2026-09-30"}),/outside warranty/);
 assert.throws(()=>subject.closeServiceWarrantyClaim({
  claimId:first.id,expectedVersion:2,status:"resolved",resolutionNotes:"Replaced cable",
 }),/changed; refresh/);
 assert.throws(()=>subject.closeServiceWarrantyClaim({
  claimId:first.id,expectedVersion:1,status:"resolved",resolutionNotes:"",
 }),/reason required/);
 const resolved=subject.closeServiceWarrantyClaim({
  claimId:first.id,expectedVersion:1,status:"resolved",resolutionNotes:"Replaced cable",
 });
 assert.equal(resolved.version,2);assert.equal(resolved.status,"resolved");
 assert.equal(resolved.resolutionNotes,"Replaced cable");
 assert.throws(()=>subject.closeServiceWarrantyClaim({
  claimId:first.id,expectedVersion:2,status:"rejected",resolutionNotes:"Already settled",
 }),/already closed/);
 const second=claim(w.id,{reportedOn:w.endsOn,issue:"Intermittent device fault"});
 const rejected=subject.closeServiceWarrantyClaim({
  claimId:second.id,expectedVersion:1,status:"rejected",resolutionNotes:"Excluded accidental damage",
 });
 assert.equal(rejected.status,"rejected");
 assert.equal(subject.listServiceWarranties().claims.length,2);
});
test("branch privacy and permissions forbid foreign reads, edits and cross-branch claim closure",()=>{
 reset();const w=register();const opened=claim(w.id);
 branch.id="b";
 assert.equal(subject.listServiceWarranties().warranties.length,0);
 assert.throws(()=>claim(w.id),/active branch/);
 assert.throws(()=>subject.closeServiceWarrantyClaim({
  claimId:opened.id,expectedVersion:1,status:"resolved",resolutionNotes:"Fixed",
 }),/active branch/);
 branch.id="a";permissions.delete("orders.manage");
 assert.throws(()=>register({assetReference:"B"}),/Denied/);
 assert.throws(()=>claim(w.id),/Denied/);
 permissions.add("orders.manage");permissions.delete("reports.view");
 assert.throws(()=>subject.listServiceWarranties(),/Denied/);
});
test("production browser cannot silently persist only in memory",()=>{
 reset();production=true;
 assert.throws(()=>register(),/installed Windows SQLite/);
 assert.equal(subject.exportServiceWarrantyState().warranties.length,0);
});
test("full backup validates referential integrity, malformed dates, duplicates and is atomic",()=>{
 reset();const w=register();const c=claim(w.id);
 const good=subject.exportServiceWarrantyState();
 subject.hydrateServiceWarrantyState(good);
 assert.equal(subject.exportServiceWarrantyState().claims.length,1);
 const corrupted=[
  {...good,warranties:[w,{...w,id:"second"}]},
  {...good,warranties:[{...w,startsOn:"2026-02-30"}]},
  {...good,claims:[{...c,warrantyId:"foreign"}]},
  {...good,claims:[{...c,branchId:"other"}]},
  {...good,claims:[{...c,reportedOn:"2027-10-10"}]},
  {...good,claims:[c,c]},
  {...good,claims:[{...c,status:"resolved",resolutionNotes:""}]},
  {...good,claims:[{...c,unknown:"injection"}]},
  {...good,claims:{malformed:true}},
 ];
 const before=JSON.stringify(subject.exportServiceWarrantyState());
 for(const bad of corrupted){
   assert.throws(()=>subject.hydrateServiceWarrantyState(bad));
   assert.equal(JSON.stringify(subject.exportServiceWarrantyState()),before);
 }
 subject.hydrateServiceWarrantyState(null);
 assert.deepEqual(subject.exportServiceWarrantyState(),{warranties:[],claims:[]});
});
test("shared Orders Web/Windows UI and SQLite backup snapshot wire the same domain",()=>{
 const ui=fs.readFileSync(new URL("../../../ui/src/components/orders/ServiceWarrantyPanel.tsx",import.meta.url),"utf8");
 const list=fs.readFileSync(new URL("../../../ui/src/components/orders/OrderList.tsx",import.meta.url),"utf8");
 const snap=fs.readFileSync(new URL("../persistence.ts",import.meta.url),"utf8");
 const barrel=fs.readFileSync(new URL("../index.ts",import.meta.url),"utf8");
 assert.match(ui,/Save service warranty/);
 assert.match(ui,/Open warranty claim/);
 assert.match(ui,/Mark resolved/);
 assert.match(ui,/Production Web is read-only/);
 assert.match(list,/<ServiceWarrantyPanel orders=\{orders\} \/>/);
 assert.ok(list.indexOf("<ServiceWarrantyPanel")>list.indexOf("<DataTable"),
   "Existing service order filters and table must remain before warranty inputs");
 assert.match(snap,/serviceWarranty: serviceWarranty\.exportServiceWarrantyState\(\)/);
 assert.match(snap,/serviceWarranty\.validateServiceWarrantyState\(/);
 assert.match(snap,/serviceWarranty\.hydrateServiceWarrantyState\(/);
 assert.match(barrel,/export \* from "\.\/service-warranty-register"/);
});
