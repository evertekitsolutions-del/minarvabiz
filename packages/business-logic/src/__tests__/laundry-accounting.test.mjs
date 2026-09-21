import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const phase5=require("../phase5-store.ts"), store=require("../store.ts"), accounting=require("../accounting-store.ts"), outbox=require("../outbox-bridge.ts"), permissions=require("../permissions.ts");
permissions.setCurrentRole("admin"); permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;
const customer=(outstandingBalance=0)=>({id:"c",name:"Laundry Customer",outstandingBalance,totalSpending:0,createdAt:"2026-01-01",updatedAt:"2026-01-01"});
const supplier=(outstandingBalance=0)=>({id:"s",name:"Laundry Supplier",category:"laundry",openingBalance:0,outstandingBalance,createdAt:"2026-01-01",updatedAt:"2026-01-01"});
function reset(accounts=chart,customerBalance=0,supplierBalance=0){
  accounting.hydrateAccountingState({accounts,journals:[],journalSequence:0});
  store.hydrateCore({customers:[customer(customerBalance)],products:[],sales:[],payments:[]});
  phase5.hydratePhase5({suppliers:[supplier(supplierBalance)],laundryOrders:[],expenses:[],purchases:[]});
  outbox.hydrateOutbox([]);
}
const bal=key=>{const a=accounting.getSystemAccount(key);const row=accounting.buildTrialBalance().find(r=>r.accountId===a?.id);return Math.round(((row?.debit??0)-(row?.credit??0))*100)/100;};
const snap=()=>JSON.stringify({customer:store.getCustomer("c"),supplier:phase5.getSupplier("s"),orders:phase5.listLaundryOrders(),accounting:accounting.exportAccountingState(),outbox:outbox.exportOutbox()});

reset();
let r=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:999,customerRate:100,paidAmount:40,paymentMethod:"cash"});
assert.equal(r.errors.length,0); assert(r.order); assert.equal(r.order.totalSupplierCost,0); assert.equal(r.order.supplierId,null);
assert.equal(store.getCustomer("c").outstandingBalance,60); assert.equal(store.getCustomer("c").totalSpending,40);
assert.equal(bal("cash"),40); assert.equal(bal("accounts_receivable"),60); assert.equal(bal("laundry_revenue"),-100); assert.equal(bal("laundry_costs"),0); assert.equal(bal("accounts_payable"),0);
assert.equal(accounting.buildProfitAndLoss().netProfit,100); assert(accounting.buildBalanceSheet().balanced);
let j=accounting.listJournalEntries().find(x=>x.referenceType==="auto_laundry"); assert(j); assert(accounting.voidJournalEntry(j.id).errors.length);

reset();
r=phase5.createLaundryOrder({customerId:"c",quantity:2,mode:"outsourced",supplierId:"s",supplierRate:60,customerRate:100,paidAmount:50,paymentMethod:"bank"});
assert.equal(r.errors.length,0); assert(r.order);
assert.equal(store.getCustomer("c").outstandingBalance,150); assert.equal(store.getCustomer("c").totalSpending,50); assert.equal(phase5.getSupplier("s").outstandingBalance,120);
assert.equal(bal("bank"),50); assert.equal(bal("accounts_receivable"),150); assert.equal(bal("laundry_revenue"),-200); assert.equal(bal("laundry_costs"),120); assert.equal(bal("accounts_payable"),-120);
assert.equal(accounting.buildProfitAndLoss().netProfit,80); assert(accounting.buildBalanceSheet().balanced);

reset();
r=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:25,paidAmount:25});
assert.equal(r.errors.length,0); assert.equal(bal("cash"),25);

reset(); const before=snap();
for(const patch of [
  {quantity:NaN},{quantity:0},{quantity:Infinity},{customerRate:NaN},{customerRate:-1},{supplierRate:Infinity},{paidAmount:NaN},{paidAmount:-1}
]){
  const base={customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:10,paidAmount:0};
  const bad=phase5.createLaundryOrder({...base,...patch}); assert(bad.errors.length); assert.equal(snap(),before);
}
assert(phase5.createLaundryOrder({customerId:"missing",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:10}).errors.length); assert.equal(snap(),before);
assert(phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"missing",supplierRate:5,customerRate:10}).errors.length); assert.equal(snap(),before);

reset(chart,NaN,0); const corruptCustomer=snap();
assert(phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:10}).errors.length); assert.equal(snap(),corruptCustomer);
reset(chart,0,NaN); const corruptSupplier=snap();
assert(phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"s",supplierRate:5,customerRate:10}).errors.length); assert.equal(snap(),corruptSupplier);

reset(chart.map(a=>a.systemKey==="laundry_revenue"?{...a,isActive:false}:a)); const blockedRevenue=snap();
assert(phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:10}).errors.length); assert.equal(snap(),blockedRevenue);
reset(chart.map(a=>a.systemKey==="laundry_costs"?{...a,isActive:false}:a)); const blockedCost=snap();
assert(phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"s",supplierRate:5,customerRate:10}).errors.length); assert.equal(snap(),blockedCost);

reset(); permissions.setCurrentRole(null); assert.throws(()=>phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:10}),/denied/i); permissions.setCurrentRole("admin");

reset();
r=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"s",supplierRate:4,customerRate:10,paidAmount:3,paymentMethod:"upi"});
assert.equal(r.errors.length,0); assert.equal(bal("payment_clearing"),3); assert.equal(bal("cash"),0);
for(const type of ["laundry_orders","customers","suppliers","accounts","journal_entries","journal_entry_lines"]) assert(outbox.listPendingOutbox().some(e=>e.aggregateType===type),type);

reset();
phase5.hydratePhase5({suppliers:[supplier(5)],laundryOrders:[{id:"old",orderNumber:"LDY-202601-0001",customerId:"c",customerName:"Laundry Customer",quantity:1,mode:"outsourced",supplierId:"s",supplierName:"Laundry Supplier",supplierRate:5,customerRate:10,profit:5,totalCustomerCharge:10,totalSupplierCost:5,status:"pending",paidAmount:0,balanceAmount:10,createdAt:"2026-01-01",updatedAt:"2026-01-01",version:1}],expenses:[],purchases:[]});
assert.equal(accounting.listJournalEntries().length,0);
console.log("Laundry accounting: revenue/AR/receipts, outsource cost/AP, validation, immutable automatic journals, permissions, outbox and no historical backfill PASS");
