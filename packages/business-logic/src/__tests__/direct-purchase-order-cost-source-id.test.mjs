import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,file);
const purchaseStore=require("../phase5-store.ts");
const orders=require("../orders-store.ts");
const accounting=require("../accounting-store.ts");
const outbox=require("../outbox-bridge.ts");
const permissions=require("../permissions.ts");
const remote=require("../remote-write.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const systemAccounts=structuredClone(accounting.exportAccountingState().accounts);
function reset() {
  accounting.hydrateAccountingState({accounts:structuredClone(systemAccounts),journals:[],journalSequence:0});
  orders.hydrateOrders({orders:[{id:"o",orderNumber:"ORD-1",expenses:[],orderExpensesTotal:0,version:1}]});
  purchaseStore.hydratePhase5({suppliers:[{id:"s",name:"Materials supplier",outstandingBalance:0,openingBalance:0}],
    purchases:[],expenses:[],laundryOrders:[]});
  outbox.hydrateOutbox([]);
}
const create=()=>purchaseStore.createPurchase({supplierId:"s",orderId:"o",
  kind:"order_specific",description:"Fabric for the work order",
  amount:65.25,paidAmount:15.25,paymentMethod:"cash",date:"2026-09-20"});
test("purchase-linked order cost carries its immutable purchase source id",()=>{
  reset();
  const result=create();
  assert.deepEqual(result.errors,[]);
  assert.ok(result.purchase?.id);
  const linked=orders.getOrder("o").expenses;
  assert.equal(linked.length,1);
  assert.equal(linked[0].id,result.purchase.id,"do not create a second random cost identity");
  assert.equal(linked[0].amount,65.25);
  assert.equal(orders.getOrder("o").orderExpensesTotal,65.25);
  assert.equal(purchaseStore.getSupplier("s").outstandingBalance,50);
  assert.equal(accounting.listJournalEntries().length,1);
  assert.equal(accounting.buildBalanceSheet().balanced,true);
});
test("source replay is rejected without duplicate order costs or extra outbox events",()=>{
  reset();
  const purchase=create().purchase;
  assert.ok(purchase);
  const before=JSON.stringify({
    order:orders.getOrder("o"),outbox:outbox.exportOutbox(),accounting:accounting.exportAccountingState(),
  });
  const eligible=orders.preflightOrderExpenseAddition("o",purchase.amount,purchase.id);
  assert.equal(eligible.order,null);
  assert.match(eligible.error,/source already exists/);
  const duplicate=orders.addOrderExpense("o","Replay",purchase.amount,purchase.id);
  assert.equal(duplicate.order,null);
  assert.match(duplicate.error,/source already exists/);
  assert.equal(JSON.stringify({
    order:orders.getOrder("o"),outbox:outbox.exportOutbox(),accounting:accounting.exportAccountingState(),
  }),before);
});
