import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
const active={id:"b1",isActive:true};
const permissions=new Set(["reports.view"]);
const rec={id:"serial1",branchId:"b1",productId:"p1",
  serialNumber:"HIK-001",status:"sold",reference:"INV-2026-011"};
let records=[rec];
const posted={
  id:"sale1",invoiceNumber:"INV-2026-011",branchId:"b1",status:"completed",
  saleDate:"2026-10-21",customerName:"Customer A",
  items:[{productId:"p1",quantity:2},{productId:"p2",quantity:1}],
};
let sales=[posted];
function loadTs(file,mocks){
 const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{
   fileName:typeof file==="string"?file:file.pathname,
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
 }).outputText;
 const mod={exports:{}};
 new Function("require","module","exports",js)(id=>{
   if(Object.hasOwn(mocks,id))return mocks[id];throw new Error("Unexpected import "+id);
 },mod,mod.exports);
 return mod.exports;
}
const module=loadTs(new URL("../serial-invoice-reference.ts",import.meta.url),{
 "./permissions":{assertPermission:p=>{
    if(!permissions.has(p))throw new Error("Permission denied");
 }},
 "./phase9-store":{getActiveBranch:()=>active},
 "./serial-custody-register":{listSerialCustodyRecords:()=>records.filter(x=>x.branchId===active.id)},
 "./store":{listSales:()=>sales},
});
const check=()=>module.verifySerialInvoiceProductMatch("serial1");
function reset(){
 active.id="b1";active.isActive=true;
 permissions.add("reports.view");records=[rec];sales=[posted];
}
test("matches posted same-branch invoice containing product but never claims unique serial or warranty",()=>{
 reset();
 const r=check();
 assert.equal(r.status,"invoice_product_match");
 assert.equal(r.invoiceNumber,"INV-2026-011");
 assert.equal(r.saleDate,"2026-10-21");
 assert.equal(r.productQuantity,2);
 assert.equal(r.customerName,"Customer A");
 assert.equal(r.serialDeliveryVerified,false);
 assert.equal(r.warrantyEligibilityVerified,false);
 assert.match(r.explanation,/NOT verified/);
});
test("manual serial status and missing invoice references are not automatically verified",()=>{
 reset();
 records=[{...rec,status:"service",reference:""}];
 assert.equal(check().status,"not_marked_sold");
 records=[{...rec,reference:"made-up"}];
 assert.equal(check().status,"reference_not_found");
 records=[{...rec,reference:"sale1"}];
 assert.equal(check().status,"invoice_product_match");
});
test("returned, cancelled, draft invoices never grant sale/serial match",()=>{
 for(const status of ["returned","cancelled","draft"]){
   reset();sales=[{...posted,status}];
   assert.equal(check().status,"void_or_returned");
 }
});
test("wrong SKU or invalid invoice quantities fail closed",()=>{
 reset();sales=[{...posted,items:[{productId:"p2",quantity:5}]}];
 assert.equal(check().status,"product_not_on_invoice");
 for(const invalid of [0,-1,Number.NaN,1.23456,Number.MAX_SAFE_INTEGER]){
   reset();sales=[{...posted,items:[{productId:"p1",quantity:invalid}]}];
   assert.equal(check().status,"product_not_on_invoice");
 }
});
test("branch provenance and role gates stop cross-company invoice/customer leaks",()=>{
 reset();sales=[{...posted,branchId:"b2"}];
 const r=check();
 assert.equal(r.status,"reference_not_found");
 assert.equal(r.customerName,null);
 sales=[{...posted,branchId:null}];
 assert.equal(check().status,"reference_not_found");
 active.id="b2";
 assert.throws(check,/Serial not found/);
 active.id="b1";permissions.delete("reports.view");
 assert.throws(check,/Permission denied/);
});
test("ambiguous same-branch invoice numbers fail closed",()=>{
 reset();sales=[posted,{...posted,id:"another"}];
 const r=check();
 assert.equal(r.status,"ambiguous_invoice");
 assert.equal(r.invoiceNumber,null);
});
test("shared UI exposes explicit invoice check with warranty and unique-serial caveats",()=>{
 const ui=fs.readFileSync(new URL("../../../ui/src/components/inventory/WarehouseSerialCustodyPanel.tsx",import.meta.url),"utf8");
 const idx=fs.readFileSync(new URL("../index.ts",import.meta.url),"utf8");
 assert.match(ui,/Check invoice product/);
 assert.match(ui,/verifySerialInvoiceProductMatch\(id\)/);
 assert.match(ui,/warranty eligibility are not verified/);
 assert.match(idx,/export \* from "\.\/serial-invoice-reference";/);
});
