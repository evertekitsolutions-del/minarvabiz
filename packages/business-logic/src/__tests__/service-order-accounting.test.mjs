import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const orders=require("../orders-store.ts"), store=require("../store.ts"), accounting=require("../accounting-store.ts"), outbox=require("../outbox-bridge.ts"), permissions=require("../permissions.ts");
permissions.setCurrentRole("admin"); permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;
const customer=(outstandingBalance=0,totalSpending=0)=>({id:"c",name:"Service Customer",outstandingBalance,totalSpending,createdAt:"2026-01-01",updatedAt:"2026-01-01"});
function reset(accounts=chart,outstandingBalance=0,totalSpending=0){
  accounting.hydrateAccountingState({accounts,journals:[],journalSequence:0});
  store.hydrateCore({customers:[customer(outstandingBalance,totalSpending)],products:[],sales:[],payments:[]});
  orders.hydrateOrders({orders:[],measurements:[]});
  outbox.hydrateOutbox([]);
}
const bal=key=>{const a=accounting.getSystemAccount(key);const row=accounting.buildTrialBalance().find(r=>r.accountId===a?.id);return Math.round(((row?.debit??0)-(row?.credit??0))*100)/100;};
const snap=()=>JSON.stringify({customer:store.getCustomer("c"),orders:orders.listOrders(),payments:store.listPayments(),accounting:accounting.exportAccountingState(),outbox:outbox.exportOutbox()});

reset();
let r=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:250,discount:0,advance:50});
assert.equal(r.errors.length,0); assert(r.order); assert.equal(r.order.price,250); assert.equal(r.order.advance,50); assert.equal(r.order.balance,200);
assert.equal(store.getCustomer("c").outstandingBalance,200); assert.equal(store.getCustomer("c").totalSpending,50);
assert.equal(bal("cash"),50); assert.equal(bal("accounts_receivable"),200); assert.equal(bal("service_revenue"),-250);
let advancePayment=store.listPayments().find(x=>x.referenceType==="order"&&x.referenceId===r.order.id);
assert(advancePayment); assert.equal(advancePayment.method,"cash"); assert.equal(advancePayment.amount,50);
assert.equal(accounting.buildProfitAndLoss().netProfit,250); assert(accounting.buildBalanceSheet().balanced);
let j=accounting.listJournalEntries().find(x=>x.referenceType==="auto_service_order"); assert(j); assert(accounting.voidJournalEntry(j.id).errors.length);

reset();
r=orders.createOrder({customerId:"c",serviceType:"wholesale",price:200,quantity:2,unitPrice:100,bulkDiscount:20,advance:30});
assert.equal(r.errors.length,0); assert(r.order); assert.equal(r.order.price,180); assert.equal(r.order.balance,150);
assert.equal(bal("cash"),30); assert.equal(bal("accounts_receivable"),150); assert.equal(bal("service_revenue"),-180);
assert.equal(accounting.buildProfitAndLoss().netProfit,180);

reset();
r=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:25,advancePaymentMethod:"upi"});
assert.equal(r.errors.length,0); assert(r.order); assert.equal(bal("payment_clearing"),25); assert.equal(bal("cash"),0);
advancePayment=store.listPayments().find(x=>x.referenceType==="order"&&x.referenceId===r.order.id);
assert(advancePayment); assert.equal(advancePayment.method,"upi"); assert.equal(advancePayment.amount,25); assert.equal(advancePayment.customerId,"c");

reset();
r=orders.createOrder({customerId:"c",serviceType:"tshirt_printing",price:0,advance:20,tshirt:{quantity:2,printingCost:25,customerPrice:100}});
assert.equal(r.errors.length,0); assert(r.order); assert.equal(r.order.price,100); assert.equal(r.order.advance,20); assert.equal(r.order.balance,80);
assert.equal(bal("service_revenue"),-100);

reset(); const before=snap();
for(const patch of [
  {price:NaN},{price:Infinity},{price:-1},{discount:NaN},{discount:-1},{advance:NaN},{advance:-1},
  {externalMaterialCost:Infinity},{quantity:0},{quantity:NaN},{unitPrice:Infinity},{bulkDiscount:-1},
  {advancePaymentMethod:"invalid"}
]){
  const base={customerId:"c",serviceType:"ladies_tailoring",price:100,discount:0,advance:0,quantity:1};
  const bad=orders.createOrder({...base,...patch}); assert(bad.errors.length); assert.equal(snap(),before);
}
assert(orders.createOrder({customerId:"missing",serviceType:"ladies_tailoring",price:100}).errors.length); assert.equal(snap(),before);

reset(chart,NaN,0); const corruptOutstanding=snap();
assert(orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100}).errors.length); assert.equal(snap(),corruptOutstanding);
reset(chart,0,NaN); const corruptSpending=snap();
assert(orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:10}).errors.length); assert.equal(snap(),corruptSpending);

reset(chart.map(a=>a.systemKey==="service_revenue"?{...a,isActive:false}:a)); const blockedRevenue=snap();
assert(orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100}).errors.length); assert.equal(snap(),blockedRevenue);
reset(chart.map(a=>a.systemKey==="accounts_receivable"?{...a,isActive:false}:a)); const blockedAr=snap();
assert(orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100}).errors.length); assert.equal(snap(),blockedAr);
reset(chart.map(a=>a.systemKey==="cash"?{...a,isActive:false}:a)); const blockedCash=snap();
assert(orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:10}).errors.length); assert.equal(snap(),blockedCash);
reset(chart.map(a=>a.systemKey==="payment_clearing"?{...a,isActive:false}:a)); const blockedClearing=snap();
assert(orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:10,advancePaymentMethod:"upi"}).errors.length); assert.equal(snap(),blockedClearing);

reset(); permissions.setCurrentRole(null); assert.throws(()=>orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100}),/denied/i); permissions.setCurrentRole("admin");

reset();
r=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:100,advance:25,advancePaymentMethod:"bank"});
assert.equal(r.errors.length,0);
for(const type of ["orders","customers","payments","accounts","journal_entries","journal_entry_lines"]) assert(outbox.listPendingOutbox().some(e=>e.aggregateType===type),type);

reset();
orders.hydrateOrders({orders:[{id:"old",orderNumber:"ORD-OLD-001",customerId:"c",customerName:"Service Customer",orderDate:"2026-01-01",serviceType:"ladies_tailoring",status:"pending",customerSuppliedMaterial:false,shopSuppliedMaterial:true,price:100,discount:0,advance:20,balance:80,externalMaterialCost:0,orderExpensesTotal:0,quantity:1,unitPrice:100,bulkDiscount:0,tshirt:null,expenses:[],createdAt:"2026-01-01",updatedAt:"2026-01-01",version:1}],measurements:[]});
assert.equal(accounting.listJournalEntries().length,0);
console.log("Service order accounting: advance tender source/mapping, AR, service revenue, bulk/T-shirt pricing, validation, immutable automatic journals, permissions, outbox and no historical backfill PASS");
