import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");

function loadTs(file,mocks={}){
  const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName: typeof file === "string" ? file : file.pathname,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  const module={exports:{}};
  const mockRequire=(specifier)=>{
    if(Object.hasOwn(mocks,specifier))return mocks[specifier];
    throw new Error("Unexpected domain dependency: "+specifier);
  };
  new Function("require","module","exports",code)(mockRequire,module,module.exports);
  return module.exports;
}
const expiry=loadTs(new URL("../vendor/open-mercato/expiry.ts",import.meta.url));
const active={id:"b1",isActive:true};
let generated=0,saves=0;
let production=false;
const audits=[];
const permissions=new Set(["inventory.adjust","reports.view"]);
let products=[{id:"p1",name:"CCTV battery",isActive:true,branchId:"b1"}];
let warehouses=[{id:"w1",name:"Main warehouse",isActive:true,branchId:"b1"}];
const fixture=loadTs(new URL("../batch-expiry-register.ts",import.meta.url),{
  "@minarvabiz/utils":{generateId:()=>String(++generated),nowISO:()=>"2026-10-21T10:30:00.000Z"},
  "./permissions":{assertPermission:code=>{if(!permissions.has(code))throw new Error("Permission denied: "+code);}},
  "./runtime-mode":{isProductionMode:()=>production},
  "./autosave":{touchPersistence:()=>{saves++;}},
  "./audit-actions":{auditAction:(...args)=>audits.push(args)},
  "./store":{getProduct:id=>products.find(p=>p.id===id),listProducts:()=>products},
  "./warehouse-store":{listWarehouses:()=>warehouses},
  "./phase9-store":{getActiveBranch:()=>active},
  "./vendor/open-mercato/expiry":expiry,
});
const record=(input={})=>fixture.createBatchExpiryReminder({
  warehouseId:"w1",productId:"p1",batchCode:"B001",expiresOn:"2026-11-03",notes:"",...input,
});
const oldRow={
  id:"backup-1",branchId:"b1",warehouseId:"w1",productId:"p1",
  batchCode:"A1",expiresOn:"2026-12-31",notes:"",createdAt:"2026-10-21T10:30:00.000Z",
};
const reset=()=>{
  fixture.hydrateBatchExpiryReminders([]);
  products=[{id:"p1",name:"CCTV battery",isActive:true,branchId:"b1"}];
  warehouses=[{id:"w1",name:"Main warehouse",isActive:true,branchId:"b1"}];
  active.id="b1";active.isActive=true;production=false;
  permissions.add("inventory.adjust");permissions.add("reports.view");
};

test("uses actual Open Mercato MIT UTC boundary convention for 30-day expiry",()=>{
  assert.equal(expiry.EXPIRING_SOON_DAYS,30);
  const start=expiry.startOfUtcDay(new Date("2026-10-21T22:00:00Z"));
  assert.equal(start.toISOString().slice(0,10),"2026-10-21");
  assert.equal(expiry.addUtcDays(start,30).toISOString().slice(0,10),"2026-11-20");
});

test("records local metadata with audit and persistence, rejects duplicate batch",()=>{
  reset();
  const beforeSaves=saves,beforeAudits=audits.length;
  const x=record();
  assert.equal(x.branchId,"b1");
  assert.equal(x.batchCode,"B001");
  assert.equal(saves,beforeSaves+1);
  assert.equal(audits.length,beforeAudits+1);
  assert.equal(fixture.listBatchExpiryReminders().length,1);
  assert.throws(()=>record({expiresOn:"2027-01-01"}),/already registered/);
  assert.equal(fixture.exportBatchExpiryReminders().length,1);
  x.batchCode="tamper"; // exported object must not own the domain store
  assert.equal(fixture.listBatchExpiryReminders()[0].batchCode,"B001");
});

test("report distinguishes expired, day-zero, 30-day inclusive and later; safely escapes CSV",()=>{
  reset();
  record({batchCode:"old",expiresOn:"2026-10-20",notes:'=IMPORTXML("url")'});
  record({batchCode:"today",expiresOn:"2026-10-21"});
  record({batchCode:"thirty",expiresOn:"2026-11-20"});
  record({batchCode:"future",expiresOn:"2026-11-21"});
  const r=fixture.buildBatchExpiryReport("2026-10-21");
  assert.equal(r.expiringDays,30);
  assert.equal(r.expiredCount,1);
  assert.equal(r.expiringSoonCount,2);
  const statuses=Object.fromEntries(r.rows.map(x=>[x.batchCode,x.status]));
  assert.equal(statuses.old,"expired");
  assert.equal(statuses.today,"expiring_soon");
  assert.equal(statuses.thirty,"expiring_soon");
  assert.equal(statuses.future,"later");
  assert.match(r.csv,/"'=IMPORTXML\(""url""\)"/);
  assert.equal(r.csv.split("\r\n").length-2,4);
});

