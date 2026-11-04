import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const {availableLaundryWhatsAppMessages,laundryManualWhatsAppLink}=require("../manual-laundry-whatsapp.ts");
const ticket={
 orderNumber:"LDY-2026-0001",status:"pending",dueAt:"2026-11-09",balanceAmount:50,
 customerName:"Customer",items:[{processingStatus:"received",qualityStatus:"pending"}],
};
test("explicit WhatsApp message templates respect garment readiness, cancellation and paid balance",()=>{
 const pending=availableLaundryWhatsAppMessages(ticket,"Minarva");
 assert(pending.some(x=>x.id==="ticket_received"));
 assert(!pending.some(x=>x.id==="ready"));
 assert(!pending.some(x=>x.id==="feedback"));
 assert(pending.some(x=>x.id==="due_reminder"));
 assert(pending.some(x=>x.id==="payment_due"));
 const ready=availableLaundryWhatsAppMessages({...ticket,items:[{processingStatus:"ready",qualityStatus:"passed"}]});
 assert(ready.some(x=>x.id==="ready"));
 const completed=availableLaundryWhatsAppMessages({...ticket,status:"delivered",balanceAmount:0},"Minarva","https://example.com/review");
 assert(completed.some(x=>x.id==="feedback"&&x.message.includes("https://example.com/review")));
 assert(!completed.some(x=>x.id==="payment_due"));
 assert(!completed.some(x=>x.id==="due_reminder"));
 assert.deepEqual(availableLaundryWhatsAppMessages({...ticket,status:"cancelled"}),[]);
});
test("manual link uses existing strict country code normalization and safe text encoding",()=>{
 const message=availableLaundryWhatsAppMessages(ticket)[0];
 const url=laundryManualWhatsAppLink("+919876543210",message);
 assert(url.startsWith("https://wa.me/919876543210?text="));
 assert(url.includes("LDY-2026-0001"));
 assert.throws(()=>laundryManualWhatsAppLink("not-phone",message),/WhatsApp number/i);
});
test("messages are explicitly click-to-send, not a provider API or automatic outbound call",()=>{
 const ui=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryWhatsAppActions.tsx",import.meta.url),"utf8");
 const details=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
 assert.match(ui,/window\.open/);
 assert.match(ui,/operator must review and send/i);
 assert.match(details,/LaundryWhatsAppActions/);
});
