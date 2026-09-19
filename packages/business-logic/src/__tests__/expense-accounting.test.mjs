import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
// Execute the actual shared stores, not a duplicate of their business rules.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const accounting = require('../accounting-store.ts');
const expenses = require('../phase5-store.ts');
const permissions = require('../permissions.ts');
const outbox = require('../outbox-bridge.ts');
const remote = require('../remote-write.ts');
const orders = require('../orders-store.ts');
permissions.setCurrentRole('admin');
permissions.setRuntimeFeaturePolicy(null);
const input = { date: '2026-09-19', categoryId: 'ec-9', amount: 50, paymentMethod: 'cash', description: 'Posting test' };
const count = () => accounting.listJournalEntries().length;
const find = (expense) => accounting.listJournalEntries().find((entry) => entry.referenceType === 'expense' && entry.referenceId === expense.id);
const initialCount = count();
const cash = expenses.createExpense(input);
assert.deepEqual(cash.errors, []);
const entry = find(cash.expense);
assert.equal(count(), initialCount + 1);
assert.equal(entry.status, 'posted');
assert.equal(entry.totalDebit, 50);
assert.equal(entry.totalCredit, 50);
assert.equal(entry.lines[0].accountId, accounting.getSystemAccount('general_expenses').id);
assert.equal(entry.lines[1].accountId, accounting.getSystemAccount('cash').id);
assert.equal(accounting.buildProfitAndLoss().netProfit, -50);
assert.equal(accounting.buildBalanceSheet().balanced, true);
const events = outbox.exportOutbox().length;
assert.equal(accounting.postExpenseJournal(cash.expense).journalEntry.id, entry.id);
assert.equal(count(), initialCount + 1);
assert.equal(outbox.exportOutbox().length, events);
assert(accounting.postExpenseJournal({ ...cash.expense, amount: 51 }).errors.length);
assert(accounting.voidJournalEntry(entry.id).errors.length);
assert.equal(accounting.getJournalEntry(entry.id).status, 'posted');
for (const [method, key] of [['bank', 'bank'], ['card', 'payment_clearing'], ['upi', 'payment_clearing'], ['online', 'payment_clearing'], ['other', 'payment_clearing']]) {
  const created = expenses.createExpense({ ...input, paymentMethod: method });
  assert.deepEqual(created.errors, []);
  assert.equal(find(created.expense).lines[1].accountId, accounting.getSystemAccount(key).id);
}
const beforeInvalid = { journals: count(), expenses: expenses.listExpenses().length, events: outbox.exportOutbox().length };
for (const patch of [{ amount: NaN }, { amount: Infinity }, { amount: -1 }, { amount: 0.001 }, { amount: 1e30 }, { date: '2026-02-30' }, { paymentMethod: 'invalid' }, { orderId: 'missing' }]) {
  assert(expenses.createExpense({ ...input, ...patch }).errors.length);
}
assert.deepEqual({ journals: count(), expenses: expenses.listExpenses().length, events: outbox.exportOutbox().length }, beforeInvalid);
permissions.setCurrentRole('cashier');
assert.throws(() => expenses.createExpense(input), /denied|permission/i);
assert.equal(count(), beforeInvalid.journals);
permissions.setCurrentRole('admin');
// Report licensing must not stop an otherwise permitted expense workflow.
permissions.setRuntimeFeaturePolicy({ inventory: true, advancedReports: false });
assert.deepEqual(expenses.createExpense(input).errors, []);
permissions.setRuntimeFeaturePolicy(null);
orders.hydrateOrders({ orders: [{ id: 'order-test', orderNumber: 'ORD-TEST', expenses: [], orderExpensesTotal: 0, version: 1 }] });
const orderExpense = expenses.createExpense({ ...input, orderId: 'order-test', amount: 25 });
assert.deepEqual(orderExpense.errors, []);
assert.equal(find(orderExpense.expense).lines[0].accountId, accounting.getSystemAccount('order_expenses').id);
assert.equal(orders.getOrder('order-test').orderExpensesTotal, 25);
// Restore old chart without the new clearing account; first use adds it once.
const state = accounting.exportAccountingState();
accounting.hydrateAccountingState({ ...state, accounts: state.accounts.filter((a) => a.systemKey !== 'payment_clearing') });
assert.deepEqual(expenses.createExpense({ ...input, paymentMethod: 'card' }).errors, []);
assert.equal(accounting.listAccounts().filter((a) => a.systemKey === 'payment_clearing').length, 1);
accounting.hydrateAccountingState(state);
// Restoring accounting state preserves the source idempotency guard.
const saved = JSON.parse(JSON.stringify(accounting.exportAccountingState()));
accounting.hydrateAccountingState(saved);
assert.equal(accounting.postExpenseJournal(cash.expense).journalEntry.id, entry.id);
// All outbox records exist immediately, while online writes wait for dependencies.
await new Promise((resolve) => setImmediate(resolve));
const calls = [];
let release;
const gate = new Promise((resolve) => { release = resolve; });
remote.registerRemoteWriter({
  createExpense: async () => { calls.push('expense'); await gate; },
  upsertAccountingAccount: async () => { calls.push('account'); },
  upsertJournalEntry: async () => { calls.push('journal'); },
});
const online = expenses.createExpense(input);
const onlineEntry = find(online.expense);
assert.deepEqual(calls, ['expense']);
for (const type of ['expenses', 'accounts', 'journal_entries', 'journal_entry_lines']) assert(outbox.listPendingOutbox().some((event) => event.aggregateType === type));
assert(outbox.listPendingOutbox().some((event) => event.aggregateId === onlineEntry.id));
release();
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(calls, ['expense', 'account', 'account', 'journal']);
remote.registerRemoteWriter({ createExpense: async () => { throw new Error('simulated offline'); } });
const originalWarn = console.warn;
console.warn = () => {};
try {
  const offline = expenses.createExpense(input);
  assert.deepEqual(offline.errors, []);
  await new Promise((resolve) => setImmediate(resolve));
  assert(outbox.listPendingOutbox().some((event) => event.aggregateId === offline.expense.id));
  assert(outbox.listPendingOutbox().some((event) => event.aggregateId === find(offline.expense).id));
} finally { console.warn = originalWarn; remote.registerRemoteWriter(null); }
console.log('Expense accounting runtime: mappings, permissions, source integrity, idempotency, validation, order cost, restore, ordered online writes and offline outbox PASS');