test("rejects forged foreign-branch warehouse/product and denied roles",()=>{
  reset();
  products=[{id:"p1",name:"Foreign product",branchId:"b2",isActive:true}];
  assert.throws(()=>record(),/active branch/);
  products=[{id:"p1",name:"Local",branchId:"b1",isActive:true}];
  warehouses=[{id:"w1",name:"Foreign warehouse",branchId:"b2",isActive:true}];
  assert.throws(()=>record(),/active branch/);
  warehouses=[{id:"w1",name:"Local warehouse",branchId:"b1",isActive:true}];
  permissions.delete("inventory.adjust");
  assert.throws(()=>record(),/Permission denied/);
  permissions.add("inventory.adjust");
  record();
  permissions.delete("reports.view");
  assert.throws(()=>fixture.listBatchExpiryReminders(),/Permission denied/);
  assert.throws(()=>fixture.buildBatchExpiryReport("2026-10-21"),/Permission denied/);
});

test("active-branch switch hides records and prevents removal across branch",()=>{
  reset();const x=record();
  active.id="b2";
  assert.equal(fixture.listBatchExpiryReminders().length,0);
  assert.equal(fixture.removeBatchExpiryReminder(x.id),false);
  active.id="b1";
  assert.equal(fixture.removeBatchExpiryReminder(x.id),true);
  assert.equal(fixture.exportBatchExpiryReminders().length,0);
});

test("production Web cannot silently save expiry data only to volatile memory",()=>{
  reset();production=true;
  assert.throws(()=>record(),/installed Windows local SQLite/);
  assert.equal(fixture.exportBatchExpiryReminders().length,0);
});

test("prevalidates old, malformed, duplicate and unsupported snapshot metadata",()=>{
  reset();
  assert.equal(fixture.validateBatchExpiryReminders(undefined).length,0);
  assert.equal(fixture.validateBatchExpiryReminders([oldRow]).length,1);
  for(const change of [
    {expiresOn:"2026-02-30"},{expiresOn:"2026/10/21"},
    {branchId:""},{notes:"x".repeat(501)},{batchCode:"B\n123"},
    {createdAt:"invalid"},{bogus:"unsupported"},
  ]){
    assert.throws(()=>fixture.validateBatchExpiryReminders([{...oldRow,...change}]));
  }
  assert.throws(()=>fixture.validateBatchExpiryReminders([oldRow,oldRow]),/Duplicate/);
  assert.throws(()=>fixture.validateBatchExpiryReminders({rows:[oldRow]}),/Invalid/);
  fixture.hydrateBatchExpiryReminders([oldRow]);
  assert.equal(fixture.exportBatchExpiryReminders().length,1);
  assert.throws(()=>fixture.hydrateBatchExpiryReminders([oldRow,{...oldRow,id:"2"}]),/Duplicate/);
  assert.equal(fixture.exportBatchExpiryReminders().length,1); // no partial restore
});

test("shared UI and desktop snapshot/restore are actually wired",()=>{
  const base=new URL("../../../ui/src/components/inventory/WarehouseBatchExpiryPanel.tsx",import.meta.url);
  const ui=fs.readFileSync(base,"utf8");
  const host=fs.readFileSync(new URL("../../../ui/src/components/inventory/WarehousePanel.tsx",import.meta.url),"utf8");
  const snap=fs.readFileSync(new URL("../persistence.ts",import.meta.url),"utf8");
  const entry=fs.readFileSync(new URL("../index.ts",import.meta.url),"utf8");
  assert.match(ui,/Save expiry reminder/);
  assert.match(ui,/Show expiry alerts/);
  assert.match(ui,/Export expiry CSV/);
  assert.match(host,/<WarehouseBatchExpiryPanel products=\{products\} warehouses=\{warehouses\} \/>/);
  assert.match(snap,/batchExpiry\.exportBatchExpiryReminders\(\)/);
  assert.match(snap,/batchExpiry\.validateBatchExpiryReminders\(/);
  assert.match(snap,/batchExpiry\.hydrateBatchExpiryReminders\(/);
  assert.match(entry,/export \* from "\.\/batch-expiry-register"/);
});

test("preserves full MIT license and pinned source attribution",()=>{
  const notice=fs.readFileSync(new URL("../../../../THIRD_PARTY_NOTICES.md",import.meta.url),"utf8");
  assert.match(notice,/Open Mercato — MIT WMS expiry-date calculation/);
  assert.match(notice,/eb3193df03b9ce0b196be417fe265c1dc47c0868/);
});
