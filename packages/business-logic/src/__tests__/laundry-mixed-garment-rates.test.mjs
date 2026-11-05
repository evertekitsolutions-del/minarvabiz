import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const phase5=require("../phase5-store.ts");
const phase9=require("../phase9-store.ts");
const store=require("../store.ts");
const accounting=require("../accounting-store.ts");
const outbox=require("../outbox-bridge.ts");
const permissions=require("../permissions.ts");
const receipts=require("../laundry-service-receipt.ts");
const {calculateLaundryTicketTotals}=require("../laundry.ts");
const stamp="2026-11-05T00:00:00Z";
const branches=[{id:"hq",name:"HQ",code:"HQ",isHeadquarters:true,isActive:true,createdAt:stamp,updatedAt:stamp}];
const chart=accounting.exportAccountingState().accounts;
const customer={id:"c",name:"Test Customer",outstandingBalance:0,totalSpending:0,createdAt:stamp,updatedAt:stamp};
const supplier={id:"s",name:"Test Laundry Vendor",category:"laundry",openingBalance:0,outstandingBalance:0,createdAt:stamp,updatedAt:stamp};
const shop={
  shopName:"Test Laundry",legalName:"",address:"",addressLine2:"",district:"",state:"",country:"",postalCode:"",
  phone:"",email:"",website:"",gstin:"",receiptFooter:"",currency:"INR",documentCode:"",updatedAt:stamp
};
function setup(){
  permissions.setCurrentRole("admin");permissions.setRuntimeFeaturePolicy(null);
  phase9.hydratePhase9({branches,activeBranchId:"hq"});
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  store.hydrateCore({customers:[{...customer}],products:[],sales:[],payments:[]});
  phase5.hydratePhase5({suppliers:[{...supplier}],laundryOrders:[],expenses:[],purchases:[]});
  outbox.hydrateOutbox([]);
}
const items=[
 {label:"Cotton Shirt",quantity:2,serviceCode:"wash",fabricType:"cotton",tatHours:24,customerRate:100.25,supplierRate:60.2},
 {label:"Silk Saree",quantity:1,serviceCode:"dry_clean",fabricType:"silk",tatHours:72,customerRate:240,supplierRate:130},
];
const draft={customerId:"c",mode:"outsourced",supplierId:"s",quantity:3,
 customerRate:1,supplierRate:1,items,paidAmount:100,paymentMethod:"cash"};
