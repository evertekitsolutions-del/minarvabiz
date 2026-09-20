import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const opening = require('../opening-balances.ts'), store = require('../store.ts'), accounting = require('../accounting-store.ts'), outbox = require('../outbox-bridge.ts'), permissions = require('../permissions.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;
function product(stockQuantity = 2, costPrice = 12.5) { return { id:'p', name:'Opening Product', unit:'pcs', costPrice, sellingPrice:20, stockQuantity, minimumStock:0, isActive:true, createdAt:'2026-01-01', updatedAt:'2026-01-01', version:1 }; }
function reset(accounts = chart, stockQuantity = 2, costPrice = 12.5) {
  accounting.hydrateAccountingState({ accounts, journals: [], journalSequence: 0 });
  store.hydrateCore({ customers:[], products:[product(stockQuantity, costPrice)], sales:[], payments:[] });
  outbox.hydrateOutbox([]);
}
const balance = key => { const a = accounting.getSystemAccount(key); const row = accounting.buildTrialBalance().find(r => r.accountId === a?.id); return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0))*100)/100; };
const snapshot = () => JSON.stringify({ product: store.getProduct('p'), accounting: accounting.exportAccountingState(), outbox: outbox.exportOutbox() });

reset(); assert.deepEqual(opening.setOpeningStock('p', 5), { ok:true });
assert.equal(store.getProduct('p').stockQuantity, 5); assert.equal(balance('inventory_asset'), 37.5); assert.equal(balance('opening_balance_equity'), -37.5); assert(accounting.buildBalanceSheet().balanced);
const count = accounting.listJournalEntries().length; assert.deepEqual(opening.setOpeningStock('p', 5), { ok:true }); assert.equal(accounting.listJournalEntries().length, count);

assert.deepEqual(opening.setOpeningStock('p', 3), { ok:true });
assert.equal(store.getProduct('p').stockQuantity, 3); assert.equal(balance('inventory_asset'), 12.5); assert.equal(balance('opening_balance_equity'), -12.5); assert(accounting.buildBalanceSheet().balanced);
const refs = accounting.listJournalEntries().filter(j => j.referenceType === 'auto_opening_stock'); assert.equal(refs.length, 2); for (const j of refs) assert(accounting.voidJournalEntry(j.id).errors.length);

reset(chart, 1.25, 8.4); assert.deepEqual(opening.setOpeningStock('p', 2.5), { ok:true }); assert.equal(store.getProduct('p').stockQuantity, 2.5); assert.equal(balance('inventory_asset'), 10.5);
reset(chart, 1, 0); assert.deepEqual(opening.setOpeningStock('p', 2), { ok:true }); assert.equal(store.getProduct('p').stockQuantity, 2); assert.equal(accounting.listJournalEntries().length, 0);

reset(); const before = snapshot();
for (const qty of [NaN, Infinity, -Infinity, -1, 1e30]) { assert(opening.setOpeningStock('p', qty).error); assert.equal(snapshot(), before); }
assert(opening.setOpeningStock('missing', 2).error); assert.equal(snapshot(), before);

reset(chart, NaN, 10); const corruptStock = snapshot(); assert(opening.setOpeningStock('p', 2).error); assert.equal(snapshot(), corruptStock);
reset(chart, 1, NaN); const corruptCost = snapshot(); assert(opening.setOpeningStock('p', 2).error); assert.equal(snapshot(), corruptCost);
reset(chart.map(a => a.systemKey === 'inventory_asset' ? { ...a, isActive:false } : a));
const blockedInventory = snapshot(); assert(opening.setOpeningStock('p', 3).error); assert.equal(snapshot(), blockedInventory);
reset(chart.map(a => a.systemKey === 'opening_balance_equity' ? { ...a, isActive:false } : a));
const blockedEquity = snapshot(); assert(opening.setOpeningStock('p', 3).error); assert.equal(snapshot(), blockedEquity);

reset(); permissions.setCurrentRole('cashier'); assert.throws(() => opening.setOpeningStock('p', 3), /denied/i); permissions.setCurrentRole('admin');
reset(); assert.deepEqual(opening.setOpeningStock('p', 3), { ok:true });
for (const type of ['products','accounts','journal_entries','journal_entry_lines']) assert(outbox.listPendingOutbox().some(e => e.aggregateType === type), type);
console.log('Opening stock accounting: inventory/equity valuation, reduction, fractional/zero cost, validation, account guards, permissions and outbox PASS');
