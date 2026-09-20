import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const opening = require('../opening-balances.ts'), suppliers = require('../phase5-store.ts'), accounting = require('../accounting-store.ts'), outbox = require('../outbox-bridge.ts'), permissions = require('../permissions.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;
function reset(accounts = chart, outstandingBalance = 0) {
  accounting.hydrateAccountingState({ accounts, journals: [], journalSequence: 0 });
  suppliers.hydratePhase5({ suppliers: [{ id:'s', name:'Opening Supplier', openingBalance:0, outstandingBalance, createdAt:'2026-01-01', updatedAt:'2026-01-01' }], purchases:[] });
  outbox.hydrateOutbox([]);
}
const balance = key => { const a = accounting.getSystemAccount(key); const row = accounting.buildTrialBalance().find(r => r.accountId === a?.id); return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0))*100)/100; };
const snapshot = () => JSON.stringify({ supplier: suppliers.getSupplier('s'), accounting: accounting.exportAccountingState(), outbox: outbox.exportOutbox() });

reset(); assert.deepEqual(opening.setOpeningSupplierBalance('s', 300.75), { ok:true });
assert.equal(suppliers.getSupplier('s').outstandingBalance, 300.75); assert.equal(balance('accounts_payable'), -300.75); assert.equal(balance('opening_balance_equity'), 300.75); assert(accounting.buildBalanceSheet().balanced);
const firstCount = accounting.listJournalEntries().length; assert.deepEqual(opening.setOpeningSupplierBalance('s', 300.75), { ok:true }); assert.equal(accounting.listJournalEntries().length, firstCount);

assert.deepEqual(opening.setOpeningSupplierBalance('s', 125.25), { ok:true });
assert.equal(suppliers.getSupplier('s').outstandingBalance, 125.25); assert.equal(balance('accounts_payable'), -125.25); assert.equal(balance('opening_balance_equity'), 125.25); assert(accounting.buildBalanceSheet().balanced);
const refs = accounting.listJournalEntries().filter(j => j.referenceType === 'auto_opening_supplier'); assert.equal(refs.length, 2); for (const j of refs) assert(accounting.voidJournalEntry(j.id).errors.length);

reset(); const before = snapshot();
for (const amount of [NaN, Infinity, -Infinity, -1, 1e30]) { assert(opening.setOpeningSupplierBalance('s', amount).error); assert.equal(snapshot(), before); }
assert(opening.setOpeningSupplierBalance('missing', 10).error); assert.equal(snapshot(), before);

reset(chart, NaN); const corrupt = snapshot(); assert(opening.setOpeningSupplierBalance('s', 10).error); assert.equal(snapshot(), corrupt);
reset(chart.map(a => a.systemKey === 'accounts_payable' ? { ...a, isActive:false } : a));
const blockedAp = snapshot(); assert(opening.setOpeningSupplierBalance('s', 10).error); assert.equal(snapshot(), blockedAp);
reset(chart.map(a => a.systemKey === 'opening_balance_equity' ? { ...a, isActive:false } : a));
const blockedEquity = snapshot(); assert(opening.setOpeningSupplierBalance('s', 10).error); assert.equal(snapshot(), blockedEquity);

reset(); permissions.setCurrentRole('cashier'); assert.throws(() => opening.setOpeningSupplierBalance('s', 10), /denied/i); permissions.setCurrentRole('admin');
reset(); assert.deepEqual(opening.setOpeningSupplierBalance('s', 10), { ok:true });
for (const type of ['suppliers','accounts','journal_entries','journal_entry_lines']) assert(outbox.listPendingOutbox().some(e => e.aggregateType === type), type);
console.log('Opening supplier accounting: AP/equity delta, reduction, idempotent same value, validation, account guards, permissions and outbox PASS');
