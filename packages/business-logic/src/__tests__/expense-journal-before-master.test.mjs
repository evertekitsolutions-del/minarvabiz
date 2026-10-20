import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const expenses = require("../phase5-store.ts");
const accounting = require("../accounting-store.ts");
const outbox = require("../outbox-bridge.ts");
const permissions = require("../permissions.ts");
const remote = require("../remote-write.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const chart = structuredClone(accounting.exportAccountingState().accounts);
const input = { categoryId: "ec-9", amount: 45.50, date: "2026-09-19",
  paymentMethod: "cash", description: "Store supplies" };
function reset() {
  accounting.hydrateAccountingState({ accounts: structuredClone(chart), journals: [], journalSequence: 0 });
  expenses.hydratePhase5({ suppliers: [], purchases: [], expenses: [], laundryOrders: [] });
  outbox.hydrateOutbox([]);
}
function snapshot() {
  return JSON.stringify({ expenses: expenses.listExpenses(),
    accounting: accounting.exportAccountingState(), outbox: outbox.exportOutbox() });
}
test("expense journal rejects without publishing or queuing a record", () => {
  reset();
  const before = snapshot();
  const old = accounting.postExpenseJournal;
  try {
    accounting.postExpenseJournal = () => ({ journalEntry: null, errors: ["Blocked expense posting"] });
    assert.deepEqual(expenses.createExpense(input), {
      expense: null, errors: ["Blocked expense posting"],
    });
    assert.equal(snapshot(), before);
  } finally { accounting.postExpenseJournal = old; }
});
test("a missing journal receipt without errors still rejects creation", () => {
  reset();
  const before = snapshot();
  const old = accounting.postExpenseJournal;
  try {
    accounting.postExpenseJournal = () => ({ journalEntry: null, errors: [] });
    const failed = expenses.createExpense(input);
    assert.equal(failed.expense, null);
    assert.match(failed.errors.join(" "), /journal was not committed/);
    assert.equal(snapshot(), before);
  } finally { accounting.postExpenseJournal = old; }
});
test("thrown posting guard never leaks an orphan expense", () => {
  reset();
  const before = snapshot();
  const old = accounting.postExpenseJournal;
  try {
    accounting.postExpenseJournal = () => { throw new Error("journal unavailable"); };
    assert.throws(() => expenses.createExpense(input), /journal unavailable/);
    assert.equal(snapshot(), before);
  } finally { accounting.postExpenseJournal = old; }
});
test("successful journal still registers expense and balancing accounting", () => {
  reset();
  const result = expenses.createExpense(input);
  assert.deepEqual(result.errors, []);
  assert.ok(result.expense?.id);
  assert.equal(expenses.listExpenses().length, 1);
  const linked = accounting.listJournalEntries().find(
    entry => entry.referenceType === "expense" && entry.referenceId === result.expense.id,
  );
  assert.ok(linked);
  assert.equal(linked.totalDebit, 45.50);
  assert.equal(linked.totalCredit, 45.50);
  assert.equal(accounting.buildBalanceSheet().balanced, true);
});
