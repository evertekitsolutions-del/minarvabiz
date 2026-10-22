import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");

function loadTs(file,mocks){
 const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{
   fileName:typeof file==="string"?file:file.pathname,
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
 }).outputText;
 const mod={exports:{}};
 new Function("require","module","exports",js)(
   path=>{if(Object.hasOwn(mocks,path))return mocks[path];throw new Error("Unexpected mock "+path);},
   mod,mod.exports,
 );
 return mod.exports;
}
let version=0,saveCount=0,production=false;
const audit=[];
const perms=new Set(["inventory.adjust","reports.view"]);
const branch={id:"b1",isActive:true};
const products=[{id:"p1",name:"=Spreadsheet formula camera",isActive:true,branchId:"b1"}];
const wh=[{id:"w1",name:"Main",isActive:true,branchId:"b1"}];
const locations=[{id:"l1",warehouseId:"w1",code:"BIN1",isActive:true,name:"First"}];
let positions=[{id:"pos",productId:"p1",locationId:"l1",warehouseId:"w1",onHand:2}];
const serial=loadTs(new URL("../serial-custody-register.ts",import.meta.url),{
 "@minarvabiz/utils":{generateId:()=>String(++version),
   nowISO:()=>"2026-10-22T10:00:00.000Z"},
 "./permissions":{assertPermission:p=>{if(!perms.has(p))throw new Error("Missing permission "+p);}},
 "./runtime-mode":{isProductionMode:()=>production},
 "./audit-actions":{auditAction:(...args)=>audit.push(args)},
 "./autosave":{touchPersistence:()=>{saveCount++;}},
 "./phase9-store":{getActiveBranch:()=>branch},
 "./warehouse-store":{
   listWarehouses:()=>wh,
   listWarehouseLocations:id=>locations.filter(l=>!id||l.warehouseId===id),
   listWarehouseStock:filters=>positions.filter(p=>
     (!filters?.locationId||p.locationId===filters.locationId)&&
     (!filters?.productId||p.productId===filters.productId)),
 },
 "./store":{getProduct:id=>products.find(p=>p.id===id)},
});
function reset(){
 serial.hydrateSerialCustodyRecords([]);
 branch.id="b1";branch.isActive=true;production=false;
 perms.add("inventory.adjust");perms.add("reports.view");
 positions=[{id:"pos",productId:"p1",locationId:"l1",warehouseId:"w1",onHand:2}];
}
const create=(s,extra={})=>serial.createSerialCustodyRecord({
 warehouseId:"w1",locationId:"l1",productId:"p1",serialNumber:s,...extra,
});
test("physical serial registration persists, is audited, and rejects case-insensitive duplicates",()=>{
 reset();
 const before=saveCount;
 const a=create("SN-001");
 assert.equal(a.status,"in_stock");
 assert.equal(a.branchId,"b1");
 assert.equal(saveCount,before+1);
 assert.equal(a.version,1);
 assert.throws(()=>create("sn-001"),/already exists/);
 assert.equal(serial.listSerialCustodyRecords().length,1);
 const exported=serial.exportSerialCustodyRecords();
 exported[0].serialNumber="TAMPER";
 assert.equal(serial.listSerialCustodyRecords()[0].serialNumber,"SN-001");
 assert.equal(audit.at(-1)[0],"serial-custody.create");
});
test("one unit per serial count cannot exceed current allocated whole stock",()=>{
 reset();
 create("SN01");create("SN02");
 assert.throws(()=>create("SN03"),/exceeds allocated warehouse/);
 assert.equal(serial.listSerialCustodyRecords().length,2);
 positions[0].onHand=0;
 assert.throws(()=>create("SN04"),/exceeds allocated warehouse/);
});
test("custody status transitions record manual invoice reference, but never debit physical stock",()=>{
 reset();const a=create("IMEI123456789012345");const orig=JSON.stringify(positions);
 assert.throws(()=>serial.updateSerialCustodyRecord({
   id:a.id,expectedVersion:1,status:"sold",
 }),/requires a reference/);
 const sold=serial.updateSerialCustodyRecord({
   id:a.id,expectedVersion:1,status:"sold",reference:"INV-0123",
 });
 assert.equal(sold.version,2);
 assert.equal(sold.reference,"INV-0123");
 assert.equal(JSON.stringify(positions),orig);
 assert.throws(()=>serial.updateSerialCustodyRecord({
   id:a.id,expectedVersion:1,status:"service",
 }),/changed/);
 const service=serial.updateSerialCustodyRecord({
   id:a.id,expectedVersion:2,status:"service",notes:"Check warranty",
 });
 assert.equal(service.status,"service");
 const retired=serial.updateSerialCustodyRecord({
   id:a.id,expectedVersion:3,status:"retired",
 });
 assert.equal(retired.status,"retired");
 assert.throws(()=>serial.updateSerialCustodyRecord({
   id:a.id,expectedVersion:4,status:"in_stock",
 }),/Retired/);
});
test("branch/roles and production Web editing are fail-closed",()=>{
 reset();const a=create("ABC123");
 branch.id="b2";
 assert.equal(serial.listSerialCustodyRecords().length,0);
 assert.throws(()=>serial.updateSerialCustodyRecord({
   id:a.id,expectedVersion:1,status:"sold",reference:"INV1",
 }),/unavailable/);
 branch.id="b1";perms.delete("reports.view");
 assert.throws(()=>serial.listSerialCustodyRecords(),/Missing permission/);
 assert.throws(()=>serial.buildSerialCustodyReport(),/Missing permission/);
 perms.add("reports.view");perms.delete("inventory.adjust");
 assert.throws(()=>create("DEF123"),/Missing permission/);
 perms.add("inventory.adjust");production=true;
 assert.throws(()=>create("DEF123"),/installed Windows/);
});
test("backup is structurally prevalidated, duplicate serials and corrupt versions rejected atomically",()=>{
 reset();const a=create("SN-A"),b=create("SN-B");
 const backup=serial.exportSerialCustodyRecords();
 assert.equal(serial.validateSerialCustodyRecords(undefined).length,0);
 assert.equal(serial.validateSerialCustodyRecords(backup).length,2);
 for(const record of [
   {...a,version:0},{...a,serialNumber:"INVALID SPACE"},
   {...a,serialNumber:"SN\nA"},{...a,status:"sold",reference:""},
   {...a,createdAt:"invalid"}, {...a,unknown:"forged"},
 ]){
   assert.throws(()=>serial.validateSerialCustodyRecords([record]));
 }
 assert.throws(()=>serial.hydrateSerialCustodyRecords([a,{...b,serialNumber:"sn-a"}]),/Duplicate/);
 assert.deepEqual(serial.exportSerialCustodyRecords(),backup);
 assert.throws(()=>serial.hydrateSerialCustodyRecords([a,a]),/Duplicate/);
 assert.deepEqual(serial.exportSerialCustodyRecords(),backup);
});
test("serialized stock report searches serial/reference and safely quotes CSV",()=>{
 reset();const a=create("SN-GOOD",{notes:"=SUM(A1:A2)"});
 serial.updateSerialCustodyRecord({id:a.id,expectedVersion:1,status:"sold",reference:"INV-44",notes:"=SUM(A1:A2)"});
 create("SN-UNSOLD");
 const result=serial.buildSerialCustodyReport("inv-44");
 assert.equal(result.total,1);
 assert.equal(result.sold,1);
 assert.equal(result.rows[0].serialNumber,"SN-GOOD");
 assert.match(result.csv,/"'=Spreadsheet formula camera"/);
 assert.match(result.csv,/"'=SUM\(A1:A2\)"/);
 const all=serial.buildSerialCustodyReport();
 assert.equal(all.total,2);
 assert.equal(all.onHand,1);
});
test("shared UI, local snapshot and barrel export are wired without moving existing warehouse controls",()=>{
 const ui=fs.readFileSync(new URL("../../../ui/src/components/inventory/WarehouseSerialCustodyPanel.tsx",import.meta.url),"utf8");
 const host=fs.readFileSync(new URL("../../../ui/src/components/inventory/WarehousePanel.tsx",import.meta.url),"utf8");
 const persist=fs.readFileSync(new URL("../persistence.ts",import.meta.url),"utf8");
 const index=fs.readFileSync(new URL("../index.ts",import.meta.url),"utf8");
 assert.match(ui,/Register serial \/ IMEI/);
 assert.match(ui,/Manual custody status/);
 assert.match(ui,/Export serial CSV/);
 assert.match(host,/<WarehouseSerialCustodyPanel \/>/);
 assert.ok(host.indexOf("<WarehouseSerialCustodyPanel")>host.indexOf("Create location / bin"));
 assert.match(persist,/serialCustody: serialCustody\.exportSerialCustodyRecords\(\)/);
 assert.match(persist,/serialCustody\.validateSerialCustodyRecords\(input\.serialCustody/);
 assert.match(persist,/serialCustody\.hydrateSerialCustodyRecords\(snap\.serialCustody/);
 assert.match(index,/export \* from "\.\/serial-custody-register"/);
});
