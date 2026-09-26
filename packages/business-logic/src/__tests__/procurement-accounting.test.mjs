import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const store = require('../store.ts'), suppliers = require('../phase5-store.ts'), procurement = require('../procurement-store.ts');
const accounting = require('../accounting-store.ts'), adapter = require('../procurement-accounting.ts'), outbox = require('../outbox-bridge.ts'), remote = require('../remote-write.ts'), permissions = require('../permissions.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const chart = accounting.exportAccountingState().accounts;
function reset() {
  accounting.hydrateAccountingState({ accounts: chart, journals: [], journalSequence: 0 });
  suppliers.hydratePhase5({ suppliers: [{ id: 's', name: 'Supplier', outstandingBalance: 0 }], purchases: [] });
  store.hydrateCore({ products: [{ id: 'p', name: 'Fabric', costPrice: 50, stockQuantity: 0, version: 1 }], payments: [] });
  procurement.hydrateProcurementState({ purchaseOrders: [], goodsReceipts: [], purchaseInvoices: [] }); outbox.hydrateOutbox([]);
}
function draft(unlinked = false) {
  const po = procurement.createPurchaseOrder({ supplierId: 's', lines: [{ productId: unlinked ? null : 'p', description: 'Fabric', quantity: 2, unitCost: 50, taxRate: 18 }] });
  assert.deepEqual(po.errors, []); assert.equal(procurement.approvePurchaseOrder(po.purchaseOrder.id).error, undefined);
  const receipt = procurement.receivePurchaseOrder({ purchaseOrderId: po.purchaseOrder.id, lines: [{ purchaseOrderLineId: po.purchaseOrder.lines[0].id, quantity: 2 }] });
  assert.deepEqual(receipt.errors, []);
  const invoice = procurement.createPurchaseInvoice({ purchaseOrderId: po.purchaseOrder.id, invoiceDate: '2026-09-20', lines: [{ purchaseOrderLineId: po.purchaseOrder.lines[0].id, quantity: 2 }] });
  assert.deepEqual(invoice.errors, []); return invoice.purchaseInvoice;
}
const balance = key => { const a = accounting.getSystemAccount(key); const row = accounting.buildTrialBalance().find(r => r.accountId === a?.id); return Math.round(((row?.debit ?? 0) - (row?.credit ?? 0))*100)/100; };
reset(); const invoice = draft(); assert.equal(accounting.listJournalEntries().length, 0); assert.equal(store.getProduct('p').stockQuantity, 2);
assert.equal(procurement.postPurchaseInvoice(invoice.id).error, undefined);
assert.equal(store.getProduct('p').stockQuantity, 2); assert.equal(balance('inventory_asset'), 100); assert.equal(balance('purchase_tax_pending'), 18); assert.equal(balance('input_tax'), 0); assert.equal(balance('accounts_payable'), -118);
const count = accounting.listJournalEntries().length; adapter.planPurchaseInvoicePosting(invoice).commit(); assert.equal(accounting.listJournalEntries().length, count);
assert(adapter.planPurchaseInvoicePosting({ ...invoice, total: 119 }).errors.length); assert(procurement.postPurchaseInvoice(invoice.id).error);
assert(accounting.voidJournalEntry(accounting.listJournalEntries()[0].id).errors.length);
assert.equal(procurement.payPurchaseInvoice({ purchaseInvoiceId: invoice.id, amount: 40, paymentMethod: 'bank' }).error, undefined);
assert.equal(balance('accounts_payable'), -78); assert.equal(balance('bank'), -40);
assert(procurement.cancelPurchaseInvoice(invoice.id,"Accounting correction").error);
accounting.hydrateAccountingState(JSON.parse(JSON.stringify(accounting.exportAccountingState())));
assert.deepEqual(suppliers.recordSupplierPayment({ supplierId: 's', amount: 78, paymentMethod: 'upi' }).errors, []);
assert.equal(balance('accounts_payable'), 0); assert.equal(balance('payment_clearing'), -78); assert.equal(procurement.getPurchaseInvoice(invoice.id).status, 'paid');
assert.equal(accounting.buildBalanceSheet().balanced, true); assert.equal(accounting.buildProfitAndLoss().netProfit, 0);
reset(); const cancel = draft(); procurement.postPurchaseInvoice(cancel.id);
assert.match(procurement.cancelPurchaseInvoice(cancel.id,"").error,/reason is required/i);
assert.equal(procurement.cancelPurchaseInvoice(cancel.id,"Supplier invoice correction").error, undefined);
for (const key of ['inventory_asset','purchase_tax_pending','accounts_payable']) assert.equal(balance(key), 0);
assert.equal(store.getProduct('p').stockQuantity, 2); assert.equal(suppliers.getSupplier('s').outstandingBalance, 0);
assert.equal(accounting.listJournalEntries().length, 2); assert(procurement.cancelPurchaseInvoice(cancel.id,"Supplier invoice correction").error);
const reversal = accounting.listJournalEntries().find(j => j.referenceType === 'auto_purchase_cancel'); assert.equal(reversal.entryDate, new Date().toISOString().slice(0,10));
reset(); const unlinked = draft(true); assert.equal(procurement.postPurchaseInvoice(unlinked.id).error, undefined); assert.equal(balance('unclassified_purchases'), 100); assert.equal(balance('inventory_asset'), 0);
reset(); const bad = draft(); accounting.hydrateAccountingState({ accounts: chart.map(a => a.systemKey === 'accounts_payable' ? { ...a, isActive: false } : a) });
const before = JSON.stringify({ invoice: procurement.getPurchaseInvoice(bad.id), supplier: suppliers.getSupplier('s'), outbox: outbox.exportOutbox() });
assert(procurement.postPurchaseInvoice(bad.id).error); assert.equal(JSON.stringify({ invoice: procurement.getPurchaseInvoice(bad.id), supplier: suppliers.getSupplier('s'), outbox: outbox.exportOutbox() }), before);
permissions.setCurrentRole('cashier'); assert.throws(() => procurement.postPurchaseInvoice(bad.id), /denied/i); permissions.setCurrentRole('admin');
reset(); const old = draft(); procurement.hydrateProcurementState({ purchaseInvoices: [{ ...old, status: 'posted' }] }); suppliers.getSupplier('s').outstandingBalance = 118;
assert.deepEqual(suppliers.recordSupplierPayment({ supplierId:'s', amount:118, paymentMethod:'cash' }).errors, []);
assert.equal(balance('accounts_payable'), 0); assert.equal(balance('legacy_settlement_clearing'), 118); assert.equal(balance('cash'), -118);
reset(); const offline = draft(); remote.registerRemoteWriter({ upsertAccountingAccount: async () => { throw Error('offline'); } }); const warn = console.warn; console.warn = () => {};
try { assert.equal(procurement.postPurchaseInvoice(offline.id).error, undefined); await new Promise(resolve => setImmediate(resolve)); for(const type of ['accounts','journal_entries','journal_entry_lines','purchase_invoices']) assert(outbox.listPendingOutbox().some(e => e.aggregateType === type)); } finally { console.warn = warn; remote.registerRemoteWriter(null); }
console.log('Procurement accounting: real PO/GRN/draft/post/pay/cancel, stock invariants, tax review, legacy clearing, replay, restore, permission and offline tests PASS');
