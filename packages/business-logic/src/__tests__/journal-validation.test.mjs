import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const accounting = require('../accounting-store.ts'), permissions = require('../permissions.ts'), outbox = require('../outbox-bridge.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;
const cash = chart.find(a => a.systemKey === 'cash').id, expense = chart.find(a => a.systemKey === 'general_expenses').id;
const input = () => ({ entryDate: '2026-09-20', description: 'Manual adjustment', lines: [{ accountId: expense, debit: 100 }, { accountId: cash, credit: 100 }] });
const snapshot = () => JSON.stringify({ accounting: accounting.exportAccountingState(), outbox: outbox.exportOutbox() });
const reset = () => { accounting.hydrateAccountingState({ accounts: chart, journals: [], journalSequence: 0 }); outbox.hydrateOutbox([]); };
reset(); const before = snapshot();
for (const amount of [NaN, Infinity, -Infinity, -1, 1e30]) {
  for (const side of ['debit', 'credit']) {
    const bad = input(); bad.lines[0][side] = amount;
    assert(accounting.createJournalEntry(bad).errors.length); assert.equal(snapshot(), before);
  }
}
for (const entryDate of ['', 'invalid', '2026-02-30', '2026-13-01', '2026-09-20T00:00:00Z']) {
  assert(accounting.createJournalEntry({ ...input(), entryDate }).errors.length); assert.equal(snapshot(), before);
}
assert(accounting.createJournalEntry({ ...input(), lines: [] }).errors.length); assert.equal(snapshot(), before);
const huge = 5e13;
assert(accounting.createJournalEntry({ ...input(), lines: [{ accountId: expense, debit: huge }, { accountId: expense, debit: huge }, { accountId: cash, credit: huge }] }).errors.length); assert.equal(snapshot(), before);
// Unbalanced drafts remain useful, but cannot change reports by being posted.
const unbalanced = accounting.createJournalEntry({ ...input(), lines: [{ accountId: expense, debit: 100 }, { accountId: cash, credit: 90 }] }).journalEntry;
const draftBefore = snapshot(); assert(accounting.postJournalEntry(unbalanced.id).errors.length); assert.equal(snapshot(), draftBefore); assert.equal(accounting.buildTrialBalance().length, 0);
reset(); const custom = accounting.createAccount({ code: '6100', name: 'Review expense', type: 'expense' }).account;
const draft = accounting.createJournalEntry({ ...input(), lines: [{ accountId: custom.id, debit: 100 }, { accountId: cash, credit: 100 }] }).journalEntry;
accounting.setAccountActive(custom.id, false); const disabled = snapshot();
assert(accounting.postJournalEntry(draft.id).errors.includes('Active account not found')); assert.equal(snapshot(), disabled);
accounting.setAccountActive(custom.id, true); assert.deepEqual(accounting.postJournalEntry(draft.id).errors, []);
assert.equal(accounting.buildProfitAndLoss().netProfit, -100); assert(accounting.buildBalanceSheet().balanced);
const posted = snapshot(); assert(accounting.postJournalEntry(draft.id).errors.length); assert.equal(snapshot(), posted);
// Restored drafts must be checked again, including stored totals, dates and raw values.
for (const patch of [{ entryDate: '2026-02-30' }, { totalDebit: 99 }, { description: ' ' }, { lines: [{ accountId: expense, debit: Infinity, credit: 0 }, { accountId: cash, debit: 0, credit: Infinity }] }, { lines: [{ accountId: expense, debit: 100.001, credit: 0 }, { accountId: cash, debit: 0, credit: 100.001 }] }]) {
  reset(); const d = accounting.createJournalEntry(input()).journalEntry;
  accounting.hydrateAccountingState({ journals: [{ ...d, ...patch }] }); const corrupt = snapshot();
  assert(accounting.postJournalEntry(d.id).errors.length); assert.equal(snapshot(), corrupt);
}
reset(); const cents = accounting.createJournalEntry({ ...input(), lines: [{ accountId: expense, debit: .1 }, { accountId: expense, debit: .2 }, { accountId: cash, credit: .3 }] }).journalEntry;
assert.deepEqual(accounting.postJournalEntry(cents.id).errors, []); assert.equal(accounting.buildProfitAndLoss().netProfit, -.3);
permissions.setCurrentRole('cashier'); assert.throws(() => accounting.createJournalEntry(input()), /denied/i); assert.throws(() => accounting.postJournalEntry(cents.id), /denied/i); permissions.setCurrentRole('admin');
console.log('Manual journal validation: nonfinite/negative/overflow amounts, dates, inactive accounts, restored corruption, no mutation on rejection, cents and permissions PASS');
