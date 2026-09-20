import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const store = require('../store.ts'), accounting = require('../accounting-store.ts'), returns = require('../phase7-store.ts');
const adapter = require('../sales-accounting.ts'), outbox = require('../outbox-bridge.ts'), remote = require('../remote-write.ts');
const permissions = require('../permissions.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;
const line = { productId: 'p', productName: 'Dress', quantity: 1, unitPrice: 100, costPrice: 60, discountPercent: 0, taxRate: 18, stockQuantity: 20 };
function reset() {
  accounting.hydrateAccountingState({ accounts: chart, journals: [], journalSequence: 0 });
  store.hydrateCore({ products: [{ id: 'p', name: 'Dress', stockQuantity: 20, version: 1 }], customers: [{ id: 'c', name: 'Customer', outstandingBalance: 0, totalSpending: 0 }], sales: [], payments: [] });
  returns.hydratePhase7({ returns: [], auditLogs: [] }); outbox.hydrateOutbox([]);
}
const create = (patch = {}) => store.createSale({ customerId: 'c', lines: [line], paidAmount: 40, paymentMethod: 'cash', ...patch });
const balance = (key) => {
  const account = accounting.getSystemAccount(key);
  const row = accounting.buildTrialBalance().find(r => r.accountId === account?.id);
  return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0)) * 100) / 100;
};
function refund(sale, quantity = 1, restock = true) {
  return returns.createReturn({ saleId: sale.id, reason: 'other', refundMethod: 'cash', items: [{ saleItemId: sale.items[0].id, productId: 'p', productName: 'Dress', unitPrice: 100, quantity, restock }] });
}
function balanced() { assert.equal(accounting.buildBalanceSheet().balanced, true); for (const j of accounting.listJournalEntries()) assert.equal(j.totalDebit, j.totalCredit); }
reset();
permissions.setCurrentRole('cashier');
const first = create(); assert.deepEqual(first.errors, []);
permissions.setCurrentRole('admin');
assert.equal(balance('cash'), 40); assert.equal(balance('accounts_receivable'), 78);
assert.equal(balance('product_sales'), -100); assert.equal(balance('tax_payable'), -18);
assert.equal(balance('cogs'), 60); assert.equal(balance('inventory_asset'), -60);
assert.equal(accounting.buildProfitAndLoss().netProfit, 40); balanced();
const invoiceSnapshot = structuredClone(first.sale);
const events = outbox.exportOutbox().length;
assert.deepEqual(adapter.planSalePosting(invoiceSnapshot, [{ method: 'cash', amount: 40 }], 0).errors, []);
adapter.planSalePosting(invoiceSnapshot, [{ method: 'cash', amount: 40 }], 0).commit();
assert.equal(outbox.exportOutbox().length, events); assert.equal(accounting.listJournalEntries().length, 1);
assert(adapter.planSalePosting({ ...invoiceSnapshot, taxAmount: 17 }, [{ method: 'cash', amount: 40 }], 0).errors.length);
const source = accounting.listJournalEntries()[0]; assert(accounting.voidJournalEntry(source.id).errors.length);
assert.deepEqual(store.recordCustomerPayment({ customerId: 'c', amount: 78, method: 'upi' }).errors, []);
assert.equal(balance('accounts_receivable'), 0); assert.equal(balance('payment_clearing'), 78); assert.equal(accounting.buildProfitAndLoss().netProfit, 40);
const saved = structuredClone(accounting.exportAccountingState()); accounting.hydrateAccountingState(saved);
assert.deepEqual(refund(first.sale).errors, []);
assert.equal(balance('product_sales'), 0); assert.equal(balance('tax_payable'), 0); assert.equal(balance('cogs'), 0); assert.equal(balance('inventory_asset'), 0);
assert.equal(balance('cash'), -78); assert.equal(balance('payment_clearing'), 78); assert.equal(accounting.buildProfitAndLoss().netProfit, 0); balanced();
// Credit sale, no restock: reverse revenue/tax and due, retain consumed/damaged cost.
reset(); const credit = create({ paidAmount: 0 }); assert.deepEqual(credit.errors, []);
assert.equal(balance('accounts_receivable'), 118); assert.deepEqual(refund(credit.sale, 1, false).errors, []);
assert.equal(balance('accounts_receivable'), 0); assert.equal(balance('cogs'), 60); assert.equal(accounting.buildProfitAndLoss().netProfit, -60); balanced();
// Split tender / cash change do not overstate receipts.
reset(); const split = create({ paymentSplits: [{ method: 'card', amount: 18 }, { method: 'cash', amount: 110 }] });
assert.deepEqual(split.errors, []); assert.equal(balance('payment_clearing'), 18); assert.equal(balance('cash'), 100); balanced();
// Discounted + taxed exchange uses a liability between return, replacement and excess refund.
reset(); const original = create({ lines: [{ ...line, discountPercent: 10 }], paidAmount: 106.2 });
const ex = returns.createExchange({ saleId: original.sale.id, reason: 'other', returnItems: [{ saleItemId: original.sale.items[0].id, productId: 'p', productName: 'Dress', quantity: 1, unitPrice: 100, restock: true }], replacementLines: [{ ...line, unitPrice: 80, taxRate: 0 }], additionalPaidAmount: 0, paymentMethod: 'cash', refundMethod: 'cash' });
assert.deepEqual(ex.errors, []); assert.equal(ex.extraRefund, 26.2);
assert.equal(balance('exchange_credit'), 0); assert.equal(balance('cash'), 80); assert.equal(balance('tax_payable'), 0);
assert.equal(balance('product_sales'), -80); assert.equal(balance('cogs'), 60); assert.equal(accounting.buildProfitAndLoss().netProfit, 20); balanced();
assert(accounting.listJournalEntries().some(j => j.referenceType === 'auto_exchange_refund' && j.referenceId === ex.ret.id));
// Rounding across repeated taxable partial returns ends at zero, including cost.
reset(); const tiny = create({ lines: [{ ...line, quantity: 3, unitPrice: .05, costPrice: .02, discountPercent: 10 }], paidAmount: 1 });
assert.deepEqual(tiny.errors, []);
for (let i = 0; i < 3; i++) assert.deepEqual(refund(tiny.sale).errors, []);
for (const key of ['cash', 'product_sales', 'tax_payable', 'cogs', 'inventory_asset']) assert.equal(balance(key), 0, key); balanced();
// Historic invoice settlement never invents previous revenue or receivables.
reset(); const legacy = structuredClone(invoiceSnapshot); legacy.id = 'legacy'; legacy.customerId = 'c';
store.hydrateCore({ sales: [legacy], customers: [{ id: 'c', name: 'Legacy', totalSpending: 40, outstandingBalance: 78 }], payments: [] });
assert.deepEqual(store.recordCustomerPayment({ customerId: 'c', amount: 78, method: 'bank' }).errors, []);
assert.equal(balance('bank'), 78); assert.equal(balance('legacy_settlement_clearing'), -78); assert.equal(balance('accounts_receivable'), 0);
assert.deepEqual(refund(legacy).errors, []); assert.equal(balance('legacy_settlement_clearing'), 40); assert.equal(balance('product_sales'), 0); balanced();
// Unavailable accounting accounts reject before sale, customer, stock or outbox changes.
reset(); accounting.hydrateAccountingState({ accounts: chart.map(a => a.systemKey === 'product_sales' ? { ...a, isActive: false } : a) });
const before = JSON.stringify({ products: store.listProducts(), customers: store.listCustomers(), events: outbox.exportOutbox() });
assert(create().errors.length); assert.equal(store.listSales().length, 0);
assert.equal(JSON.stringify({ products: store.listProducts(), customers: store.listCustomers(), events: outbox.exportOutbox() }), before);
// Missing accounts in old charts are created lazily; online writes await them.
reset(); accounting.hydrateAccountingState({ accounts: chart.filter(a => a.systemKey !== 'payment_clearing') });
const calls = [];
remote.registerRemoteWriter({ upsertAccountingAccount: async () => calls.push('account'), upsertJournalEntry: async () => calls.push('journal') });
const online = create({ paidAmount: 118, paymentMethod: 'card' }); assert.deepEqual(online.errors, []);
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls.at(-1), 'journal'); assert(calls.slice(0, -1).every(c => c === 'account'));
assert.equal(balance('payment_clearing'), 118);
reset(); remote.registerRemoteWriter({ upsertAccountingAccount: async () => { throw new Error('offline'); }, upsertJournalEntry: async () => { throw new Error('must not write journal before accounts'); } });
const warn = console.warn; console.warn = () => {};
try { const offline = create(); assert.deepEqual(offline.errors, []); await new Promise(resolve => setImmediate(resolve)); for (const type of ['accounts', 'journal_entries', 'journal_entry_lines']) assert(outbox.listPendingOutbox().some(e => e.aggregateType === type)); } finally { console.warn = warn; remote.registerRemoteWriter(null); }
console.log('Sales accounting lifecycle, tenders, collections, tax/cost reversals, exchange, rounding, legacy clearing, permissions, replay, restore and offline persistence PASS');
