import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
    inlineSourceMap:true,inlineSources:true,
  }}).outputText,file);
const {buildSaleInvoiceHtml}=require("../invoice.ts");
const meta={
  schema:"dimension-line-v1",algorithm:"area-v1",
  length:"12",width:"18",lengthUnit:"in",widthUnit:"in",
  billableUnit:"sqft",pieces:2,quantityMilli:3000,
};
const sale=()=>({
  id:"dimension-invoice-1",invoiceNumber:"INV-AREA-001",
  customerId:null,customerName:null,saleDate:"2026-10-18T09:00:00Z",
  subtotal:300,total:300,discountAmount:0,taxAmount:0,
  paidAmount:300,balanceAmount:0,status:"completed",
  notes:null,createdAt:"2026-10-18T09:00:00Z",updatedAt:"2026-10-18T09:00:00Z",
  version:1,
  items:[{id:"dimension-item-1",saleId:"dimension-invoice-1",
    productId:"product-1",productName:"Area & Fabric",sku:"AREA",
    quantity:3,unitPrice:100,costPrice:50,discountPercent:0,taxRate:0,
    lineTotal:300,dimensionMetadata:meta}],
});
for(const paper of ["a4","thermal"]){
  const html=buildSaleInvoiceHtml(sale(),{paper,autoPrint:false});
  assert.match(html,/12 in/);
  assert.match(html,/18 in/);
  assert.match(html,/2 pcs/);
  assert.match(html,/3 sqft/);
  assert.match(html,/Area &amp; Fabric/);
  assert.match(html,/INV-AREA-001/);
  assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(html,/window\.print/);
}
const plain=sale();
delete plain.items[0].dimensionMetadata;
const ordinary=buildSaleInvoiceHtml(plain,{paper:"a4",autoPrint:false});
assert.doesNotMatch(ordinary,/12 in|18 in|2 pcs|Area quantity/);
for(const tamper of [
  {...meta,length:"13"},
  {...meta,quantityMilli:3001},
  {...meta,length:'<img src=x onerror=alert(1)>'},
  {...meta,billableUnit:"acre"},
]) {
  const forged=sale();
  forged.items[0].dimensionMetadata=tamper;
  assert.throws(()=>buildSaleInvoiceHtml(forged,{paper:"thermal",autoPrint:false}));
}

// Rendering may never silently round a financial quantity to 0.001 units.
for (const invalidQuantity of [3.0004, 2.999, Number.NaN, Number.POSITIVE_INFINITY]) {
  const altered=sale();
  altered.items[0].quantity=invalidQuantity;
  assert.throws(()=>buildSaleInvoiceHtml(altered,{paper:"a4",autoPrint:false}),
    /dimension|quantity|precision/i);
}
// A legacy row with explicitly null metadata is not a dimensional invoice.
const nullDimension=sale();
nullDimension.items[0].dimensionMetadata=null;
assert.doesNotMatch(buildSaleInvoiceHtml(nullDimension,{paper:"thermal",autoPrint:false}),
  /12 in|18 in|2 pcs|Area:/);

console.log("UBP-05j: A4 and thermal invoice dimension evidence, legacy and HTML safety PASS");
