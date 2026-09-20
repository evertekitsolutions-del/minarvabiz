import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const opening = require('../opening-balances.ts'), cash = require('../cash-register.ts'), accounting = require('../accounting-store.ts'), outbox = require('../outbox-bridge.ts'), permissions = require('../permissions.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;
function reset(accounts = chart) {
  accounting.hydrateAccountingState({ accounts, journals: [], journalSequence: 0 });
  cash.hydrateCashRegister({ sessions: [] }); outbox.hydrateOutbox([]);
}
const balance = key => { const a = accounting.getSystemAccount(key); const row = accounting.buildTrialBalance().find(r => r.accountId === a?.id); return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0))*100)/100; };
const snapshot = () => JSON.stringify({ cash: cash.exportCashRegisterState(), accounting: accounting.exportAccountingState(), outbox: outbox.exportOutbox() });

reset(); assert.deepEqual(opening.setOpeningCash(250.55), { ok:true });
const session = cash.getOpenSession(); assert(session); assert.equal(session.openingCash, 250.55); assert.equal(session.expectedClosing, 250.55);
assert.equal(balance('cash'), 250.55); assert.equal(balance('opening_balance_equity'), -250.55); assert(accounting.buildBalanceSheet().balanced);
const journal = accounting.listJournalEntries().find(j => j.referenceType === 'auto_opening_cash'); assert(journal); assert.equal(journal.referenceId, 'opening-cash-' + new Date().toISOString().slice(0,10));
assert(accounting.voidJournalEntry(journal.id).errors.length);
const after = snapshot(); assert(opening.setOpeningCash(100).error); assert.equal(snapshot(), after);

reset(); const zero = opening.setOpeningCash(0); assert.deepEqual(zero, { ok:true }); assert(cash.getOpenSession()); assert.equal(accounting.listJournalEntries().length, 0);
reset(); const before = snapshot();
for (const amount of [NaN, Infinity, -Infinity, -1, 1e30]) { assert(opening.setOpeningCash(amount).error); assert.equal(snapshot(), before); }

reset(chart.map(a => a.systemKey === 'cash' ? { ...a, isActive:false } : a));
const blocked = snapshot(); assert(opening.setOpeningCash(10).error); assert.equal(snapshot(), blocked);
reset(chart.map(a => a.systemKey === 'opening_balance_equity' ? { ...a, isActive:false } : a));
const blockedEquity = snapshot(); assert(opening.setOpeningCash(10).error); assert.equal(snapshot(), blockedEquity);

reset(); permissions.setCurrentRole('cashier'); assert.throws(() => opening.setOpeningCash(10), /denied/i); permissions.setCurrentRole('admin');
reset(); opening.setOpeningCash(10); for (const type of ['accounts','journal_entries','journal_entry_lines']) assert(outbox.listPendingOutbox().some(e => e.aggregateType === type), type);
console.log('Opening cash accounting: cash/equity posting, zero handling, validation, no mutation, duplicate-day, permissions and outbox PASS');
