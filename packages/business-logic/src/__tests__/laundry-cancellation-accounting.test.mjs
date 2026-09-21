import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const phase5=require("../phase5-store.ts"), store=require("../store.ts"), accounting=require("../accounting-store.ts"), outbox=require("../outbox-bridge.ts"), permissions=require("../permissions.ts");
permissions.setCurrentRole("admin"); permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;
const customer=(outstandingBalance=0,totalSpending=0)=>({id:"c",name:"Laundry Customer",outstandingBalance,totalSpending,createdAt:"2026-01-01",updatedAt:"2026-01-01"});
const supplier=(outstandingBalance=0)=>({id:"s",name:"Laundry Supplier",category:"laundry",openingBalance:outstandingBalance,outstandingBalance,createdAt:"2026-01-01",updatedAt:"2026-01-01"});
function reset(customerBalance=0,supplierBalance=0){
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  store.hydrateCore({customers:[customer(customerBalance)],products:[],sales:[],payments:[]});
  phase5.hydratePhase5({suppliers:[supplier(supplierBalance)],laundryOrders:[],expenses:[],purchases:[]});
  outbox.hydrateOutbox([]);
}
const bal=key=>{const a=accounting.getSystemAccount(key);const row=accounting.buildTrialBalance().find(r=>r.accountId===a?.id);return Math.round(((row?.debit??0)-(row?.credit??0))*100)/100;};
const snap=()=>JSON.stringify({customer:store.getCustomer("c"),supplier:phase5.getSupplier("s"),orders:phase5.listLaundryOrders(),payments:store.listPayments(),accounting:accounting.exportAccountingState(),outbox:outbox.exportOutbox()});

reset();
let created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:10,paidAmount:10,paymentMethod:"cash"});
assert.equal(created.errors.length,0); assert(created.order);
outbox.hydrateOutbox([]);
let cancelled=phase5.cancelLaundryOrder({orderId:created.order.id,refundPaymentMethod:"bank"});
assert.equal(cancelled.errors.length,0); assert.equal(cancelled.order?.status,"cancelled");
assert.equal(store.getCustomer("c").outstandingBalance,0); assert.equal(store.getCustomer("c").totalSpending,0);
assert.equal(bal("laundry_revenue"),0); assert.equal(bal("cash"),10); assert.equal(bal("bank"),-10);
assert.equal(accounting.buildProfitAndLoss().netProfit,0); assert(accounting.buildBalanceSheet().balanced);
let refund=store.listPayments().find(p=>p.referenceType==="refund"&&p.referenceId===created.order.id);
assert(refund); assert.equal(refund.amount,10); assert.equal(refund.method,"bank"); assert.match(refund.notes,/Laundry cancellation refund/);
let refs=accounting.listJournalEntries().filter(j=>j.referenceId===created.order.id);
assert.equal(refs.filter(j=>j.referenceType==="auto_laundry").length,1); assert.equal(refs.filter(j=>j.referenceType==="auto_laundry_cancel").length,1);
for(const j of refs) assert(accounting.voidJournalEntry(j.id).errors.length);
for(const type of ["laundry_orders","customers","payments","accounts","journal_entries","journal_entry_lines"]) assert(outbox.listPendingOutbox().some(e=>e.aggregateType===type),type);

reset();
created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"s",supplierRate:4,customerRate:10,paidAmount:3,paymentMethod:"upi"});
assert.equal(created.errors.length,0); assert(created.order); assert.equal(store.getCustomer("c").outstandingBalance,7); assert.equal(phase5.getSupplier("s").outstandingBalance,4);
cancelled=phase5.cancelLaundryOrder({orderId:created.order.id,refundPaymentMethod:"cash",supplierCostAction:"reverse"});
assert.equal(cancelled.errors.length,0); assert.equal(store.getCustomer("c").outstandingBalance,0); assert.equal(store.getCustomer("c").totalSpending,0); assert.equal(phase5.getSupplier("s").outstandingBalance,0);
assert.equal(bal("laundry_revenue"),0); assert.equal(bal("laundry_costs"),0); assert.equal(bal("accounts_payable"),0);
assert.equal(accounting.buildProfitAndLoss().netProfit,0); assert(accounting.buildBalanceSheet().balanced);

