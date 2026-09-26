import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,filename);

const phase5=require("../phase5-store.ts");
const phase7=require("../phase7-store.ts");
const store=require("../store.ts");
const accounting=require("../accounting-store.ts");
const outbox=require("../outbox-bridge.ts");
const permissions=require("../permissions.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;

accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
store.hydrateCore({customers:[{
  id:"c",name:"Laundry Customer",outstandingBalance:0,totalSpending:0,
  createdAt:"2026-01-01",updatedAt:"2026-01-01"
}],products:[],sales:[],payments:[]});
phase5.hydratePhase5({suppliers:[],laundryOrders:[],expenses:[],purchases:[]});
phase7.hydratePhase7({returns:[],auditLogs:[]});
outbox.hydrateOutbox([]);

const created=phase5.createLaundryOrder({
  customerId:"c",garment:"Shirt",notes:"Original note",quantity:2,
  mode:"in_house_ironing",supplierRate:0,customerRate:10,paidAmount:0
});
assert.equal(created.errors.length,0);
assert(created.order);

const beforeVersion=created.order.version;
const beforeAccounting=JSON.stringify(accounting.exportAccountingState());
const beforeCustomer=JSON.stringify(store.getCustomer("c"));
const beforeFinancial={
  quantity:created.order.quantity,
  customerRate:created.order.customerRate,
  supplierRate:created.order.supplierRate,
  totalCustomerCharge:created.order.totalCustomerCharge,
  totalSupplierCost:created.order.totalSupplierCost,
  paidAmount:created.order.paidAmount,
  balanceAmount:created.order.balanceAmount,
  profit:created.order.profit,
};

outbox.hydrateOutbox([]);
const edited=phase5.updateLaundryDetails(created.order.id,{garment:"Shirt + trouser",notes:"Handle carefully"});
assert.equal(edited.errors.length,0);
assert(edited.order);
assert.equal(edited.order.garment,"Shirt + trouser");
assert.equal(edited.order.notes,"Handle carefully");
assert.equal(edited.order.version,beforeVersion+1);
for(const [key,value] of Object.entries(beforeFinancial)) assert.equal(edited.order[key],value,key);
assert.equal(JSON.stringify(accounting.exportAccountingState()),beforeAccounting);
assert.equal(JSON.stringify(store.getCustomer("c")),beforeCustomer);
assert(outbox.listPendingOutbox().some(e=>e.aggregateType==="laundry_orders"&&e.aggregateId===created.order.id&&e.eventType==="update"));
await new Promise((resolve)=>setTimeout(resolve,0));
assert(phase7.listAuditLogs(20).some(e=>e.action==="laundry.update_details"&&e.recordId===created.order.id));

const noReason=phase5.cancelLaundryOrder({orderId:created.order.id,reason:""});
assert.equal(noReason.order,null);
assert.match(noReason.errors.join(";"),/reason is required/i);

const cancelled=phase5.cancelLaundryOrder({orderId:created.order.id,reason:"Customer requested cancellation"});
assert.equal(cancelled.errors.length,0);
assert.equal(cancelled.order?.status,"cancelled");
await new Promise((resolve)=>setTimeout(resolve,0));
assert(phase7.listAuditLogs(20).some(e=>e.action==="laundry.cancel"&&e.recordId===created.order.id));

const immutable=phase5.updateLaundryDetails(created.order.id,{garment:"Should not change"});
assert.equal(immutable.order,null);
assert.match(immutable.errors.join(";"),/immutable/i);

console.log("Laundry record management: non-financial edit immutability, audit/outbox and reasoned cancellation PASS");
