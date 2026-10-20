import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (m, file) => m._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file
);
const expenses = require("../phase5-store.ts");
const orders = require("../orders-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const accounts = structuredClone(accounting.exportAccountingState().accounts);
function reset(total = 0) {
  accounting.hydrateAccountingState({accounts:structuredClone(accounts),journals:[],journalSequence:0});
  orders.hydrateOrders({orders:[{id:"o",orderNumber:"ORD-1",expenses:[],orderExpensesTotal:total,version:1}]});
  expenses.hydratePhase5({ suppliers:[], purchases:[], laundryOrders:[], expenses:[],
    expenseCategories:[{id:"ec-9",name:"Other",isSystem:true,createdAt:"2026-01-01"}]});
  outbox.hydrateOutbox([]);
}
const create=()=>expenses.createExpense({date:"2026-09-20",categoryId:"ec-9",amount:25.25,
  paymentMethod:"cash",description:"Service supplies",orderId:"o"});
function snapshot() {
  return JSON.stringify({expenses:expenses.listExpenses(),order:orders.getOrder("o"),
    accounting:accounting.exportAccountingState(),outbox:outbox.exportOutbox()});
}
test("null expense reversal receipt keeps source, linked cost and ledgers unchanged",()=>{
  reset();
  const e=create().expense; assert.ok(e);
  const before=snapshot();
  const original=accounting.planExpenseReversal;
  try {
    accounting.planExpenseReversal=()=>({errors:[],commit:()=>null});
    const reversed=expenses.reverseExpense(e.id,"Invalid receipt");
    assert.equal(reversed.expense,null);
    assert.match(reversed.errors.join(" "),/reversal journal was not committed/i);
    assert.equal(snapshot(),before);
  } finally {accounting.planExpenseReversal=original;}
});
test("throwing reversal journal cannot remove linked source or order expense",()=>{
  reset();
  const e=create().expense; assert.ok(e);
  const before=snapshot();
  const original=accounting.planExpenseReversal;
  try {
    accounting.planExpenseReversal=()=>({errors:[],commit:()=>{throw Error("ledger offline")}});
    assert.throws(()=>expenses.reverseExpense(e.id,"Posting exception"),/ledger offline/);
    assert.equal(snapshot(),before);
  } finally {accounting.planExpenseReversal=original;}
});
test("unreconciled order amount blocks reversal journal before it is posted",()=>{
  reset();
  const e=create().expense; assert.ok(e);
  const order=orders.getOrder("o"); order.orderExpensesTotal=25.255;
  const before=snapshot();
  const original=accounting.planExpenseReversal;
  try {
    accounting.planExpenseReversal=()=>{throw Error("journal should not be planned")};
    const result=expenses.reverseExpense(e.id,"Order needs reconciliation");
    assert.equal(result.expense,null);
    assert.match(result.errors.join(" "),/reconciliation/i);
    assert.equal(snapshot(),before);
  } finally {accounting.planExpenseReversal=original;}
});
test("successful reversal restores exact cents and leaves balanced journals",()=>{
  reset();
  const e=create().expense; assert.ok(e);
  const reversed=expenses.reverseExpense(e.id,"Correction required");
  assert.deepEqual(reversed.errors,[]);
  assert.ok(reversed.expense.deletedAt);
  assert.equal(orders.getOrder("o").orderExpensesTotal,0);
  assert.equal(orders.getOrder("o").expenses.length,0);
  assert.equal(accounting.listJournalEntries().length,2);
  assert.equal(accounting.buildBalanceSheet().balanced,true);
});
test("order removal rejects unsupported expected/item amounts and preserves outbox",()=>{
  for(const invalid of [.201,1.005,NaN,Infinity,-.2]){
    reset();
    assert.ok(orders.addOrderExpense("o","Cost",.2,"ref-1").order);
    const before=snapshot();
    const result=orders.removeOrderExpense("o","ref-1",invalid);
    assert.equal(result.order,null,String(invalid));
    assert.match(result.error,/reconciliation/i);
    assert.equal(snapshot(),before);
  }
  reset();
  assert.ok(orders.addOrderExpense("o","Cost",.2,"ref-1").order);
  const before=snapshot();
  assert.equal(orders.preflightOrderExpenseRemoval("o","ref-1",.2).nextCents,0);
  assert.equal(snapshot(),before);
  assert.ok(orders.removeOrderExpense("o","ref-1",.2).order);
  assert.equal(orders.getOrder("o").orderExpensesTotal,0);
});
