import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const store = require('../store.ts'), suppliers = require('../phase5-store.ts'), procurement = require('../procurement-store.ts');
const outbox = require('../outbox-bridge.ts'), remote = require('../remote-write.ts'), permissions = require('../permissions.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
const stamp = '2026-09-20T00:00:00.000Z';
const invoice = (id, date, patch = {}) => ({ id, invoiceNumber: id, supplierId: 's', supplierName: 'Supplier', invoiceDate: date, dueDate: date, total: 100, paidAmount: 0, balanceAmount: 100, status: 'posted', lines: [], createdAt: stamp, updatedAt: stamp, version: 1, ...patch });
function reset(balance = 250) {
  suppliers.hydratePhase5({ suppliers: [{ id: 's', name: 'Supplier', outstandingBalance: balance, createdAt: stamp, updatedAt: stamp }], purchases: [{ id: 'p', purchaseNumber: 'PUR-1', supplierId: 's', date: '2026-09-18', amount: 100, paidAmount: 50, balanceAmount: 50, createdAt: stamp, updatedAt: stamp, version: 1 }] });
  procurement.hydrateProcurementState({ purchaseInvoices: [invoice('new', '2026-09-19'), invoice('old', '2026-09-17'), invoice('draft', '2026-09-01', { status: 'draft' }), invoice('cancelled', '2026-09-01', { status: 'cancelled' }), invoice('other', '2026-09-01', { supplierId: 'other' })] });
  store.hydrateCore({ payments: [] }); outbox.hydrateOutbox([]);
}
const pay = (amount, extra = {}) => suppliers.recordSupplierPayment({ supplierId: 's', amount, paymentMethod: 'cash', ...extra });
reset();
const first = pay(130); assert.deepEqual(first.errors, []);
assert.equal(procurement.getPurchaseInvoice('old').status, 'paid'); assert.equal(procurement.getPurchaseInvoice('new').balanceAmount, 100);
assert.equal(suppliers.listPurchases()[0].paidAmount, 80); assert.equal(suppliers.listPurchases()[0].balanceAmount, 20);
assert.equal(first.supplier.outstandingBalance, 120); assert.match(first.payment.notes, /old 100.00, PUR-1 30.00/);
assert.equal(procurement.buildSupplierPayableAging().find(r => r.supplierId === 's').totalOutstanding, 100);
for (const id of ['draft', 'cancelled', 'other']) assert.equal(procurement.getPurchaseInvoice(id).balanceAmount, 100);
const selected = procurement.payPurchaseInvoice({ purchaseInvoiceId: 'new', amount: 40, paymentMethod: 'bank' });
assert.equal(selected.error, undefined); assert.equal(selected.purchaseInvoice.paidAmount, 40); assert.equal(selected.purchaseInvoice.balanceAmount, 60);
assert.equal(suppliers.listPurchases()[0].balanceAmount, 20); assert.equal(suppliers.getSupplier('s').outstandingBalance, 80);
procurement.hydrateProcurementState(JSON.parse(JSON.stringify(procurement.exportProcurementState())));
assert.equal(procurement.getPurchaseInvoice('new').paidAmount, 40);
assert.deepEqual(pay(999).errors, []); assert.equal(suppliers.getSupplier('s').outstandingBalance, 0); assert.equal(procurement.getPurchaseInvoice('new').status, 'paid');
assert.equal(suppliers.listPurchases()[0].balanceAmount, 0);
// Supplier cap updates invoice by the actual amount, not by the requested amount.
reset(10); const capped = procurement.payPurchaseInvoice({ purchaseInvoiceId: 'new', amount: 100, paymentMethod: 'cash' });
assert.equal(capped.error, undefined); assert.equal(capped.purchaseInvoice.paidAmount, 10); assert.equal(capped.purchaseInvoice.balanceAmount, 90);
assert.equal(store.listPayments()[0].amount, 10); assert.equal(procurement.getPurchaseInvoice('old').paidAmount, 0);
reset(300); const remainder = pay(300); assert.deepEqual(remainder.errors, []); assert.match(remainder.payment.notes, /Other supplier balance: 50.00/);
reset(); const state = () => JSON.stringify({ suppliers: suppliers.listSuppliers(), purchases: suppliers.listPurchases(), invoices: procurement.listPurchaseInvoices(), payments: store.listPayments(), outbox: outbox.exportOutbox() });
const before = state();
for (const amount of [NaN, Infinity, -1, 0, .001, 1e30]) assert(pay(amount).errors.length);
for (const extra of [{ date: '2026-02-30' }, { date: 'invalid' }, { paymentMethod: 'invalid' }, { purchaseInvoiceId: 'draft' }, { purchaseInvoiceId: 'other' }]) assert(pay(10, extra).errors.length);
assert(procurement.payPurchaseInvoice({ purchaseInvoiceId: 'new', amount: NaN, paymentMethod: 'cash' }).error);
assert.equal(state(), before);
permissions.setCurrentRole('tailor'); assert.throws(() => pay(10), /denied/i); permissions.setCurrentRole('admin');
procurement.hydrateProcurementState({ purchaseInvoices: [invoice('bad', '2026-09-01', { paidAmount: 10 })] });
assert(pay(10).errors.length); assert.equal(store.listPayments().length, 0);
// Writes are single-insert and ordered; later settlements cannot be overwritten by an older slow request.
reset(); let release; const gate = new Promise(resolve => { release = resolve; }); let calls = 0; const balances = [];
remote.registerRemoteWriter({ createPayment: async () => { if (++calls === 1) await gate; }, upsertPurchaseInvoice: async i => balances.push(i.balanceAmount), upsertSupplier: async () => {} });
pay(40, { purchaseInvoiceId: 'old' }); pay(60, { purchaseInvoiceId: 'old' });
await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1); assert.deepEqual(balances, []);
release(); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2); assert.deepEqual(balances, [60, 0]);
reset(); const writes = [];
remote.registerRemoteWriter({ createPayment: async () => writes.push('payment'), upsertPurchaseInvoice: async () => writes.push('invoice'), updatePurchaseSettlement: async () => writes.push('purchase-update'), upsertSupplier: async () => writes.push('supplier'), createPurchase: async () => { throw Error('must not insert existing purchase'); } });
pay(150); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(writes, ['payment', 'invoice', 'purchase-update', 'supplier']);
reset(); remote.registerRemoteWriter({ createPayment: async () => { throw Error('offline'); } }); const warn = console.warn; console.warn = () => {};
try { const pending = pay(150); await new Promise(resolve => setImmediate(resolve)); for (const type of ['payments', 'suppliers', 'purchase_invoices', 'purchases']) assert(outbox.listPendingOutbox().some(e => e.aggregateType === type)); assert(outbox.listPendingOutbox().some(e => e.aggregateId === pending.payment.id)); } finally { console.warn = warn; remote.registerRemoteWriter(null); }
console.log('Supplier settlement FIFO, selected invoice, actual cap, direct purchases, aging, restore, invalid input, permissions and ordered online/offline writes PASS');
