import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const store = require('../store.ts'), suppliers = require('../phase5-store.ts'), procurement = require('../procurement-store.ts');
const accounting = require('../accounting-store.ts'), adapter = require('../procurement-accounting.ts'), outbox = require('../outbox-bridge.ts'), remote = require('../remote-write.ts'), permissions = require('../permissions.ts');
const orders = require('../orders-store.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;
function reset() {
  accounting.hydrateAccountingState({ accounts: chart, journals: [], journalSequence: 0 });
  suppliers.hydratePhase5({ suppliers: [{ id: 's', name: 'Supplier', outstandingBalance: 0 }], purchases: [] });
  store.hydrateCore({ products: [{ id: 'p', name: 'Fabric', stockQuantity: 5 }], payments: [] });
  procurement.hydrateProcurementState({ purchaseInvoices: [] });
  orders.hydrateOrders({ orders: [{ id: 'o', orderNumber: 'ORD-1', expenses: [], orderExpensesTotal: 0, version: 1 }] });
  outbox.hydrateOutbox([]);
}
const buy = (extra = {}) => suppliers.createPurchase({ description: 'Fabric supplies', supplierId: 's', amount: 500, paidAmount: 200, paymentMethod: 'cash', kind: 'general', date: '2026-09-20', ...extra });
const balance = key => { const a = accounting.getSystemAccount(key); const row = accounting.buildTrialBalance().find(r => r.accountId === a?.id); return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0))*100)/100; };
const snapshot = () => JSON.stringify({ suppliers: suppliers.listSuppliers(), purchases: suppliers.listPurchases(), order: orders.getOrder('o'), accounting: accounting.exportAccountingState(), outbox: outbox.exportOutbox() });
reset(); const p = buy(); assert.deepEqual(p.errors, []);
assert.equal(balance('unclassified_purchases'), 500); assert.equal(balance('cash'), -200); assert.equal(balance('accounts_payable'), -300);
assert.equal(suppliers.getSupplier('s').outstandingBalance, 300); assert.equal(store.getProduct('p').stockQuantity, 5);
assert.equal(balance('inventory_asset'), 0); assert.equal(balance('input_tax'), 0); assert.equal(accounting.buildProfitAndLoss().netProfit, 0); assert(accounting.buildBalanceSheet().balanced);
const plan = adapter.planDirectPurchasePosting(p.purchase); assert.deepEqual(plan.errors, []); plan.commit(); plan.commit(); assert.equal(accounting.listJournalEntries().length, 1);
assert(accounting.voidJournalEntry(accounting.listJournalEntries()[0].id).errors.length);
assert.deepEqual(suppliers.recordSupplierPayment({ supplierId: 's', amount: 100, paymentMethod: 'bank' }).errors, []);
assert.equal(balance('accounts_payable'), -200); assert.equal(balance('bank'), -100);
accounting.hydrateAccountingState(JSON.parse(JSON.stringify(accounting.exportAccountingState())));
suppliers.hydratePhase5(JSON.parse(JSON.stringify({ suppliers: suppliers.listSuppliers(), purchases: suppliers.listPurchases() })));
assert.deepEqual(suppliers.recordSupplierPayment({ supplierId: 's', amount: 999, paymentMethod: 'upi' }).errors, []);
assert.equal(balance('accounts_payable'), 0); assert.equal(balance('payment_clearing'), -200); assert.equal(balance('legacy_settlement_clearing'), 0);
assert.equal(suppliers.listPurchases()[0].balanceAmount, 0); assert.equal(suppliers.getSupplier('s').outstandingBalance, 0); assert(accounting.buildBalanceSheet().balanced);
reset(); assert.deepEqual(buy({ supplierId: null, paidAmount: 999, paymentMethod: 'bank' }).errors, []); assert.equal(balance('bank'), -500); assert.equal(balance('accounts_payable'), 0);
reset(); assert.deepEqual(buy({ amount: 1.01, paidAmount: .34, paymentMethod: 'card', kind: 'order_specific', orderId: 'o' }).errors, []);
assert.equal(balance('accounts_payable'), -.67); assert.equal(balance('payment_clearing'), -.34); assert.equal(orders.getOrder('o').orderExpensesTotal, 1.01); assert.equal(orders.getOrder('o').expenses.length, 1);
reset(); const before = snapshot();
for (const extra of [{ amount: NaN }, { amount: Infinity }, { amount: 1e30 }, { amount: 0 }, { paidAmount: NaN }, { paidAmount: -1 }, { date: '2026-02-30' }, { paymentMethod: 'bad' }, { supplierId: 'missing' }, { supplierId: null }, { orderId: 'missing' }, { kind: 'order_specific' }, { description: ' ' }]) {
  assert(buy(extra).errors.length, JSON.stringify(extra)); assert.equal(snapshot(), before);
}
accounting.hydrateAccountingState({ accounts: chart.map(a => a.systemKey === 'accounts_payable' ? { ...a, isActive: false } : a) });
const blocked = snapshot(); assert(buy({ orderId: 'o' }).errors.length); assert.equal(snapshot(), blocked);
permissions.setCurrentRole('cashier'); assert.throws(() => buy(), /denied/i); permissions.setCurrentRole('admin');
reset(); suppliers.hydratePhase5({ suppliers: [{ id: 's', name: 'Supplier', outstandingBalance: 30 }], purchases: [{ id: 'old', purchaseNumber: 'OLD', supplierId: 's', amount: 30, paidAmount: 0, balanceAmount: 30, date: '2026-01-01' }] });
assert.deepEqual(suppliers.recordSupplierPayment({ supplierId: 's', amount: 30, paymentMethod: 'cash' }).errors, []);
assert.equal(balance('accounts_payable'), 0); assert.equal(balance('legacy_settlement_clearing'), 30);
// Snapshot ordering: slow purchase insert must finish before a subsequent settlement.
await new Promise(resolve => setImmediate(resolve)); reset();
let release; const gate = new Promise(resolve => { release = resolve; }); const writes = [];
remote.registerRemoteWriter({ createPurchase: async p => { writes.push(['create', p.paidAmount]); await gate; }, upsertSupplier: async s => writes.push(['supplier', s.outstandingBalance]), createPayment: async p => writes.push(['payment', p.amount]), updatePurchaseSettlement: async p => writes.push(['settle', p.paidAmount]) });
buy(); suppliers.recordSupplierPayment({ supplierId: 's', amount: 300, paymentMethod: 'cash' });
await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(writes, [['create', 200]]);
release(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(writes, [['create', 200], ['supplier', 300], ['payment', 300], ['settle', 500], ['supplier', 0]]);
remote.registerRemoteWriter(null); reset(); const warn = console.warn; console.warn = () => {};
remote.registerRemoteWriter({ createPurchase: async () => { throw Error('offline'); }, upsertAccountingAccount: async () => { throw Error('offline'); } });
try { assert.deepEqual(buy().errors, []); await new Promise(resolve => setImmediate(resolve)); for (const type of ['purchases', 'suppliers', 'accounts', 'journal_entries', 'journal_entry_lines']) assert(outbox.listPendingOutbox().some(e => e.aggregateType === type)); }
finally { console.warn = warn; remote.registerRemoteWriter(null); }
console.log('Direct purchase accounting: partial/full settlement, order cost, invalid input, restore, replay, legacy, immutable source, ordered remote snapshots and offline PASS');
