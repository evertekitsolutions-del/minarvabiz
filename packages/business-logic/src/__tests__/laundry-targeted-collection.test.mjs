import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const store=require("../store.ts");
const laundry=require("../phase5-store.ts");
const accounting=require("../accounting-store.ts");
const ledger=require("../customer-ledger.ts");
const permissions=require("../permissions.ts");
const outbox=require("../outbox-bridge.ts");
const chart=accounting.exportAccountingState().accounts;
function reset(){
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  store.hydrateCore({customers:[{
    id:"c",name:"Collection Customer",outstandingBalance:0,totalSpending:0,
    createdAt:"2026-11-01",updatedAt:"2026-11-01",
  }],products:[],sales:[],payments:[]});
  laundry.hydratePhase5({suppliers:[],laundryOrders:[],expenses:[],purchases:[]});
  outbox.hydrateOutbox([]);
}
function ticket(amount){
  const res=laundry.createLaundryOrder({
    customerId:"c",mode:"in_house_ironing",quantity:1,supplierRate:0,customerRate:amount,
    paidAmount:0,paymentMethod:"cash",
  });
  assert.equal(res.errors.length,0,res.errors.join("; "));
  assert(res.order);
  return res.order;
}
test("targeted laundry receipt cannot be allocated to an earlier different ticket",()=>{
  reset();
  const first=ticket(100),second=ticket(80);
  const posted=accounting.listJournalEntries().length;
  const before=JSON.stringify({orders:laundry.listLaundryOrders(),customer:store.getCustomer("c"),payments:store.listPayments()});
  const rejected=store.recordCustomerPayment({
    customerId:"c",amount:81,method:"upi",target:{sourceType:"laundry",id:second.id}
  });
  assert.equal(rejected.payment,null);
  assert.match(rejected.errors.join(" "),/cannot exceed/i);
  assert.equal(JSON.stringify({orders:laundry.listLaundryOrders(),customer:store.getCustomer("c"),payments:store.listPayments()}),before);
  const result=store.recordCustomerPayment({
    customerId:"c",amount:30,method:"upi",target:{sourceType:"laundry",id:second.id}
  });
  assert.equal(result.errors.length,0,result.errors.join("; "));
  assert.equal(result.payment?.amount,30);
  assert.equal(result.payment?.method,"upi");
  assert.equal(result.payment?.referenceType,"other");
  assert.match(result.payment?.notes||"",/Laundry:.*30/);
  let orders=laundry.listLaundryOrders();
  assert.equal(orders.find(x=>x.id===first.id)?.balanceAmount,100);
  assert.equal(orders.find(x=>x.id===second.id)?.paidAmount,30);
  assert.equal(orders.find(x=>x.id===second.id)?.balanceAmount,50);
  assert.equal(store.getCustomer("c")?.outstandingBalance,150);
  assert.equal(accounting.listJournalEntries().length,posted+1);
  assert(outbox.listPendingOutbox().some(e=>e.aggregateType==="laundry_orders"&&e.aggregateId===second.id));
  assert.equal(ledger.buildCustomerStatement("c")?.reconciliationDifference,0);
});
test("partial balance, duplicate stale attempts, missing target and status checks fail closed",()=>{
  reset();
  const first=ticket(50);
  assert.equal(store.recordCustomerPayment({customerId:"c",amount:50,method:"cash",target:{sourceType:"laundry",id:first.id}}).errors.length,0);
  for(const candidate of [
    {sourceType:"laundry",id:first.id},
    {sourceType:"laundry",id:"not-found"},
  ]) {
    const result=store.recordCustomerPayment({customerId:"c",amount:1,method:"cash",target:candidate});
    assert(result.errors.length>0);
  }
  assert.equal(store.listPayments().length,1);
  assert.equal(laundry.listLaundryOrders().find(x=>x.id===first.id)?.paidAmount,50);
});
test("shared Web and Windows laundry UI exposes explicit targeted collection path",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
  const win=fs.readFileSync(new URL("../../../../apps/desktop/src/App.tsx",import.meta.url),"utf8");
  const web=fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/laundry/page.tsx",import.meta.url),"utf8");
  assert.match(ui,/Collect ticket balance/);
  assert.match(ui,/onCollectPayment/);
  assert.match(web,/target:\s*\{\s*sourceType:\s*"laundry"/);
  assert.match(win,/target:\{sourceType:"laundry"/);
  assert.match(ui,/can\("payments.collect"\)/);
});
