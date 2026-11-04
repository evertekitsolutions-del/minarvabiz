import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const {buildLaundryServiceReceiptHtml,printLaundryServiceReceipt}=require("../laundry-service-receipt.ts");
const order={
  id:"laundry-100",orderNumber:"LDY-0100",customerId:"customer-100",
  customerName:"A & B",mode:"outsourced",garment:"Shirt",quantity:2,
  items:[{id:"item-1",label:"<script>alert(1)</script> Shirt",tagCode:"LDY-0100-001",
    quantity:2,serviceCode:"dry_clean",fabricType:"wool",processingStatus:"ready",qualityStatus:"passed"}],
  customerRate:50,totalCustomerCharge:100,paidAmount:40,balanceAmount:60,
  status:"received",pickupAt:"2026-11-05",dueAt:"2026-11-08",
  createdAt:"2026-11-05T10:00:00Z",notes:"Handle <fragile> carefully",
};
const shop={
 shopName:"Tailors & Laundry",legalName:"Company <Ltd>",address:"Thiruvananthapuram",
 addressLine2:"",district:"",state:"Kerala",country:"India",postalCode:"",phone:"0123456789",
 email:"hello@example.test",website:"https://example.test",gstin:"",receiptFooter:"Visit again!",
 currency:"INR",documentCode:"",updatedAt:"2026-11-05T00:00:00Z",
};
test("branded A4 ticket uses posted payment totals, item tags and escapes untrusted values",()=>{
  const before=JSON.stringify(order);
  const html=buildLaundryServiceReceiptHtml(order,{
    shop,customer:{id:"customer-100",name:"Customer <One>",phone:"5551234567"},
  });
  assert.match(html,/@page\{size:A4/);
  assert.match(html,/Tailors &amp; Laundry/);
  assert.match(html,/Customer &lt;One&gt;/);
  assert.match(html,/Company &lt;Ltd&gt;/);
  assert.match(html,/LDY-0100-001/);
  assert.match(html,/dry clean \/ wool/);
  assert.match(html,/INR 100\.00/);
  assert.match(html,/INR 40\.00/);
  assert.match(html,/INR 60\.00/);
  assert.match(html,/not a GST tax invoice/);
  assert(!html.includes("<script>alert(1)</script>"));
  assert(!html.includes("<fragile>"));
  assert.equal(JSON.stringify(order),before);
});
test("legacy and cancelled tickets are printable but void never demands payment",()=>{
  const html=buildLaundryServiceReceiptHtml({
    ...order,items:undefined,status:"cancelled",garment:"Coat",notes:null,
  },{shop});
  assert.match(html,/Coat/);
  assert.match(html,/CANCELLED \/ VOID/);
  assert.match(html,/Not a payment demand/);
});
test("cannot silently print invalid finance amounts or post a ticket on server",async()=>{
  assert.throws(()=>buildLaundryServiceReceiptHtml({...order,totalCustomerCharge:NaN},{shop}),/valid posted/);
  assert.throws(()=>buildLaundryServiceReceiptHtml({...order,items:[{...order.items[0],quantity:0}]},{shop}),/quantity/);
  const result=await printLaundryServiceReceipt(order,{shop});
  assert.equal(result.ok,false);
  assert.match(result.error,/browser\/desktop/i);
});
test("ticket list wires one-click receipt and surfaces printer failure",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
  assert.match(ui,/printLaundryServiceReceipt/);
  assert.match(ui,/Print A4 service receipt/);
  assert.match(ui,/receiptPrintFeedback\.failed/);
});
