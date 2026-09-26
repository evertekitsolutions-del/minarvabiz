import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,filename);

const orders=require("../orders-store.ts");
const store=require("../store.ts");
const accounting=require("../accounting-store.ts");
const outbox=require("../outbox-bridge.ts");
const permissions=require("../permissions.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;
const customer=()=>({id:"c",name:"Refund Customer",outstandingBalance:0,totalSpending:0,createdAt:"2026-01-01",updatedAt:"2026-01-01"});
function reset(){
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  store.hydrateCore({customers:[customer()],products:[],sales:[],payments:[]});
  orders.hydrateOrders({orders:[],measurements:[]});
  outbox.hydrateOutbox([]);
}
const bal=(key)=>{
  const a=accounting.getSystemAccount(key);
  const row=accounting.buildTrialBalance().find(r=>r.accountId===a?.id);
  return Math.round(((row?.debit??0)-(row?.credit??0))*100)/100;
};
const snap=()=>JSON.stringify({
  order:orders.listOrders()[0],
  customer:store.getCustomer("c"),
  payments:store.listPayments(),
  accounting:accounting.exportAccountingState(),
  outbox:outbox.exportOutbox(),
});

reset();
const created=orders.createOrder({
  customerId:"c",serviceType:"ladies_tailoring",price:100,advance:20,advancePaymentMethod:"bank"
});
assert.deepEqual(created.errors,[]);
assert(created.order);
assert.equal(created.order.advance,20);
assert.equal(created.order.balance,80);
assert.equal(store.getCustomer("c").outstandingBalance,80);
assert.equal(store.getCustomer("c").totalSpending,20);

const collected=store.recordCustomerPayment({customerId:"c",amount:30,method:"bank"});
assert.deepEqual(collected.errors,[]);
assert.equal(created.order.advance,50);
assert.equal(created.order.balance,50);
assert.equal(store.getCustomer("c").outstandingBalance,50);
assert.equal(store.getCustomer("c").totalSpending,50);
assert.equal(bal("bank"),50);
assert.equal(bal("accounts_receivable"),50);
assert.equal(bal("service_revenue"),-100);

let before=snap();
let cancelled=orders.updateOrderStatus(created.order.id,"cancelled",{reason:"Customer cancelled"});
assert.equal(cancelled.order,null);
assert.match(cancelled.error,/refund.*advance/i);
assert.equal(snap(),before);

before=snap();
cancelled=orders.updateOrderStatus(created.order.id,"cancelled",{refundPaymentMethod:"invalid",reason:"Customer cancelled"});
assert.equal(cancelled.order,null);
assert.match(cancelled.error,/valid refund payment method/i);
assert.equal(snap(),before);

outbox.hydrateOutbox([]);
cancelled=orders.updateOrderStatus(created.order.id,"cancelled",{refundPaymentMethod:"bank",reason:"Customer cancelled"});
assert(cancelled.order);
assert.equal(cancelled.error,undefined);
assert.equal(cancelled.order.status,"cancelled");
assert.equal(cancelled.order.advance,50);
assert.equal(cancelled.order.balance,50);
assert.equal(store.getCustomer("c").outstandingBalance,0);
assert.equal(store.getCustomer("c").totalSpending,0);

const refund=store.listPayments().find(p=>p.referenceType==="refund"&&p.referenceId===created.order.id);
assert(refund);
assert.equal(refund.amount,50);
assert.equal(refund.method,"bank");
assert.equal(refund.customerId,"c");
assert.match(refund.notes,/service order cancellation refund/i);

assert.equal(bal("bank"),0);
assert.equal(bal("accounts_receivable"),0);
assert.equal(bal("service_revenue"),0);
assert.equal(accounting.buildProfitAndLoss().netProfit,0);
assert(accounting.buildBalanceSheet().balanced);

const cancelJournal=accounting.listJournalEntries().find(j=>j.referenceType==="auto_service_order_cancel"&&j.referenceId===created.order.id);
assert(cancelJournal);
assert(accounting.voidJournalEntry(cancelJournal.id).errors.length);
for(const type of ["orders","customers","payments","accounts","journal_entries","journal_entry_lines"]){
  assert(outbox.listPendingOutbox().some(e=>e.aggregateType===type),type);
}

console.log("Service-order refund cancellation: paid-to-date refund, tender accounting, customer reversal, source payment, guards and outbox PASS");
