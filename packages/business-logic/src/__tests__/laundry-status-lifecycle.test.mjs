import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const phase5=require("../phase5-store.ts"), store=require("../store.ts"), accounting=require("../accounting-store.ts"), outbox=require("../outbox-bridge.ts"), permissions=require("../permissions.ts");
permissions.setCurrentRole("admin"); permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;
const customer={id:"c",name:"Laundry Customer",outstandingBalance:0,totalSpending:0,createdAt:"2026-01-01",updatedAt:"2026-01-01"};
const supplier={id:"s",name:"Laundry Supplier",category:"laundry",openingBalance:0,outstandingBalance:0,createdAt:"2026-01-01",updatedAt:"2026-01-01"};
function reset(){
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  store.hydrateCore({customers:[{...customer}],products:[],sales:[],payments:[]});
  phase5.hydratePhase5({suppliers:[{...supplier}],laundryOrders:[],expenses:[],purchases:[]});
  outbox.hydrateOutbox([]);
}
const snap=()=>JSON.stringify({orders:phase5.listLaundryOrders(),accounting:accounting.exportAccountingState(),outbox:outbox.exportOutbox()});

reset();
let created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"s",supplierRate:4,customerRate:10,paidAmount:0,paymentMethod:"cash"});
assert.equal(created.errors.length,0); assert(created.order); assert.equal(created.order.status,"pending");
const journalCount=accounting.listJournalEntries().length;
outbox.hydrateOutbox([]);
let moved=phase5.updateLaundryStatus(created.order.id,"sent");
assert(moved.order); assert.equal(moved.order.status,"sent"); assert.equal(moved.order.version,2);
assert.equal(accounting.listJournalEntries().length,journalCount);
assert(outbox.listPendingOutbox().some(e=>e.aggregateType==="laundry_orders"&&e.aggregateId===created.order.id&&e.eventType==="update"));

const beforeSkip=snap();
moved=phase5.updateLaundryStatus(created.order.id,"delivered");
assert.equal(moved.order,null); assert.match(moved.error,/cannot change laundry status/i); assert.equal(snap(),beforeSkip);

moved=phase5.updateLaundryStatus(created.order.id,"received");
assert(moved.order); assert.equal(moved.order.status,"received");
moved=phase5.updateLaundryStatus(created.order.id,"delivered");
assert(moved.order); assert.equal(moved.order.status,"delivered"); assert.equal(accounting.listJournalEntries().length,journalCount);

const deliveredSnap=snap();
moved=phase5.updateLaundryStatus(created.order.id,"sent");
assert.equal(moved.order,null); assert.match(moved.error,/cannot change laundry status/i); assert.equal(snap(),deliveredSnap);

reset();
created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"s",supplierRate:4,customerRate:10,paidAmount:0});
assert(created.order); const cancelSnap=snap();
moved=phase5.updateLaundryStatus(created.order.id,"cancelled");
assert.equal(moved.order,null); assert.match(moved.error,/separate refund\/reconciliation/i); assert.equal(snap(),cancelSnap);

reset();
created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:10,paidAmount:10});
assert(created.order); assert.equal(created.order.status,"delivered"); const ironingSnap=snap();
moved=phase5.updateLaundryStatus(created.order.id,"sent");
assert.equal(moved.order,null); assert.match(moved.error,/completed at creation/i); assert.equal(snap(),ironingSnap);

reset();
created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"s",supplierRate:4,customerRate:10,paidAmount:0});
permissions.setCurrentRole(null);
assert.throws(()=>phase5.updateLaundryStatus(created.order.id,"sent"),/denied/i);
permissions.setCurrentRole("admin");

console.log("Laundry lifecycle: pending -> sent -> received -> delivered, invalid/cancel guards, permissions, outbox and no accounting mutation PASS");
