import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,filename);
const {
 availableLaundryMessages,laundryCustomerMessage,manualLaundryWhatsAppUrl,
}=require("../laundry-customer-messaging.ts");
const base={
 id:"ld-1",orderNumber:"LDY-0001",customerId:"c",customerName:"Test Customer",
 mode:"in_house_ironing",quantity:1,status:"pending",dueAt:"2026-11-08",
 balanceAmount:150,items:[{id:"item",tagCode:"LDY-0001-001",label:"Shirt",quantity:1,
  processingStatus:"received",qualityStatus:"pending"}],
};
const kinds=o=>availableLaundryMessages(o).map(x=>x.id);
test("processing and due messages are state-aware, no premature ready notification",()=>{
 assert(kinds(base).includes("order_received"));
 assert(kinds(base).includes("delivery_reminder"));
 assert(kinds(base).includes("payment_due"));
 assert(!kinds(base).includes("order_ready"));
 assert.throws(()=>laundryCustomerMessage("order_ready",base),/unavailable/);
 const ready={...base,items:[{...base.items[0],processingStatus:"ready",qualityStatus:"passed"}]};
 assert(kinds(ready).includes("order_ready"));
 assert(!kinds(ready).includes("order_processing"));
 assert.match(laundryCustomerMessage("order_ready",ready).body,/LDY-0001/);
});
test("outsourced tickets cannot claim ready before partner returns garments",()=>{
 const order={...base,mode:"outsourced",status:"sent",items:[{...base.items[0],
  processingStatus:"ready",qualityStatus:"passed"}]};
 assert(!kinds(order).includes("order_ready"));
 assert(kinds({...order,status:"received"}).includes("order_ready"));
});
test("delivered messages allow feedback only; cancelled ticket is never contacted",()=>{
 const delivered={...base,status:"delivered",balanceAmount:0};
 assert.deepEqual(kinds(delivered),["feedback_request"]);
 assert.deepEqual(kinds({...base,status:"cancelled"}),[]);
});
test("manual WhatsApp deep link uses validated existing builder and never sends itself",()=>{
 const c={name:"A Customer",phone:"+919876543210"};
 const url=manualLaundryWhatsAppUrl("order_received",base,c);
 assert.match(url,/^https:\/\/wa.me\/919876543210\?text=/);
 assert.match(decodeURIComponent(url),/LDY-0001/);
 assert.throws(()=>manualLaundryWhatsAppUrl("order_received",base,{name:"A",phone:"invalid"}),/valid WhatsApp/);
});
test("Desktop/Web both provide contact records and explicit click-to-share panel",()=>{
 const ui=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
 const panel=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryWhatsAppPanel.tsx",import.meta.url),"utf8");
 const desktop=fs.readFileSync(new URL("../../../../apps/desktop/src/App.tsx",import.meta.url),"utf8");
 const web=fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/laundry/page.tsx",import.meta.url),"utf8");
 assert.match(ui,/LaundryWhatsAppPanel/);
 assert.match(desktop,/<LaundryList orders=\{laundry\} customers=\{customers\}/);
 assert.match(web,/customers=\{customers\}/);
 assert.match(panel,/Open WhatsApp with preview/);
 assert.match(panel,/manualLaundryWhatsAppUrl/);
});
