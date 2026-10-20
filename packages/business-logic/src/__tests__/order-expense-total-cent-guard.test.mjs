import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,file);
const orders=require("../orders-store.ts");
const outbox=require("../outbox-bridge.ts");
const permissions=require("../permissions.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
function reset(total=0) {
  orders.hydrateOrders({orders:[{
    id:"expense-order",orderNumber:"ORD-1",expenses:[],orderExpensesTotal:total,version:1,
  }]});
  outbox.hydrateOutbox([]);
}
const snapshot=()=>JSON.stringify({
  order:orders.getOrder("expense-order"),outbox:outbox.exportOutbox(),
});
test("fractional-cent amounts cannot silently round into an order expense",()=>{
  for(const amount of [1.234,2.005,.001,-1,Number.NaN,Infinity]){
    reset();
    const before=snapshot();
    const result=orders.addOrderExpense("expense-order","Source cost",amount);
    assert.equal(result.order,null,String(amount));
    assert.equal(snapshot(),before,String(amount));
  }
});
test("corrupt existing total rejects new expenses without changing order or outbox",()=>{
  for(const total of [Number.NaN,Infinity,-1,1.005,90071992547410]){
    reset(total);
    const before=snapshot();
    const result=orders.addOrderExpense("expense-order","Source cost",5);
    assert.equal(result.order,null,String(total));
    assert.match(result.error,/reconciliation/);
    assert.equal(snapshot(),before,String(total));
  }
});
test("safe individual cents cannot overflow accumulated order total",()=>{
  reset(90071992547409.9);
  const before=snapshot();
  const result=orders.addOrderExpense("expense-order","Overflow",.02);
  assert.equal(result.order,null);
  assert.match(result.error,/reconciliation/);
  assert.equal(snapshot(),before);
});
test("valid fractional monetary additions stay cent-exact and journal-ready",()=>{
  reset(.1);
  const result=orders.addOrderExpense("expense-order","Required supplies",.2,"purchase-1");
  assert.ok(result.order);
  assert.equal(result.order.orderExpensesTotal,.3);
  assert.equal(result.order.expenses[0].amount,.2);
  assert.equal(result.order.expenses[0].id,"purchase-1");
  assert.equal(orders.addOrderExpense("expense-order","Duplicate",.5,"purchase-1").order,null);
  assert.equal(orders.getOrder("expense-order").orderExpensesTotal,.3);
  assert.ok(outbox.exportOutbox().some(e=>e.aggregateType==="orders"));
});
