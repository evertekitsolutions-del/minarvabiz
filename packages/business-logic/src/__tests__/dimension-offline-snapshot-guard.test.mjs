import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
      inlineSourceMap:true,inlineSources:true},
  }).outputText,file
);
const persistence=require("../persistence.ts");
const store=require("../store.ts");

const packet={
  schema:"dimension-line-v1",algorithm:"area-v1",length:"12",width:"18",
  lengthUnit:"in",widthUnit:"in",billableUnit:"sqft",pieces:2,quantityMilli:3000,
};
const initial=persistence.exportDomainSnapshotFull();
const sample={
  id:"area-sale-001",invoiceNumber:"INV-AREA-001",
  customerId:null,customerName:null,saleDate:"2026-10-18T10:00:00Z",
  subtotal:300,discountAmount:0,taxAmount:0,total:300,
  paidAmount:0,balanceAmount:300,status:"completed",notes:null,
  createdAt:"2026-10-18T10:00:00Z",updatedAt:"2026-10-18T10:00:00Z",
  version:1,
  items:[{
    id:"area-line-1",saleId:"area-sale-001",productId:"area-product",
    productName:"Area material",sku:null,quantity:3,unitPrice:100,
    costPrice:60,discountPercent:0,taxRate:0,lineTotal:300,
    dimensionMetadata:packet,
  }]
};
const backup={
  ...initial,
  sales:[...initial.sales,sample],
};
assert.equal(persistence.validateDomainSnapshot(backup).ok,true);
const restore=persistence.importDomainSnapshot(JSON.parse(JSON.stringify(backup)));
assert.equal(restore.ok,true,restore.error);
const saved=store.listSales().find(s=>s.id===sample.id);
assert.ok(saved,"Windows snapshot must preserve a dimensional invoice");
assert.deepEqual(saved.items[0].dimensionMetadata,packet);
const exported=persistence.exportDomainSnapshotFull();
assert.deepEqual(exported.sales.find(s=>s.id===sample.id)?.items[0].dimensionMetadata,packet);

for(const forged of [
  {...packet,length:"13"},
  {...packet,quantityMilli:2999},
  {...packet,schema:"dimension-line-v2"},
  {...packet,algorithm:"area-v2"},
  {...packet,extra:"unexpected"},
  {...packet,length:"1e2"},
]) {
  const tampered=structuredClone(exported);
  tampered.sales.find(s=>s.id===sample.id).items[0].dimensionMetadata=forged;
  const valid=persistence.validateDomainSnapshot(tampered);
  assert.equal(valid.ok,false,"Corrupt Windows sale measurement passed: "+JSON.stringify(forged));
  const rejected=persistence.importDomainSnapshot(tampered);
  assert.equal(rejected.ok,false);
  assert.deepEqual(
    store.listSales().find(s=>s.id===sample.id).items[0].dimensionMetadata,
    packet,"Rejected backup cannot overwrite previously restored invoice measurement"
  );
}
const quantityMismatch=structuredClone(exported);
quantityMismatch.sales.find(s=>s.id===sample.id).items[0].quantity=3.0004;
assert.equal(persistence.validateDomainSnapshot(quantityMismatch).ok,false);
const legacyWithoutItemCollection=structuredClone(exported);
legacyWithoutItemCollection.sales.find(s=>s.id===sample.id).items=undefined;
assert.equal(persistence.validateDomainSnapshot(legacyWithoutItemCollection).ok,true,
 "Existing pre-dimensional snapshots without sale item collection must remain readable");
const invalidItemCollection=structuredClone(exported);
invalidItemCollection.sales.find(s=>s.id===sample.id).items={not:"a list"};
assert.equal(persistence.validateDomainSnapshot(invalidItemCollection).ok,false);
const legacy=structuredClone(exported);
delete legacy.sales.find(s=>s.id===sample.id).items[0].dimensionMetadata;
assert.equal(persistence.validateDomainSnapshot(legacy).ok,true);
assert.equal(persistence.importDomainSnapshot(initial).ok,true);
console.log("UBP-05i: Windows snapshot dimensional sale roundtrip, tamper rejection, and unchanged legacy compatibility PASS");
