import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const phase5=require("../phase5-store.ts"), orders=require("../orders-store.ts"), accounting=require("../accounting-store.ts"), outbox=require("../outbox-bridge.ts"), permissions=require("../permissions.ts");
permissions.setCurrentRole("admin"); permissions.setRuntimeFeaturePolicy(null);
const chart=accounting.exportAccountingState().accounts;
function reset(){
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  orders.hydrateOrders({orders:[],measurements:[]});
  phase5.hydratePhase5({suppliers:[],laundryOrders:[],expenses:[],purchases:[]});
  outbox.hydrateOutbox([]);
}
const snap=()=>JSON.stringify({expenses:phase5.listExpenses(),orders:orders.listOrders(),accounting:accounting.exportAccountingState(),outbox:outbox.exportOutbox()});

reset();
let created=phase5.createExpense({date:"2026-09-21",categoryId:"ec-9",amount:50,paymentMethod:"cash",description:"Reverse me"});
assert.equal(created.errors.length,0); assert(created.expense);
assert.equal(accounting.buildProfitAndLoss().netProfit,-50);
const original=accounting.listJournalEntries().find(j=>j.referenceType==="expense"&&j.referenceId===created.expense.id); assert(original);
outbox.hydrateOutbox([]);
let missingReason=phase5.reverseExpense(created.expense.id,"");
assert.equal(missingReason.expense,null); assert.match(missingReason.errors.join(";"),/reason is required/i);
let reversed=phase5.reverseExpense(created.expense.id,"Correction required");
assert.equal(reversed.errors.length,0); assert(reversed.expense?.deletedAt);
assert.equal(phase5.listExpenses().length,0);
assert.equal(accounting.buildProfitAndLoss().netProfit,0); assert(accounting.buildBalanceSheet().balanced);
const refs=accounting.listJournalEntries().filter(j=>j.referenceId===created.expense.id);
assert.equal(refs.length,2); assert(refs.some(j=>j.referenceType==="expense")); assert(refs.some(j=>j.referenceType==="auto_expense_reverse"));
for(const j of refs) assert(accounting.voidJournalEntry(j.id).errors.length);
for(const type of ["expenses","accounts","journal_entries","journal_entry_lines"]) assert(outbox.listPendingOutbox().some(e=>e.aggregateType===type),type);
const afterFirst=snap();
reversed=phase5.reverseExpense(created.expense.id,"Correction required");
assert.equal(reversed.expense,null); assert.match(reversed.errors.join(";"),/not found/i); assert.equal(snap(),afterFirst);

reset();
orders.hydrateOrders({orders:[{id:"o1",orderNumber:"ORD-1",expenses:[],orderExpensesTotal:0,updatedAt:"2026-09-21",version:1}],measurements:[]});
created=phase5.createExpense({date:"2026-09-21",categoryId:"ec-9",amount:25,paymentMethod:"upi",description:"Linked expense",orderId:"o1"});
assert.equal(created.errors.length,0); assert(created.expense);
assert.equal(orders.getOrder("o1").orderExpensesTotal,25); assert.equal(orders.getOrder("o1").expenses[0].id,created.expense.id);
outbox.hydrateOutbox([]);
reversed=phase5.reverseExpense(created.expense.id,"Correction required");
assert.equal(reversed.errors.length,0); assert.equal(orders.getOrder("o1").orderExpensesTotal,0); assert.equal(orders.getOrder("o1").expenses.length,0);
assert(outbox.listPendingOutbox().some(e=>e.aggregateType==="orders"&&e.aggregateId==="o1"&&e.eventType==="update"));

reset();
orders.hydrateOrders({orders:[{id:"o2",orderNumber:"ORD-2",expenses:[],orderExpensesTotal:0,updatedAt:"2026-09-21",version:1}],measurements:[]});
created=phase5.createExpense({date:"2026-09-21",categoryId:"ec-9",amount:20,paymentMethod:"bank",description:"Legacy linked",orderId:"o2"});
assert(created.expense);
orders.getOrder("o2").expenses[0].id="legacy-unlinked-line";
const ambiguous=snap();
reversed=phase5.reverseExpense(created.expense.id,"Correction required");
assert.equal(reversed.expense,null); assert.match(reversed.errors.join(";"),/source reconciliation/i); assert.equal(snap(),ambiguous);

reset();
created=phase5.createExpense({date:"2026-09-21",categoryId:"ec-9",amount:15,paymentMethod:"cash",description:"Missing journal"});
assert(created.expense);
accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
const missing=snap();
reversed=phase5.reverseExpense(created.expense.id,"Correction required");
assert.equal(reversed.expense,null); assert.match(reversed.errors.join(";"),/accounting reconciliation/i); assert.equal(snap(),missing);

reset();
created=phase5.createExpense({date:"2026-09-21",categoryId:"ec-9",amount:10,paymentMethod:"cash",description:"Permission"});
assert(created.expense);
permissions.setCurrentRole("cashier");
assert.throws(()=>phase5.reverseExpense(created.expense.id,"Correction required"),/denied|permission/i);
permissions.setCurrentRole("admin");

console.log("Expense reversal: exact inverse, source soft-delete, linked-order rollback, ambiguous/history guards, permissions and outbox PASS");
