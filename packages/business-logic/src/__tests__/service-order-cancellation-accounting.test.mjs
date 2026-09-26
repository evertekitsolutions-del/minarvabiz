import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const orders=require("../orders-store.ts"), store=require("../store.ts"), accounting=require("../accounting-store.ts"), outbox=require("../outbox-bridge.ts"), permissions=require("../permissions.ts");
permissions.setCurrentRole("admin"); permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;
const customer=(outstandingBalance=0,totalSpending=0)=>({id:"c",name:"Cancel Customer",outstandingBalance,totalSpending,createdAt:"2026-01-01",updatedAt:"2026-01-01"});
function reset(accounts=chart,outstandingBalance=0,totalSpending=0,payments=[]){
  accounting.hydrateAccountingState({accounts,journals:[],journalSequence:0});
  store.hydrateCore({customers:[customer(outstandingBalance,totalSpending)],products:[],sales:[],payments});
  orders.hydrateOrders({orders:[],measurements:[]});
  outbox.hydrateOutbox([]);
}
const bal=key=>{const a=accounting.getSystemAccount(key);const row=accounting.buildTrialBalance().find(r=>r.accountId===a?.id);return Math.round(((row?.debit??0)-(row?.credit??0))*100)/100;};
const snap=()=>JSON.stringify({customer:store.getCustomer("c"),orders:orders.listOrders(),accounting:accounting.exportAccountingState(),outbox:outbox.exportOutbox()});

reset();
let created=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:0});
assert.equal(created.errors.length,0); assert(created.order);
assert.equal(store.getCustomer("c").outstandingBalance,100); assert.equal(accounting.buildProfitAndLoss().netProfit,100);
let cancelled=orders.updateOrderStatus(created.order.id,"cancelled");
assert.equal(cancelled.order,null); assert.match(cancelled.error,/reason is required/i);
cancelled=orders.updateOrderStatus(created.order.id,"cancelled",{reason:"Customer cancelled"});
assert(cancelled.order); assert.equal(cancelled.error,undefined); assert.equal(cancelled.order.status,"cancelled");
assert.equal(store.getCustomer("c").outstandingBalance,0); assert.equal(bal("accounts_receivable"),0); assert.equal(bal("service_revenue"),0);
assert.equal(accounting.buildProfitAndLoss().netProfit,0); assert(accounting.buildBalanceSheet().balanced);
const refs=accounting.listJournalEntries().filter(j=>j.referenceId===created.order.id);
assert.equal(refs.length,2); assert(refs.some(j=>j.referenceType==="auto_service_order")); assert(refs.some(j=>j.referenceType==="auto_service_order_cancel"));
for(const j of refs) assert(accounting.voidJournalEntry(j.id).errors.length);

reset();
created=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:20});
assert.equal(created.errors.length,0); const advanceSnap=snap();
cancelled=orders.updateOrderStatus(created.order.id,"cancelled",{reason:"Customer cancelled"});
assert.equal(cancelled.order,null); assert.match(cancelled.error,/refund.*advance/i); assert.equal(snap(),advanceSnap);

reset(chart,50,0);
created=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:0});
assert.equal(created.errors.length,0); assert.equal(store.getCustomer("c").outstandingBalance,150);
cancelled=orders.updateOrderStatus(created.order.id,"cancelled",{reason:"Customer cancelled"});
assert(cancelled.order); assert.equal(store.getCustomer("c").outstandingBalance,50);

reset(chart,100,0);
created=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:0});
assert.equal(created.errors.length,0);
const paid=store.recordCustomerPayment({customerId:"c",amount:20,method:"cash"});
assert.equal(paid.errors.length,0); assert.match(paid.payment.notes,/Service orders:/);
assert.equal(created.order.advance,20); assert.equal(created.order.balance,80);
const collectionSnap=snap();
cancelled=orders.updateOrderStatus(created.order.id,"cancelled",{reason:"Customer cancelled"});
assert.equal(cancelled.order,null); assert.match(cancelled.error,/refund.*advance/i); assert.equal(snap(),collectionSnap);

// Preserve the reconciliation guard for imported/pre-existing unallocated collections.
reset();
created=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:0});
assert.equal(created.errors.length,0);
store.hydrateCore({payments:[{
  id:"legacy-unallocated",amount:20,method:"cash",referenceType:"other",referenceId:"c",customerId:"c",
  notes:"Other customer balance: 20.00",paidAt:created.order.createdAt,createdAt:created.order.createdAt,version:1
}]});
const unallocatedSnap=snap();
cancelled=orders.updateOrderStatus(created.order.id,"cancelled",{reason:"Customer cancelled"});
assert.equal(cancelled.order,null); assert.match(cancelled.error,/collections need allocation/i); assert.equal(snap(),unallocatedSnap);

reset();
orders.hydrateOrders({orders:[{id:"old",orderNumber:"ORD-OLD",customerId:"c",customerName:"Cancel Customer",orderDate:"2026-01-01",serviceType:"ladies_tailoring",status:"pending",customerSuppliedMaterial:false,shopSuppliedMaterial:true,price:100,discount:0,advance:0,balance:100,externalMaterialCost:0,orderExpensesTotal:0,quantity:1,unitPrice:100,bulkDiscount:0,tshirt:null,expenses:[],createdAt:"2026-01-01",updatedAt:"2026-01-01",version:1}],measurements:[]});
store.getCustomer("c").outstandingBalance=100;
const historicSnap=snap();
cancelled=orders.updateOrderStatus("old","cancelled",{reason:"Customer cancelled"});
assert.equal(cancelled.order,null); assert.match(cancelled.error,/accounting reconciliation/i); assert.equal(snap(),historicSnap);

reset();
created=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:0});
assert.equal(created.errors.length,0);
const state=accounting.exportAccountingState();
accounting.hydrateAccountingState({accounts:state.accounts.map(a=>a.systemKey==="service_revenue"?{...a,isActive:false}:a),journals:state.journals,journalSequence:state.journalSequence});
const blockedAccount=snap();
cancelled=orders.updateOrderStatus(created.order.id,"cancelled",{reason:"Customer cancelled"});
assert.equal(cancelled.order,null); assert.match(cancelled.error,/unavailable/i); assert.equal(snap(),blockedAccount);

reset();
created=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:0});
assert.equal(created.errors.length,0); outbox.hydrateOutbox([]);
cancelled=orders.updateOrderStatus(created.order.id,"cancelled",{reason:"Customer cancelled"}); assert(cancelled.order);
for(const type of ["orders","customers","accounts","journal_entries","journal_entry_lines"]) assert(outbox.listPendingOutbox().some(e=>e.aggregateType===type),type);

reset();
created=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:0});
permissions.setCurrentRole(null); assert.throws(()=>orders.updateOrderStatus(created.order.id,"cancelled"),/denied/i); permissions.setCurrentRole("admin");

reset();
created=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:0});
const normalJournals=accounting.listJournalEntries().length;
const progressed=orders.updateOrderStatus(created.order.id,"processing"); assert(progressed.order); assert.equal(progressed.order.status,"processing"); assert.equal(accounting.listJournalEntries().length,normalJournals);

console.log("Service order cancellation: exact reversal, advance/collection/history/account guards, customer correction, permissions, outbox and normal statuses PASS");
