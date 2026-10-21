import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
function loadTs(path,mocks={}){
  const source=fs.readFileSync(path,"utf8");
  const filename=typeof path==="string"?path:path.pathname;
  const js=ts.transpileModule(source,{fileName:filename,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
  }}).outputText;
  const mod={exports:{}};
  new Function("require","module","exports",js)(
    id=>{if(Object.hasOwn(mocks,id))return mocks[id];throw new Error("Unexpected import "+id);},
    mod,mod.exports,
  );
  return mod.exports;
}
let idx=0,persists=0,production=false;
const audits=[],allowed=new Set(["inventory.adjust","reports.view"]);
const active={id:"branch-a",isActive:true};
const reminders=[
 {id:"r1",branchId:"branch-a",warehouseId:"w1",productId:"p1",batchCode:"OLD",expiresOn:"2026-10-30"},
 {id:"r2",branchId:"branch-a",warehouseId:"w1",productId:"p1",batchCode:"NEW",expiresOn:"2026-11-30"},
 {id:"r3",branchId:"branch-a",warehouseId:"w1",productId:"p1",batchCode:"EXPIRED",expiresOn:"2026-10-01"},
 {id:"r4",branchId:"branch-b",warehouseId:"w2",productId:"p2",batchCode:"FOREIGN",expiresOn:"2026-11-03"},
];
const bins=[{id:"loc1",warehouseId:"w1",code:"A",name:"A",isActive:true},
  {id:"loc2",warehouseId:"w1",code:"B",name:"B",isActive:true}];
let positions=[{id:"s1",warehouseId:"w1",locationId:"loc1",productId:"p1",onHand:6,reserved:0},
  {id:"s2",warehouseId:"w1",locationId:"loc2",productId:"p1",onHand:4,reserved:0}];
