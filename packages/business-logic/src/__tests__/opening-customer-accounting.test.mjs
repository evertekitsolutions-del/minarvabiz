import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const opening = require('../opening-balances.ts'), store = require('../store.ts'), accounting = require('../accounting-store.ts'), outbox = require('../outbox-bridge.ts'), permissions = require('../permissions.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;
function reset(accounts = chart, outstandingBalance = 0) {
  accounting.hydrateAccountingState({ accounts, journals: [], journalSequence: 0 });
  store.hydrateCore({ customers: [{ id:'c', name:'Opening Customer', outstandingBalance, totalSpending:0, createdAt:'2026-01-01', updatedAt:'2026-01-01' }], products:[], sales:[], payments:[] });
  outbox.hydrateOutbox([]);
}
const balance = key => { const a = accounting.getSystemAccount(key); const row = accounting.buildTrialBalance().find(r => r.accountId === a?.id); return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0))*100)/100; };
const snapshot = () => JSON.stringify({ customer: store.getCustomer('c'), accounting: accounting.exportAccountingState(), outbox: outbox.exportOutbox() });

reset(); assert.deepEqual(opening.setOpeningCustomerBalance('c', 250.55), { ok:true });
assert.equal(store.getCustomer('c').outstandingBalance, 250.55); assert.equal(balance('accounts_receivable'), 250.55); assert.equal(balance('opening_balance_equity'), -250.55); assert(accounting.buildBalanceSheet().balanced);
const firstCount = accounting.listJournalEntries().length; assert.deepEqual(opening.setOpeningCustomerBalance('c', 250.55), { ok:true }); assert.equal(accounting.listJournalEntries().length, firstCount);

assert.deepEqual(opening.setOpeningCustomerBalance('c', 100.25), { ok:true });
assert.equal(store.getCustomer('c').outstandingBalance, 100.25); assert.equal(balance('accounts_receivable'), 100.25); assert.equal(balance('opening_balance_equity'), -100.25); assert(accounting.buildBalanceSheet().balanced);
const refs = accounting.listJournalEntries().filter(j => j.referenceType === 'auto_opening_customer'); assert.equal(refs.length, 2); for (const j of refs) assert(accounting.voidJournalEntry(j.id).errors.length);

reset(); const before = snapshot();
for (const amount of [NaN, Infinity, -Infinity, -1, 1e30]) { assert(opening.setOpeningCustomerBalance('c', amount).error); assert.equal(snapshot(), before); }
assert(opening.setOpeningCustomerBalance('missing', 10).error); assert.equal(snapshot(), before);

reset(chart, NaN); const corrupt = snapshot(); assert(opening.setOpeningCustomerBalance('c', 10).error); assert.equal(snapshot(), corrupt);
reset(chart.map(a => a.systemKey === 'accounts_receivable' ? { ...a, isActive:false } : a));
const blockedAr = snapshot(); assert(opening.setOpeningCustomerBalance('c', 10).error); assert.equal(snapshot(), blockedAr);
reset(chart.map(a => a.systemKey === 'opening_balance_equity' ? { ...a, isActive:false } : a));
const blockedEquity = snapshot(); assert(opening.setOpeningCustomerBalance('c', 10).error); assert.equal(snapshot(), blockedEquity);

reset(); permissions.setCurrentRole('cashier'); assert.throws(() => opening.setOpeningCustomerBalance('c', 10), /denied/i); permissions.setCurrentRole('admin');
reset(); assert.deepEqual(opening.setOpeningCustomerBalance('c', 10), { ok:true });
for (const type of ['customers','accounts','journal_entries','journal_entry_lines']) assert(outbox.listPendingOutbox().some(e => e.aggregateType === type), type);
console.log('Opening customer accounting: AR/equity delta, reduction, idempotent same value, validation, account guards, permissions and outbox PASS');
