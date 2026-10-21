import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
 ts.transpileModule(fs.readFileSync(file,"utf8"),{
 fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
 }).outputText,file);
const {buildSaleDeliveryNoteHtml,requestSaleDeliveryNotePrint}=require("../sale-delivery-note.ts");
const {setCurrentRole}=require("../permissions.ts");
const store=require("../store.ts");
const fixture=()=>({
 id:"sale-a",invoiceNumber:"INV-2026-001",saleDate:"2026-10-21T10:00:00Z",
 status:"completed",subtotal:100,taxAmount:18,total:118,paidAmount:118,
 discountAmount:0,balanceAmount:0,createdAt:"2026-10-21T10:00:00Z",
 items:[{id:"line-1",saleId:"sale-a",productId:"p1",
   productName:"Computer <script>alert(1)</script>",sku:"SKU<&",quantity:2,
   unitPrice:50,costPrice:30,discountPercent:0,taxRate:18,lineTotal:118}],
});
test("A4 delivery note shows invoice quantity and escapes product content, no invoice money",()=>{
 const result=buildSaleDeliveryNoteHtml(fixture(),false);
 assert.match(result,/DELIVERY NOTE/);
 assert.match(result,/INV-2026-001/);
 assert.match(result,/Original invoice qty/);
 assert.match(result,/Computer &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(result,/Computer <script>/);
 assert.match(result,/SKU&lt;&amp;/);
 assert.doesNotMatch(result,/Grand Total/);
 assert.doesNotMatch(result,/Tax Payable/);
 assert.match(result,/not a separately issued statutory tax delivery challan/);
 assert.doesNotMatch(result,/window\.print/);
 assert.match(buildSaleDeliveryNoteHtml(fixture(),true),/window\.print/);
});
test("draft/returned/cancelled/archived/empty and fractional invalid lines cannot issue slip",()=>{
 const base=fixture();
 for(const status of ["draft","returned","cancelled"]){
   assert.throws(()=>buildSaleDeliveryNoteHtml({...base,status}),/posted invoice/);
 }
 assert.throws(()=>buildSaleDeliveryNoteHtml({...base,deletedAt:"2026-10-21"}),/posted invoice/);
 assert.throws(()=>buildSaleDeliveryNoteHtml({...base,items:[]}),/posted invoice/);
 assert.throws(()=>buildSaleDeliveryNoteHtml({...base,items:[
   {...base.items[0],quantity:1.0001},
 ]}),/invalid line quantity/);
});
test("print request refuses without authenticated role; no financial mutation on failed attempt",async()=>{
 const s=fixture();
 store.hydrateCore({sales:[s]});
 const previousWindow=global.window;
 global.window={};
 try{
   setCurrentRole("staff");
   const r=await requestSaleDeliveryNotePrint(s.id);
   assert.equal(r.ok,false);
   assert.match(r.error,/Permission denied/);
   assert.equal(store.getSale(s.id)?.total,118);
 }finally{
   setCurrentRole(null);
   if(previousWindow===undefined)delete global.window;
   else global.window=previousWindow;
   store.hydrateCore({sales:[]});
 }
});
test("shared SalesList offers A4 delivery note only for posted invoices",()=>{
 const ui=fs.readFileSync(new URL("../../../ui/src/components/sales/SalesList.tsx",import.meta.url),"utf8");
 assert.match(ui,/Delivery note/);
 assert.match(ui,/requestSaleDeliveryNotePrint/);
 assert.match(ui,/can\("sales.create"\)/);
 assert.match(ui,/\["completed", "partial"\]\.includes\(row\.status\)/);
});
