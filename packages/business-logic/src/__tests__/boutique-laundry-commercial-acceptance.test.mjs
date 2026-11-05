import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const permissions=require("../permissions.ts");
const branch=require("../phase9-store.ts");
const store=require("../store.ts");
const tailoring=require("../orders-store.ts");
const laundry=require("../phase5-store.ts");
const accounting=require("../accounting-store.ts");
const ledger=require("../customer-ledger.ts");
const outbox=require("../outbox-bridge.ts");

const now="2026-11-05T00:00:00.000Z";
const branches=[{id:"hq",name:"Main Boutique",code:"HQ",isActive:true,isHeadquarters:true,createdAt:now,updatedAt:now}];
const chart=accounting.exportAccountingState().accounts;
function reset() {
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  branch.hydratePhase9({branches,activeBranchId:"hq"});
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  store.hydrateCore({customers:[],products:[],sales:[],payments:[]});
  tailoring.hydrateOrders({orders:[],measurements:[]});
  laundry.hydratePhase5({suppliers:[],laundryOrders:[],expenses:[],purchases:[]});
  outbox.hydrateOutbox([]);
}
test("real tailoring + ironing checkout, targeted settlement and unified statement reconcile",()=>{
  reset();
  const customer=store.createCustomer({name:"Boutique Customer",phone:"9999999999"});
  const tailor=tailoring.createOrder({
    customerId:customer.id,serviceType:"ladies_tailoring",price:300,
    advance:100,advancePaymentMethod:"cash",deliveryDate:"2026-11-10",
    measurements:{chest:34,waist:30},
  });
  assert.equal(tailor.errors.length,0,tailor.errors.join("; "));
  assert(tailor.order);
  const ironing=laundry.createLaundryOrder({
    customerId:customer.id,mode:"in_house_ironing",quantity:2,
    items:[
      {label:"Shirt",quantity:1,serviceCode:"steam_iron",fabricType:"cotton",tatHours:24,customerRate:30,supplierRate:0},
      {label:"Saree",quantity:1,serviceCode:"iron_fold",fabricType:"silk",tatHours:24,customerRate:55,supplierRate:0}
    ],
    customerRate:1,supplierRate:0,paidAmount:20,paymentMethod:"upi",
  });
  assert.equal(ironing.errors.length,0,ironing.errors.join("; "));
  assert(ironing.order);
  assert.equal(ironing.order.totalCustomerCharge,85);
  assert.equal(ironing.order.balanceAmount,65);
  assert.equal(store.getCustomer(customer.id).outstandingBalance,265);
  const collection=store.recordCustomerPayment({
    customerId:customer.id,amount:65,method:"cash",
    target:{sourceType:"laundry",id:ironing.order.id}
  });
  assert.equal(collection.errors.length,0,collection.errors.join("; "));
  assert(collection.payment);
  assert.equal(store.getCustomer(customer.id).outstandingBalance,200);
  const postedLaundry=laundry.listLaundryOrders({customerId:customer.id})[0];
  assert.equal(postedLaundry.balanceAmount,0);
  assert.equal(postedLaundry.paidAmount,85);
  const summary=ledger.buildCustomerStatement(customer.id);
  assert(summary);
  assert.equal(summary.totalSales,385);
  assert.equal(summary.totalPaid,185);
  assert.equal(summary.outstanding,200);
  assert.equal(summary.reconciliationDifference,0);
  assert(accounting.buildBalanceSheet().balanced);
  assert(outbox.listPendingOutbox().some(e=>e.aggregateType==="laundry_orders"&&e.aggregateId===ironing.order.id));
});
test("Windows Boutique edition excludes irrelevant generic AMC, warranty, and site-visit UI while retaining service orders",()=>{
  const orderList=fs.readFileSync(new URL("../../../ui/src/components/orders/OrderList.tsx",import.meta.url),"utf8");
  const desktop=fs.readFileSync(new URL("../../../../apps/desktop/src/App.tsx",import.meta.url),"utf8");
  const web=fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/services/page.tsx",import.meta.url),"utf8");
  assert.match(desktop,/<OrderList industryProfile="boutique_laundry"/);
  assert.match(orderList,/const showFieldServiceTools = industryProfile !== "boutique_laundry"/);
  assert.match(orderList,/\{showFieldServiceTools && <details/);
  assert.match(orderList,/\{showFieldServiceTools && <ServiceWarrantyPanel/);
  assert.match(orderList,/\{showFieldServiceTools && <ServiceSiteVisitPanel/);
  assert.match(orderList,/<DataTable columns=\{columns\} rows=\{visibleOrders\}/);
  assert.match(web,/<OrderList[\s\S]*?orders=\{orders\}/);
  assert.doesNotMatch(web, /industryProfile="boutique_laundry"/,"Generic Web service customers retain their existing service tools");
});
