import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const store = require('../store.ts'), suppliers = require('../phase5-store.ts'), returns = require('../purchase-returns.ts');
const accounting = require('../accounting-store.ts'), adapter = require('../procurement-accounting.ts'), outbox = require('../outbox-bridge.ts'), permissions = require('../permissions.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;
function reset(outstanding = 0) {
  accounting.hydrateAccountingState({ accounts: chart, journals: [], journalSequence: 0 });
  suppliers.hydratePhase5({ suppliers: [{ id: 's', name: 'Supplier', outstandingBalance: outstanding }], purchases: [] });
  store.hydrateCore({ products: [{ id: 'p', name: 'Fabric', costPrice: 20, stockQuantity: 5, version: 1 }], payments: [] });
  returns.hydratePurchaseReturns({ returns: [] }); outbox.hydrateOutbox([]);
}
const balance = key => { const a = accounting.getSystemAccount(key); const row = accounting.buildTrialBalance().find(r => r.accountId === a?.id); return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0))*100)/100; };
const snapshot = () => JSON.stringify({ supplier: suppliers.getSupplier('s'), product: store.getProduct('p'), returns: returns.exportPurchaseReturnsState(), accounting: accounting.exportAccountingState(), outbox: outbox.exportOutbox() });

reset();
const purchase = suppliers.createPurchase({ supplierId: 's', description: 'Fabric batch', amount: 100, paidAmount: 0, paymentMethod: 'bank', kind: 'general', date: '2026-09-20' }).purchase;
assert.equal(balance('accounts_payable'), -100);
const result = returns.createPurchaseReturn({ supplierId: 's', purchaseId: purchase.id, productId: 'p', quantity: 1, amount: 20, reason: 'Damaged roll' });
assert.equal(result.error, undefined); assert(result.record);
assert.equal(store.getProduct('p').stockQuantity, 4); assert.equal(suppliers.getSupplier('s').outstandingBalance, 80);
assert.equal(balance('accounts_payable'), -80); assert.equal(balance('purchase_returns_pending'), -20); assert.equal(balance('legacy_settlement_clearing'), 0);
assert.equal(accounting.buildProfitAndLoss().netProfit, 0); assert(accounting.buildBalanceSheet().balanced);
const count = accounting.listJournalEntries().length; const replay = adapter.planPurchaseReturnPosting({ ...result.record, branchId: null }); assert.deepEqual(replay.errors, []); replay.commit(); replay.commit(); assert.equal(accounting.listJournalEntries().length, count);
assert(accounting.voidJournalEntry(accounting.listJournalEntries().find(j => j.referenceType === 'auto_purchase_return').id).errors.length);

reset(50);
const legacy = returns.createPurchaseReturn({ supplierId: 's', productId: 'p', quantity: .5, amount: 10 });
assert.equal(legacy.error, undefined); assert.equal(suppliers.getSupplier('s').outstandingBalance, 40); assert.equal(store.getProduct('p').stockQuantity, 4.5);
assert.equal(balance('accounts_payable'), 0); assert.equal(balance('legacy_settlement_clearing'), 10); assert.equal(balance('purchase_returns_pending'), -10); assert(accounting.buildBalanceSheet().balanced);

reset(50); const before = snapshot();
for (const input of [
  { supplierId:'s', productId:'p', quantity:NaN, amount:10 },
  { supplierId:'s', productId:'p', quantity:Infinity, amount:10 },
  { supplierId:'s', productId:'p', quantity:0, amount:10 },
  { supplierId:'s', productId:'p', quantity:6, amount:10 },
  { supplierId:'s', productId:'p', quantity:1, amount:NaN },
  { supplierId:'s', productId:'p', quantity:1, amount:0 },
  { supplierId:'s', productId:'p', quantity:1, amount:51 },
  { supplierId:'missing', productId:'p', quantity:1, amount:10 },
  { supplierId:'s', productId:'missing', quantity:1, amount:10 },
]) {
  assert(returns.createPurchaseReturn(input).error, JSON.stringify(input)); assert.equal(snapshot(), before);
}
suppliers.hydratePhase5({ suppliers: [{ id:'s', name:'Supplier', outstandingBalance:50 }, { id:'other', name:'Other', outstandingBalance:50 }], purchases: [{ id:'foreign', purchaseNumber:'PUR-X', supplierId:'other', amount:50, paidAmount:0, balanceAmount:50, date:'2026-09-20' }] });
const mismatch = snapshot(); assert(returns.createPurchaseReturn({ supplierId:'s', purchaseId:'foreign', productId:'p', quantity:1, amount:10 }).error); assert.equal(snapshot(), mismatch);

reset(50);
accounting.hydrateAccountingState({ accounts: chart.map(a => a.systemKey === 'purchase_returns_pending' ? { ...a, isActive: false } : a), journals: [], journalSequence: 0 });
const blocked = snapshot(); assert(returns.createPurchaseReturn({ supplierId:'s', productId:'p', quantity:1, amount:10 }).error); assert.equal(snapshot(), blocked);

reset(50); permissions.setCurrentRole('cashier'); assert.throws(() => returns.createPurchaseReturn({ supplierId:'s', productId:'p', quantity:1, amount:10 }), /denied/i); permissions.setCurrentRole('admin');
reset(50); returns.hydratePurchaseReturns({ returns: [{ id:'old-return', supplierId:'s', productId:'p', quantity:1, amount:10, createdAt:'2026-01-01T00:00:00.000Z' }] }); assert.equal(accounting.listJournalEntries().length, 0);
reset(50); const queued = returns.createPurchaseReturn({ supplierId:'s', productId:'p', quantity:1, amount:10 }); assert.equal(queued.error, undefined);
for (const type of ['purchase_returns','suppliers','accounts','journal_entries','journal_entry_lines']) assert(outbox.listPendingOutbox().some(e => e.aggregateType === type), type);
console.log('Purchase return accounting: source AP, legacy clearing, pending review, validation, no mutation, replay, permissions, restore and outbox PASS');
