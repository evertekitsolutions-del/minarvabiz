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
const customer=(outstandingBalance=0,totalSpending=0)=>({
  id:"c",name:"Service Customer",outstandingBalance,totalSpending,createdAt:"2026-01-01",updatedAt:"2026-01-01"
});
function reset(outstandingBalance=0,totalSpending=0){
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  store.hydrateCore({customers:[customer(outstandingBalance,totalSpending)],products:[],sales:[],payments:[]});
  orders.hydrateOrders({orders:[],measurements:[]});
  outbox.hydrateOutbox([]);
}
const bal=(key)=>{
  const a=accounting.getSystemAccount(key);
  const row=accounting.buildTrialBalance().find(r=>r.accountId===a?.id);
  return Math.round(((row?.debit??0)-(row?.credit??0))*100)/100;
};

reset();
const created=orders.createOrder({
  customerId:"c",serviceType:"ladies_tailoring",price:200,advance:50,advancePaymentMethod:"bank"
});
assert.deepEqual(created.errors,[]);
assert(created.order);
assert.equal(created.order.advance,50);
assert.equal(created.order.balance,150);
assert.equal(store.getCustomer("c").outstandingBalance,150);

const first=store.recordCustomerPayment({customerId:"c",amount:100,method:"upi",reference:"RCPT-1"});
assert.deepEqual(first.errors,[]);
assert(first.payment);
assert.equal(first.payment.amount,100);
assert.match(first.payment.notes,/Service orders: .*100\.00/);
assert.equal(created.order.advance,150);
assert.equal(created.order.balance,50);
assert.equal(store.getCustomer("c").outstandingBalance,50);
assert.equal(store.getCustomer("c").totalSpending,150);
assert.equal(bal("bank"),50);
assert.equal(bal("payment_clearing"),100);
assert.equal(bal("accounts_receivable"),50);
assert.equal(bal("service_revenue"),-200);
assert(outbox.listPendingOutbox().some(e=>e.aggregateType==="orders"&&e.aggregateId===created.order.id));

const second=store.recordCustomerPayment({customerId:"c",amount:999,method:"cash"});
assert.deepEqual(second.errors,[]);
assert(second.payment);
assert.equal(second.payment.amount,50);
assert.equal(created.order.advance,200);
assert.equal(created.order.balance,0);
assert.equal(store.getCustomer("c").outstandingBalance,0);
assert.equal(bal("cash"),50);
assert.equal(bal("accounts_receivable"),0);
assert(accounting.buildBalanceSheet().balanced);

// Hydrated historical service orders have no source posting; their collection must not
// invent Accounts Receivable and is routed through legacy settlement clearing.
reset(80,0);
orders.hydrateOrders({orders:[{
  id:"old",orderNumber:"ORD-OLD-1",customerId:"c",customerName:"Service Customer",
  orderDate:"2026-01-01",serviceType:"ladies_tailoring",status:"pending",
  customerSuppliedMaterial:false,shopSuppliedMaterial:true,price:80,discount:0,advance:0,balance:80,
  externalMaterialCost:0,orderExpensesTotal:0,quantity:1,unitPrice:80,bulkDiscount:0,tshirt:null,
  expenses:[],createdAt:"2026-01-01",updatedAt:"2026-01-01",version:1
}],measurements:[]});
const historic=store.recordCustomerPayment({customerId:"c",amount:80,method:"cash"});
assert.deepEqual(historic.errors,[]);
assert.equal(orders.getOrder("old").advance,80);
assert.equal(orders.getOrder("old").balance,0);
assert.equal(bal("accounts_receivable"),0);
assert.equal(bal("legacy_settlement_clearing"),-80);
assert.equal(bal("cash"),80);

console.log("Service-order collection: FIFO allocation, order settlement, tender accounting, persistence and historical clearing PASS");