function trial(key){
  const account=accounting.getSystemAccount(key);
  const row=accounting.buildTrialBalance().find(entry=>entry.accountId===account.id);
  return Math.round(((row?.debit??0)-(row?.credit??0))*100)/100;
}
test("mixed service, garment and supplier prices post exact reconciled AR, AP, cash and profit",()=>{
  setup();
  const made=phase5.createLaundryOrder(draft);
  assert.equal(made.errors.length,0,made.errors.join("; "));
  assert(made.order);
  const o=made.order;
  assert.equal(o.quantity,3);
  assert.equal(o.items.length,2);
  assert.equal(o.items[0].customerRate,100.25);
  assert.equal(o.items[1].supplierRate,130);
  assert.equal(o.customerRate,1,"ticket-level legacy rate is not used for mixed line totals");
  assert.equal(o.totalCustomerCharge,440.5);
  assert.equal(o.totalSupplierCost,250.4);
  assert.equal(o.profit,190.1);
  assert.equal(o.paidAmount,100);
  assert.equal(o.balanceAmount,340.5);
  assert.equal(store.getCustomer("c").outstandingBalance,340.5);
  assert.equal(phase5.getSupplier("s").outstandingBalance,250.4);
  assert.equal(trial("cash"),100);
  assert.equal(trial("accounts_receivable"),340.5);
  assert.equal(trial("laundry_revenue"),-440.5);
  assert.equal(trial("laundry_costs"),250.4);
  assert.equal(trial("accounts_payable"),-250.4);
  assert(accounting.buildBalanceSheet().balanced);
  assert(outbox.listPendingOutbox().some(event=>event.aggregateType==="laundry_orders"&&event.aggregateId===o.id));
  const html=receipts.buildLaundryServiceReceiptHtml(o,{shop});
  assert.match(html,/INR 100\.25/);
  assert.match(html,/INR 200\.50/);
  assert.match(html,/INR 240\.00/);
  assert.match(html,/INR 440\.50/);
  assert.match(html,/INR 340\.50/);
  const snapshot=JSON.parse(JSON.stringify(phase5.exportPhase5State()));
  phase5.hydratePhase5({...snapshot,laundryOrders:[]});
  phase5.hydratePhase5(snapshot);
  assert.equal(phase5.listLaundryOrders()[0].items[1].customerRate,240);
  assert.equal(phase5.listLaundryOrders()[0].totalCustomerCharge,440.5);
  const changed=phase5.updateLaundryDetails(o.id,{items:[
    {...o.items[0],customerRate:1},o.items[1],
  ]});
  assert.equal(changed.order,null);
  assert.match(changed.errors.join(" "),/immutable/i);
  assert.equal(phase5.listLaundryOrders()[0].items[0].customerRate,100.25);
});
test("invalid partially priced or unbalanced items fail without payments, journals or outbox",()=>{
  for(const bad of [
    [{...items[0],supplierRate:undefined},items[1]],
    [{...items[0],customerRate:-1},items[1]],
    [{...items[0],customerRate:NaN},items[1]],
    [{...items[0],supplierRate:Infinity},items[1]],
    [{...items[0],quantity:0},items[1]],
    [{...items[0],quantity:2.0001},items[1]],
  ]){
    setup();
    const before=JSON.stringify({customer:store.getCustomer("c"),supplier:phase5.getSupplier("s"),
      orders:phase5.exportPhase5State().laundryOrders,journals:accounting.exportAccountingState(),
      payments:store.listPayments(),outbox:outbox.exportOutbox()});
    const result=phase5.createLaundryOrder({...draft,items:bad});
    assert.equal(result.order,null,"malformed mixed-rate ticket must not post");
    assert(result.errors.length>0);
    const after=JSON.stringify({customer:store.getCustomer("c"),supplier:phase5.getSupplier("s"),
      orders:phase5.exportPhase5State().laundryOrders,journals:accounting.exportAccountingState(),
      payments:store.listPayments(),outbox:outbox.exportOutbox()});
    assert.equal(after,before);
  }
});
test("pure mixed quote rejects quantity mismatch, in-house vendor cost and unsafe money",()=>{
  assert.deepEqual(calculateLaundryTicketTotals({mode:"outsourced",quantity:3,customerRate:1,supplierRate:1,items}),{
    totalCustomerCharge:440.5,totalSupplierCost:250.4,totalProfit:190.1
  });
  assert.throws(()=>calculateLaundryTicketTotals({mode:"outsourced",quantity:2,customerRate:1,supplierRate:1,items}),/quantit/i);
  assert.throws(()=>calculateLaundryTicketTotals({mode:"in_house_ironing",quantity:3,customerRate:1,supplierRate:0,items}),/rates/i);
  assert.throws(()=>calculateLaundryTicketTotals({mode:"outsourced",quantity:3,customerRate:1,supplierRate:0,items:[{...items[0],customerRate:Infinity},items[1]]}));
});
test("legacy tickets remain uniform-price and existing receipt behavior is unchanged",()=>{
  setup();
  const normal=phase5.createLaundryOrder({customerId:"c",mode:"in_house_ironing",quantity:2,
    customerRate:20,supplierRate:0,paidAmount:0,items:[{label:"Shirt",quantity:2}]});
  assert.equal(normal.errors.length,0,normal.errors.join("; "));
  assert.equal(normal.order.totalCustomerCharge,40);
  assert.equal(normal.order.items[0].customerRate,undefined);
  const html=receipts.buildLaundryServiceReceiptHtml(normal.order,{shop});
  assert.match(html,/INR 20\.00/);
  assert.match(html,/INR 40\.00/);
});
test("shared UI supports opt-in per-garment prices and keeps the default uniform flow",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryForm.tsx",import.meta.url),"utf8");
  assert.match(ui,/Different service\/rate for each garment/);
  assert.match(ui,/React\.useState\(false\)/);
  assert.match(ui,/calculateLaundryTicketTotals/);
  assert.match(ui,/Use saved rate/);
});