reset();
created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"s",supplierRate:4,customerRate:10,paidAmount:0});
assert(created.order);
cancelled=phase5.cancelLaundryOrder({orderId:created.order.id,supplierCostAction:"keep"});
assert.equal(cancelled.errors.length,0); assert.equal(store.getCustomer("c").outstandingBalance,0); assert.equal(phase5.getSupplier("s").outstandingBalance,4);
assert.equal(bal("laundry_revenue"),0); assert.equal(bal("laundry_costs"),4); assert.equal(bal("accounts_payable"),-4);
assert.equal(accounting.buildProfitAndLoss().netProfit,-4); assert(accounting.buildBalanceSheet().balanced);
assert.equal(store.listPayments().filter(p=>p.referenceType==="refund"&&p.referenceId===created.order.id).length,0);

reset();
created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"s",supplierRate:4,customerRate:10,paidAmount:0});
assert(created.order); let before=snap();
cancelled=phase5.cancelLaundryOrder({orderId:created.order.id});
assert.equal(cancelled.order,null); assert.match(cancelled.errors.join(";"),/supplier cost/i); assert.equal(snap(),before);

reset();
created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:10,paidAmount:3,paymentMethod:"cash"});
assert(created.order);
const c=store.getCustomer("c"); store.hydrateCore({customers:[{...c}],products:[],sales:[],payments:[]});
before=snap();
cancelled=phase5.cancelLaundryOrder({orderId:created.order.id,refundPaymentMethod:"cash"});
assert.equal(cancelled.order,null); assert.match(cancelled.errors.join(";"),/receipt.*sources? need reconciliation/i); assert.equal(snap(),before);

reset(20,0);
created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:10,paidAmount:0});
assert(created.order);
const collected=store.recordCustomerPayment({customerId:"c",amount:1,method:"cash"}); assert.equal(collected.errors.length,0);
before=snap();
cancelled=phase5.cancelLaundryOrder({orderId:created.order.id});
assert.equal(cancelled.order,null); assert.match(cancelled.errors.join(";"),/collections need allocation/i); assert.equal(snap(),before);

reset(0,10);
created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"outsourced",supplierId:"s",supplierRate:4,customerRate:10,paidAmount:0});
assert(created.order);
const supplierPaid=phase5.recordSupplierPayment({supplierId:"s",amount:1,paymentMethod:"cash"}); assert.equal(supplierPaid.errors.length,0);
before=snap();
cancelled=phase5.cancelLaundryOrder({orderId:created.order.id,supplierCostAction:"reverse"});
assert.equal(cancelled.order,null); assert.match(cancelled.errors.join(";"),/supplier payments need allocation/i); assert.equal(snap(),before);
cancelled=phase5.cancelLaundryOrder({orderId:created.order.id,supplierCostAction:"keep"});
assert.equal(cancelled.errors.length,0); assert.equal(cancelled.order?.status,"cancelled"); assert.equal(phase5.getSupplier("s").outstandingBalance,13);

reset();
phase5.hydratePhase5({suppliers:[supplier(0)],laundryOrders:[{id:"old",orderNumber:"LDY-OLD",customerId:"c",customerName:"Laundry Customer",quantity:1,mode:"in_house_ironing",supplierId:null,supplierName:null,supplierRate:0,customerRate:10,profit:10,totalCustomerCharge:10,totalSupplierCost:0,status:"delivered",paidAmount:0,balanceAmount:10,createdAt:"2026-01-01",updatedAt:"2026-01-01",version:1}],expenses:[],purchases:[]});
store.hydrateCore({customers:[customer(10)],products:[],sales:[],payments:[]});
before=snap();
cancelled=phase5.cancelLaundryOrder({orderId:"old"});
assert.equal(cancelled.order,null); assert.match(cancelled.errors.join(";"),/accounting reconciliation/i); assert.equal(snap(),before);

reset();
created=phase5.createLaundryOrder({customerId:"c",quantity:1,mode:"in_house_ironing",supplierRate:0,customerRate:10,paidAmount:0});
assert(created.order); permissions.setCurrentRole(null);
assert.throws(()=>phase5.cancelLaundryOrder({orderId:created.order.id}),/denied/i);
permissions.setCurrentRole("admin");

console.log("Laundry cancellation: explicit refund tender, supplier keep/reverse, exact source guards, immutable journals, ambiguity blocks and outbox PASS");