const module=loadTs(new URL("../local-lot-counts.ts",import.meta.url),{
  "@minarvabiz/utils":{generateId:()=>String(++idx),nowISO:()=>"2026-10-22T08:00:00.000Z"},
  "./permissions":{assertPermission:x=>{if(!allowed.has(x))throw new Error("Permission denied: "+x)}},
  "./runtime-mode":{isProductionMode:()=>production},
  "./autosave":{touchPersistence:()=>{persists++;}},
  "./audit-actions":{auditAction:(...args)=>audits.push(args)},
  "./phase9-store":{getActiveBranch:()=>active},
  "./batch-expiry-register":{exportBatchExpiryReminders:()=>reminders.map(x=>({...x}))},
  "./warehouse-store":{
    listWarehouseLocations:warehouseId=>bins.filter(x=>!warehouseId||x.warehouseId===warehouseId),
    listWarehouseStock:f=>positions.filter(x=>(!f?.locationId||f.locationId===x.locationId)&&
      (!f?.productId||f.productId===x.productId)),
  },
  "./tracked-inventory":loadTs(new URL("../tracked-inventory.ts",import.meta.url)),
});
function reset(){
  module.hydrateLocalLotCounts([]);production=false;
  active.id="branch-a";active.isActive=true;
  allowed.add("inventory.adjust");allowed.add("reports.view");
  positions=[{id:"s1",warehouseId:"w1",locationId:"loc1",productId:"p1",onHand:6,reserved:0},
    {id:"s2",warehouseId:"w1",locationId:"loc2",productId:"p1",onHand:4,reserved:0}];
}
const save=(r,q,extra={})=>module.saveLocalLotCount({reminderId:r,locationId:"loc1",quantity:q,...extra});
test("counted lots are durable, revisioned and audited without stock mutation",()=>{
  reset();const oldJSON=JSON.stringify(positions),before=persists;
  const row=save("r1","2.500");
  assert.equal(row.quantityMilli,2500);
  assert.equal(row.version,1);assert.equal(persists,before+1);
  assert.equal(module.listLocalLotCounts().length,1);
  assert.deepEqual(JSON.stringify(positions),oldJSON);
  assert.throws(()=>save("r1","3.0"),/already counted/);
  const revised=save("r1","3",{id:row.id,expectedVersion:1,status:"blocked"});
  assert.equal(revised.version,2);assert.equal(revised.status,"blocked");
  assert.throws(()=>save("r1","1",{id:row.id,expectedVersion:1}),/modified/);
  assert.equal(module.listLocalLotCounts()[0].quantityMilli,3000);
  assert.equal(audits.at(-1)[0],"local-lot.count.save");
});
test("aggregate recorded quantity cannot exceed actual physical bin",()=>{
  reset();save("r1","4");
  assert.throws(()=>save("r2","2.001"),/exceed allocated physical/);
  const next=save("r2","2");
  assert.equal(next.quantityMilli,2000);
  assert.throws(()=>save("r3","0.001"),/exceed allocated physical/);
  assert.throws(()=>save("r2","5",{id:next.id,expectedVersion:1}),/exceed allocated physical/);
});
test("branch isolation and warehouse/location validation fail closed",()=>{
  reset();const row=save("r1","1");
  assert.throws(()=>save("r4","1"),/active branch/);
  assert.throws(()=>save("r1","1",{locationId:"unknown"}),/Location does not belong/);
  active.id="branch-b";
  assert.equal(module.listLocalLotCounts().length,0);
  assert.equal(module.deleteLocalLotCount(row.id,1),false);
  active.id="branch-a";
  assert.equal(module.deleteLocalLotCount(row.id,1),true);
});
test("FEFO excludes expired and blocked lots; orders valid nearest expiry first",()=>{
  reset();save("r3","1");
  save("r1","2");save("r2","3");
  let w=module.planLocalLotFefo({warehouseId:"w1",productId:"p1",quantity:"4",asOfDate:"2026-10-22"});
  assert.equal(w.advisoryOnly,true);
  assert.deepEqual(w.allocations.map(x=>[x.batchCode,x.quantityMilli]),[["OLD",2000],["NEW",2000]]);
  const newRow=module.listLocalLotCounts().find(x=>x.reminderId==="r1");
  save("r1","2",{id:newRow.id,expectedVersion:1,status:"blocked"});
  assert.throws(()=>module.planLocalLotFefo({warehouseId:"w1",productId:"p1",quantity:"4",asOfDate:"2026-10-22"}),/Insufficient saleable/);
  w=module.planLocalLotFefo({warehouseId:"w1",productId:"p1",quantity:"2",asOfDate:"2026-10-22"});
  assert.deepEqual(w.allocations.map(x=>x.batchCode),["NEW"]);
});
test("FEFO rejects stale WMS counts and damaged batch references",()=>{
  reset();save("r1","3");positions[0].onHand=2;
  assert.throws(()=>module.planLocalLotFefo({warehouseId:"w1",productId:"p1",quantity:"1",asOfDate:"2026-10-22"}),/WMS stock changed/);
  positions[0].onHand=6;
  const removed=reminders.shift();
  assert.throws(()=>module.planLocalLotFefo({warehouseId:"w1",productId:"p1",quantity:"1",asOfDate:"2026-10-22"}),/Batch reference changed/);
  reminders.unshift(removed);
});
test("reject invalid quantity, malformed backup, duplicate identity and privilege bypass",()=>{
  reset();
  for(const val of ["-1","0","0.000","1e2","1.1234","Infinity","1,4","1234567890123456789012345"]){
    assert.throws(()=>save("r1",val),undefined,val);
  }
  assert.throws(()=>module.validateLocalLotCounts({foo:"bar"}),/Invalid/);
  const good=save("r1","2");const backup=module.exportLocalLotCounts();
  const bad=[{...good,quantityMilli:-10}];
  assert.throws(()=>module.hydrateLocalLotCounts(bad),/positive safe/);
  assert.deepEqual(module.exportLocalLotCounts(),backup);
  assert.throws(()=>module.validateLocalLotCounts([good,good]),/Duplicate/);
  assert.throws(()=>module.validateLocalLotCounts([{...good,unexpected:2}]),/Unknown/);
  allowed.delete("inventory.adjust");
  assert.throws(()=>save("r2","1"),/Permission denied/);
  allowed.add("inventory.adjust");
  allowed.delete("reports.view");
  assert.throws(()=>module.listLocalLotCounts(),/Permission denied/);
  assert.throws(()=>module.planLocalLotFefo({warehouseId:"w1",productId:"p1",quantity:"1",asOfDate:"2026-10-22"}),/Permission denied/);
});
test("production Web writes fail closed without installed Windows storage",()=>{
  reset();production=true;
  assert.throws(()=>save("r1","1"),/installed Windows SQLite/);
  assert.equal(module.exportLocalLotCounts().length,0);
});
test("UI, snapshot, backup, expiry reference and FEFO domain are connected",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/inventory/WarehouseLotCountPanel.tsx",import.meta.url),"utf8");
  const host=fs.readFileSync(new URL("../../../ui/src/components/inventory/WarehousePanel.tsx",import.meta.url),"utf8");
  const snapshot=fs.readFileSync(new URL("../persistence.ts",import.meta.url),"utf8");
  assert.match(ui,/Save physical count/);
  assert.match(ui,/Plan FEFO pick/);
  assert.match(ui,/Production Web is read-only/);
  assert.match(host,/<WarehouseLotCountPanel products=\{products\} warehouses=\{warehouses\} \/>/);
  assert.ok(host.indexOf("<WarehouseLotCountPanel")>host.indexOf("Create location / bin"));
  assert.match(snapshot,/localLotCounts: lotCounts\.exportLocalLotCounts\(\)/);
  assert.match(snapshot,/lotCounts\.validateLocalLotCounts\(input\.localLotCounts/);
  assert.match(snapshot,/lotCounts\.hydrateLocalLotCounts\(snap\.localLotCounts/);
  assert.match(fs.readFileSync(new URL("../index.ts",import.meta.url),"utf8"),/export \* from "\.\/local-lot-counts"/);
});
