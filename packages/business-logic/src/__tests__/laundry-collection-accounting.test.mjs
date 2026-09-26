import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);

const store=require("../store.ts"), orders=require("../orders-store.ts"), phase5=require("../phase5-store.ts");
const accounting=require("../accounting-store.ts"), outbox=require("../outbox-bridge.ts"), permissions=require("../permissions.ts");
permissions.setCurrentRole("admin"); permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;
const customer=(outstandingBalance=0,totalSpending=0)=>({id:"c",name:"Collection Customer",outstandingBalance,totalSpending,createdAt:"2026-01-01",updatedAt:"2026-01-01"});
const supplier={id:"s",name:"Laundry Supplier",category:"laundry",openingBalance:0,outstandingBalance:0,createdAt:"2026-01-01",updatedAt:"2026-01-01"};
function reset(outstandingBalance=0,totalSpending=0){
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  store.hydrateCore({customers:[customer(outstandingBalance,totalSpending)],products:[],sales:[],payments:[]});
  orders.hydrateOrders({orders:[],measurements:[]});
  phase5.hydratePhase5({suppliers:[{...supplier}],laundryOrders:[],expenses:[],purchases:[]});
  outbox.hydrateOutbox([]);
}
const bal=key=>{const a=accounting.getSystemAccount(key);const row=accounting.buildTrialBalance().find(r=>r.accountId===a?.id);return Math.round(((row?.debit??0)-(row?.credit??0))*100)/100;};

reset();
let laundry=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:100,paidAmount:20,paymentMethod:"cash"});
assert.equal(laundry.errors.length,0); assert(laundry.order);
assert.equal(laundry.order.paidAmount,20); assert.equal(laundry.order.balanceAmount,80);
assert.equal(store.listPayments().length,1);
outbox.hydrateOutbox([]);
const collection=store.recordCustomerPayment({customerId:"c",amount:30,method:"upi",reference:"RCPT-L-1"});
assert.equal(collection.errors.length,0); assert(collection.payment);
assert.match(collection.payment.notes,/Laundry: .*30\.00/);
assert.equal(store.listPayments().length,2);
let current=phase5.listLaundryOrders().find(o=>o.id===laundry.order.id);
assert(current); assert.equal(current.paidAmount,50); assert.equal(current.balanceAmount,50);
assert.equal(store.getCustomer("c").outstandingBalance,50); assert.equal(store.getCustomer("c").totalSpending,50);
assert.equal(bal("cash"),20); assert.equal(bal("payment_clearing"),30); assert.equal(bal("accounts_receivable"),50); assert.equal(bal("laundry_revenue"),-100);
assert(outbox.listPendingOutbox().some(e=>e.aggregateType==="laundry_orders"&&e.aggregateId===laundry.order.id&&e.eventType==="update"));

const cancelled=phase5.cancelLaundryOrder({orderId:laundry.order.id,reason:"Customer cancellation",refundPaymentMethod:"bank"});
assert.equal(cancelled.errors.length,0); assert.equal(cancelled.order?.status,"cancelled");
assert.equal(store.getCustomer("c").outstandingBalance,0); assert.equal(store.getCustomer("c").totalSpending,0);
assert.equal(bal("accounts_receivable"),0); assert.equal(bal("laundry_revenue"),0); assert.equal(bal("bank"),-50);
const refund=store.listPayments().find(p=>p.referenceType==="refund"&&p.referenceId===laundry.order.id);
assert(refund); assert.equal(refund.amount,50); assert.equal(refund.method,"bank");

reset();
const service=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:40,advance:0});
assert.equal(service.errors.length,0); assert(service.order);
laundry=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:30,paidAmount:0});
assert.equal(laundry.errors.length,0); assert(laundry.order);
assert.equal(store.getCustomer("c").outstandingBalance,70);
const combined=store.recordCustomerPayment({customerId:"c",amount:70,method:"cash"});
assert.equal(combined.errors.length,0); assert(combined.payment);
assert.match(combined.payment.notes,/Service orders:/); assert.match(combined.payment.notes,/Laundry:/);
assert.equal(orders.getOrder(service.order.id).balance,0);
current=phase5.listLaundryOrders().find(o=>o.id===laundry.order.id);
assert(current); assert.equal(current.balanceAmount,0); assert.equal(current.paidAmount,30);
assert.equal(store.getCustomer("c").outstandingBalance,0);
assert.equal(bal("accounts_receivable"),0); assert(accounting.buildBalanceSheet().balanced);

reset();
const safeService=orders.createOrder({customerId:"c",serviceType:"ladies_tailoring",price:40,advance:0});
assert.equal(safeService.errors.length,0); assert(safeService.order);
store.hydrateCore({customers:[customer(70,0)],products:[],sales:[],payments:[]});
phase5.hydratePhase5({suppliers:[{...supplier}],laundryOrders:[{
  id:"bad-laundry",orderNumber:"LDY-BAD-1",customerId:"c",customerName:"Collection Customer",garment:null,quantity:1,mode:"in_house_ironing",
  supplierId:null,supplierName:null,supplierRate:0,customerRate:30,profit:30,totalCustomerCharge:30,totalSupplierCost:0,status:"delivered",
  notes:null,paidAmount:10,balanceAmount:30,createdAt:"2099-01-01T00:00:00.000Z",updatedAt:"2099-01-01T00:00:00.000Z",version:1
}],expenses:[],purchases:[]});
const beforePreflight=JSON.stringify({
  customer:store.getCustomer("c"),
  service:orders.getOrder(safeService.order.id),
  laundry:phase5.listLaundryOrders(),
  payments:store.listPayments(),
});
const rejected=store.recordCustomerPayment({customerId:"c",amount:70,method:"cash"});
assert(rejected.errors.length); assert.match(rejected.errors.join(";"),/laundry balances need reconciliation/i);
assert.equal(JSON.stringify({
  customer:store.getCustomer("c"),
  service:orders.getOrder(safeService.order.id),
  laundry:phase5.listLaundryOrders(),
  payments:store.listPayments(),
}),beforePreflight);

reset(80,0);
phase5.hydratePhase5({suppliers:[{...supplier}],laundryOrders:[{
  id:"old",orderNumber:"LDY-OLD-1",customerId:"c",customerName:"Collection Customer",garment:null,quantity:1,mode:"in_house_ironing",
  supplierId:null,supplierName:null,supplierRate:0,customerRate:80,profit:80,totalCustomerCharge:80,totalSupplierCost:0,status:"delivered",
  notes:null,paidAmount:0,balanceAmount:80,createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z",version:1
}],expenses:[],purchases:[]});
const historic=store.recordCustomerPayment({customerId:"c",amount:80,method:"cash"});
assert.equal(historic.errors.length,0); assert.match(historic.payment.notes,/Laundry: LDY-OLD-1 80\.00/);
current=phase5.listLaundryOrders().find(o=>o.id==="old"); assert(current); assert.equal(current.paidAmount,80); assert.equal(current.balanceAmount,0);
assert.equal(bal("accounts_receivable"),0); assert.equal(bal("legacy_settlement_clearing"),-80); assert.equal(bal("cash"),80);
const blockedCancel=phase5.cancelLaundryOrder({orderId:"old",reason:"Customer cancellation",refundPaymentMethod:"cash"});
assert(blockedCancel.errors.length); assert.match(blockedCancel.errors.join(";"),/accounting reconciliation/i);

console.log("Laundry collection: FIFO provider allocation, no duplicate Payment, service coexistence, posted AR, historical clearing and cancellation source reconciliation PASS");
