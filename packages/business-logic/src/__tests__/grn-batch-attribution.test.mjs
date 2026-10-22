import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
let id=0,persists=0,production=false;
const audit=[],roles=new Set(["purchases.manage","reports.view"]);
const branch={id:"branch-A",isActive:true};
const receipts=[
  {id:"grn1",branchId:"branch-A",grnNumber:"GRN-001",receiptDate:"2026-10-22",
    lines:[{id:"line1",productId:"product1",warehouseLocationId:"loc1",receivedQuantity:5},
      {id:"line2",productId:"product2",warehouseLocationId:null,receivedQuantity:1.25}]},
  {id:"grn2",branchId:"branch-B",grnNumber:"GRN-B",receiptDate:"2026-10-22",
    lines:[{id:"line3",productId:"product1",warehouseLocationId:"loc2",receivedQuantity:9}]},
];
const file=new URL("../grn-batch-attribution.ts",import.meta.url);
const compiled=ts.transpileModule(fs.readFileSync(file,"utf8"),{
 fileName:file.pathname,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText;
const mappings={
 "@minarvabiz/utils":{generateId:()=>String(++id),nowISO:()=>"2026-10-22T08:00:00.000Z",
   toQuantityMilli:n=>{if(!Number.isFinite(n)||Math.abs(n*1000-Math.round(n*1000))>0.000001)throw new Error("invalid milli units");return Math.round(n*1000);}},
 "./permissions":{assertPermission:p=>{if(!roles.has(p))throw new Error("Permission denied: "+p);}},
 "./runtime-mode":{isProductionMode:()=>production},
 "./phase9-store":{getActiveBranch:()=>branch},
 "./procurement-store":{getGoodsReceipt:id=>receipts.find(x=>x.id===id)},
 "./autosave":{touchPersistence:()=>persists++},
 "./audit-actions":{auditAction:(...args)=>audit.push(args)},
};
const module={exports:{}};
new Function("require","module","exports",compiled)(
 id=>{if(Object.hasOwn(mappings,id))return mappings[id];throw new Error("Unexpected dependency "+id);},
 module,module.exports,
);
const domain=module.exports;
const reset=()=>{domain.hydrateGrnBatchAttributions([]);branch.id="branch-A";branch.isActive=true;production=false;roles.add("purchases.manage");roles.add("reports.view");};
const record=(extra={})=>domain.recordGrnBatchAttribution({
 goodsReceiptId:"grn1",goodsReceiptLineId:"line1",batchCode:"B1",
 expiryDate:"2027-01-31",quantity:"2.500",...extra,
});
test("posted GRN attribution is durable and does not call stock-posting functions",()=>{
 reset();const before=persists;
 const a=record();assert.equal(a.quantityMilli,2500);
 assert.deepEqual([a.goodsReceiptId,a.goodsReceiptLineId,a.warehouseLocationId,a.productId],
   ["grn1","line1","loc1","product1"]);
 assert.equal(domain.listGrnBatchAttributions().length,1);
 assert.equal(domain.grnBatchCoverage("grn1")[0].unattributedMilli,2500);
 assert.equal(persists,before+1);
 assert.equal(audit.at(-1)[0],"grn.batch-attribution.create");
 a.batchCode="changed";
 assert.equal(domain.exportGrnBatchAttributions()[0].batchCode,"B1");
});
test("multiple batches never exceed posted GRN line quantity and duplicate lot is refused",()=>{
 reset();record();
 const b=record({batchCode:"B2",quantity:"2.499"});
 assert.equal(b.quantityMilli,2499);
 assert.equal(domain.grnBatchCoverage("grn1")[0].unattributedMilli,1);
 assert.throws(()=>record({batchCode:"B3",quantity:"0.002"}),/cannot exceed/);
 assert.throws(()=>record({batchCode:"b1",quantity:"0.001"}),/same batch code/);
 const line2=record({goodsReceiptLineId:"line2",quantity:"1.250",batchCode:"LOT-2"});
 assert.equal(line2.warehouseLocationId,null);
 assert.equal(domain.grnBatchCoverage("grn1")[1].fullyAttributed,true);
});
test("void requires correct optimistic revision and reason, keeps immutable audit evidence",()=>{
 reset();const row=record();
 assert.throws(()=>domain.voidGrnBatchAttribution(row.id,1,""),/void reason/);
 assert.throws(()=>domain.voidGrnBatchAttribution(row.id,2,"mistake"),/Stale/);
 const after=domain.voidGrnBatchAttribution(row.id,1,"Wrong supplier batch");
 assert.equal(after.version,2);assert.equal(after.voidReason,"Wrong supplier batch");
 assert.equal(domain.grnBatchCoverage("grn1")[0].unattributedMilli,5000);
 assert.equal(domain.listGrnBatchAttributions().length,1);
 assert.throws(()=>domain.voidGrnBatchAttribution(row.id,2,"again"),/already voided/);
 assert.equal(audit.at(-1)[0],"grn.batch-attribution.void");
});
test("foreign GRNs, nonexistent lines, permissions and production browser reject writes",()=>{
 reset();
 assert.throws(()=>record({goodsReceiptId:"grn2",goodsReceiptLineId:"line3"}),/active branch/);
 assert.throws(()=>record({goodsReceiptLineId:"missing"}),/not a tracked product/);
 branch.id="branch-B";
 assert.equal(domain.listGrnBatchAttributions().length,0);
 branch.id="branch-A";
 roles.delete("purchases.manage");assert.throws(()=>record(),/Permission denied/);
 roles.add("purchases.manage");
 production=true;assert.throws(()=>record(),/installed Windows SQLite/);
 production=false;
 roles.delete("reports.view");assert.throws(()=>domain.grnBatchCoverage("grn1"),/Permission denied/);
});
test("validates strict quantity/date, rejects formula and unsafe precision",()=>{
 reset();
 for(const q of ["0","0.000","-1","1e3","1,234","1.0001","Infinity","90071992547410.000"]){
   assert.throws(()=>record({quantity:q}),undefined,"quantity "+q);
 }
 for(const expiryDate of ["2026-02-30","2026/01/01","", "2027-13-01"]){
   assert.throws(()=>record({expiryDate}),undefined,expiryDate);
 }
 assert.throws(()=>record({batchCode:"=1+1\n"}),/Invalid batch code/);
 assert.equal(domain.exportGrnBatchAttributions().length,0);
});
test("backup validation rejects duplicate or malformed rows atomically",()=>{
 reset();const a=record(),backup=domain.exportGrnBatchAttributions();
 assert.deepEqual(domain.validateGrnBatchAttributions(undefined),[]);
 assert.throws(()=>domain.validateGrnBatchAttributions([a,a]),/Duplicate/);
 assert.throws(()=>domain.validateGrnBatchAttributions([{...a,extra:true}]),/Unknown/);
 assert.throws(()=>domain.validateGrnBatchAttributions([{...a,quantityMilli:-1}]),/positive/);
 assert.throws(()=>domain.hydrateGrnBatchAttributions([a,{...a,id:"another"}]),/Duplicate/);
 assert.deepEqual(domain.exportGrnBatchAttributions(),backup);
 domain.hydrateGrnBatchAttributions(backup);
 assert.equal(domain.listGrnBatchAttributions().length,1);
});
test("Procurement UI and validated offline snapshot/restore are wired",()=>{
 const ui=fs.readFileSync(new URL("../../../ui/src/components/purchases/GrnBatchAttributionPanel.tsx",import.meta.url),"utf8");
 const host=fs.readFileSync(new URL("../../../ui/src/components/purchases/ProcurementPanel.tsx",import.meta.url),"utf8");
 const snap=fs.readFileSync(new URL("../persistence.ts",import.meta.url),"utf8");
 const barrel=fs.readFileSync(new URL("../index.ts",import.meta.url),"utf8");
 assert.match(ui,/Record GRN batch/);
 assert.match(ui,/Confirm void/);
 assert.match(ui,/read-only/);
 assert.match(host,/<GrnBatchAttributionPanel receipts=\{goodsReceipts\} products=\{products\} \/>/);
 assert.match(snap,/grnBatches\.validateGrnBatchAttributions\(input\.grnBatchAttributions/);
 assert.match(snap,/grnBatches\.exportGrnBatchAttributions\(\)/);
 assert.match(snap,/grnBatches\.hydrateGrnBatchAttributions\(snap\.grnBatchAttributions/);
 assert.match(barrel,/export \* from "\.\/grn-batch-attribution"/);
});
