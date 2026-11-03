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
store.hydrateCore({customers:[{id:"c",name:"Laundry Customer",outstandingBalance:0,totalSpending:0,createdAt:"2026-01-01",updatedAt:"2026-01-01"}],products:[],sales:[],payments:[]});
phase5.hydratePhase5({suppliers:[],laundryOrders:[],expenses:[],purchases:[]});
phase7.hydratePhase7({returns:[],auditLogs:[]});
outbox.hydrateOutbox([]);

const created=phase5.createLaundryOrder({
  customerId:"c",mode:"in_house_ironing",quantity:3,items:[
    {label:"Shirt",quantity:2,notes:"White"},
    {label:"Saree",quantity:1,notes:"Silk"},
  ],pickupAt:"2026-11-03",dueAt:"2026-11-05",supplierRate:0,customerRate:20,paidAmount:0
});
assert.equal(created.errors.length,0,created.errors.join("; "));
assert(created.order);
assert.equal(created.order.quantity,3);
assert.equal(created.order.items?.length,2);
assert.equal(created.order.items?.[0].tagCode,created.order.orderNumber+"-001");
assert.equal(created.order.items?.[1].tagCode,created.order.orderNumber+"-002");
assert.equal(created.order.totalCustomerCharge,60);
assert.equal(created.order.pickupAt,"2026-11-03");
assert.equal(created.order.dueAt,"2026-11-05");

const first=created.order.items[0];
let moved=phase5.updateLaundryItemWorkflow(created.order.id,first.id,"washing");
assert.equal(moved.errors.length,0,moved.errors.join("; "));
moved=phase5.updateLaundryItemWorkflow(created.order.id,first.id,"ironing");
assert.equal(moved.errors.length,0,moved.errors.join("; "));
moved=phase5.updateLaundryItemWorkflow(created.order.id,first.id,"quality_check");
assert.equal(moved.errors.length,0,moved.errors.join("; "));
moved=phase5.updateLaundryItemWorkflow(created.order.id,first.id,"quality_check","failed");
assert.equal(moved.errors.length,0,moved.errors.join("; "));
moved=phase5.updateLaundryItemWorkflow(created.order.id,first.id,"ready");
assert.equal(moved.order,null);
assert.match(moved.errors.join("; "),/quality check must pass/i);
moved=phase5.updateLaundryItemWorkflow(created.order.id,first.id,"ironing");
assert.equal(moved.errors.length,0,moved.errors.join("; "));
moved=phase5.updateLaundryItemWorkflow(created.order.id,first.id,"quality_check");
assert.equal(moved.errors.length,0,moved.errors.join("; "));
moved=phase5.updateLaundryItemWorkflow(created.order.id,first.id,"quality_check","passed");
assert.equal(moved.errors.length,0,moved.errors.join("; "));
moved=phase5.updateLaundryItemWorkflow(created.order.id,first.id,"ready");
assert.equal(moved.errors.length,0,moved.errors.join("; "));
moved=phase5.updateLaundryItemWorkflow(created.order.id,first.id,"delivered");
assert.equal(moved.errors.length,0,moved.errors.join("; "));

const snapshot=phase5.listLaundryOrders()[0];
assert.equal(snapshot.items?.[0].processingStatus,"delivered");
assert.equal(snapshot.items?.[0].qualityStatus,"passed");
assert.equal(snapshot.items?.[1].processingStatus,"received");
assert.equal(snapshot.quantity,3);
assert.equal(snapshot.totalCustomerCharge,60);
assert(outbox.listPendingOutbox().some(event=>event.aggregateType==="laundry_orders"&&event.aggregateId===created.order.id));
assert(phase7.listAuditLogs(50).some(event=>event.action==="laundry.item_workflow"&&event.recordId===created.order!.id));

const invalidDate=phase5.createLaundryOrder({customerId:"c",mode:"in_house_ironing",quantity:1,items:[{label:"Skirt",quantity:1}],pickupAt:"2026-11-07",dueAt:"2026-11-06",supplierRate:0,customerRate:10});
assert.equal(invalidDate.order,null);
assert.match(invalidDate.errors.join("; "),/due date cannot be before pickup/i);

console.log("Laundry itemization, tag identity, pickup/due dates, per-item workflow, QC rework/pass, audit/outbox and financial immutability PASS");
