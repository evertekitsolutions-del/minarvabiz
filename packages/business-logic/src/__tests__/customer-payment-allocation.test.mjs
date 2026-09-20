import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
// Execute the actual shared stores, not a duplicate of their business rules.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const store = require('../store.ts');
const permissions = require('../permissions.ts');
const outbox = require('../outbox-bridge.ts');
const remote = require('../remote-write.ts');
const returns = require('../phase7-store.ts');
permissions.setCurrentRole('admin');
permissions.setRuntimeFeaturePolicy(null);
const stamp = '2026-09-20T00:00:00.000Z';
function customer(id, outstandingBalance) { return { id, name: id, outstandingBalance, totalSpending: 10, createdAt: stamp, updatedAt: stamp }; }
function invoice(id, customerId, date, balance = 90) { return { id, customerId, customerName: customerId, invoiceNumber: id, saleDate: date, createdAt: date, updatedAt: date, total: 100, paidAmount: 100 - balance, balanceAmount: balance, status: 'partial', version: 1, items: [{ id: id+'-item', productId: 'p', productName: 'Test', quantity: 1, unitPrice: 100 }] }; }
const older = invoice('INV-1', 'c', '2026-09-18');
const newer = invoice('INV-2', 'c', '2026-09-19');
const unrelated = invoice('INV-OTHER', 'other', '2026-09-01');
const cancelled = { ...invoice('INV-CANCELLED', 'c', '2026-09-01'), status: 'cancelled' };
store.hydrateCore({ customers: [customer('c', 230), customer('other', 90)], sales: [newer, unrelated, cancelled, older], payments: [] });
outbox.hydrateOutbox([]);
const result = store.recordCustomerPayment({ customerId: 'c', amount: 120, method: 'cash', reference: 'REC-1', notes: 'Counter collection' });
assert.deepEqual(result.errors, []);
assert.equal(older.paidAmount, 100); assert.equal(older.balanceAmount, 0); assert.equal(older.status, 'completed');
assert.equal(newer.paidAmount, 40); assert.equal(newer.balanceAmount, 60); assert.equal(newer.status, 'partial');
assert.equal(older.version, 2); assert.equal(newer.version, 2);
assert.equal(unrelated.balanceAmount, 90); assert.equal(cancelled.balanceAmount, 90);
assert.equal(result.customer.outstandingBalance, 110); assert.equal(result.customer.totalSpending, 130);
assert.match(result.payment.notes, /INV-1 90.00, INV-2 30.00/);
assert.match(result.payment.notes, /REC-1/); assert.match(result.payment.notes, /Counter collection/);
assert.equal(outbox.listPendingOutbox().filter((e) => e.aggregateType === 'sales').length, 2);
const before = JSON.stringify({ sales: store.listSales(), customers: store.listCustomers(), payments: store.listPayments(), outbox: outbox.exportOutbox() });
for (const amount of [NaN, Infinity, -1, 0, .001, 1e30]) assert(store.recordCustomerPayment({ customerId: 'c', amount, method: 'cash' }).errors.length);
assert(store.recordCustomerPayment({ customerId: 'c', amount: 1, method: 'invalid' }).errors.length);
assert.equal(JSON.stringify({ sales: store.listSales(), customers: store.listCustomers(), payments: store.listPayments(), outbox: outbox.exportOutbox() }), before);
permissions.setCurrentRole('tailor');
assert.throws(() => store.recordCustomerPayment({ customerId: 'c', amount: 1, method: 'cash' }), /Permission denied/);
permissions.setCurrentRole('admin');
// Cap to total due, settle remaining invoice and retain opening/service balance remainder.
const final = store.recordCustomerPayment({ customerId: 'c', amount: 999, method: 'bank' });
assert.equal(final.payment.amount, 110); assert.equal(final.customer.outstandingBalance, 0);
assert.equal(newer.balanceAmount, 0); assert.equal(newer.paidAmount, 100);
assert.match(final.payment.notes, /Other customer balance: 50.00/);
assert(store.recordCustomerPayment({ customerId: 'c', amount: 1, method: 'cash' }).errors.length);
const snapshot = JSON.parse(JSON.stringify({ sales: store.listSales(), customers: store.listCustomers(), payments: store.listPayments() }));
store.hydrateCore(snapshot);
assert.equal(store.getSale('INV-2').paidAmount, 100);
assert.match(store.listPayments().find((p) => p.id === final.payment.id).notes, /INV-2 60.00/);
// A refund after full collection must refund 100, rather than refund 10 and incorrectly reduce receivables by 90.
const returned = returns.createReturn({ saleId: 'INV-1', reason: 'other', refundMethod: 'cash', items: [{ saleItemId: 'INV-1-item', productId: 'p', productName: 'Test', quantity: 1, unitPrice: 100, restock: false }] });
assert.deepEqual(returned.errors, []);
assert.equal(returned.paidRefund, 100); assert.equal(returned.receivableReduction, 0);
// Failed balance validation leaves everything untouched.
store.hydrateCore({ customers: [customer('bad', 80)], sales: [{ ...invoice('BAD', 'bad', stamp), paidAmount: 20 }], payments: [] });
assert(store.recordCustomerPayment({ customerId: 'bad', amount: 20, method: 'cash' }).errors.length);
assert.equal(store.getCustomer('bad').outstandingBalance, 80); assert.equal(store.listPayments().length, 0);
// Online updates use settlement updates, never duplicate invoice creation.
store.hydrateCore({ customers: [customer('online', 90)], sales: [invoice('ONLINE', 'online', stamp)], payments: [] });
const calls = [];
remote.registerRemoteWriter({ createPayment: async () => calls.push('payment'), updateSaleSettlement: async (sale) => { assert.equal(sale.balanceAmount, 0); calls.push('settlement'); }, upsertCustomer: async () => calls.push('customer'), createSale: async () => { throw new Error('must not insert invoice'); } });
const online = store.recordCustomerPayment({ customerId: 'online', amount: 90, method: 'upi' });
assert.deepEqual(online.errors, []);
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(calls, ['payment', 'settlement', 'customer']);
// A delayed first write must not overwrite the second collection's lower balance.
store.hydrateCore({ customers: [customer('serial', 90)], sales: [invoice('SERIAL', 'serial', stamp)], payments: [] });
let releaseFirst;
const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
const balances = [];
let writeCount = 0;
remote.registerRemoteWriter({ createPayment: async () => { if (++writeCount === 1) await firstGate; }, updateSaleSettlement: async (sale) => balances.push(sale.balanceAmount) });
store.recordCustomerPayment({ customerId: 'serial', amount: 50, method: 'cash' });
store.recordCustomerPayment({ customerId: 'serial', amount: 40, method: 'cash' });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(writeCount, 1); assert.deepEqual(balances, []);
releaseFirst();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(writeCount, 2); assert.deepEqual(balances, [40, 0]);
store.hydrateCore({ customers: [customer('offline', 90)], sales: [invoice('OFFLINE', 'offline', stamp)], payments: [] });
remote.registerRemoteWriter({ createPayment: async () => { throw new Error('offline'); } });
const warn = console.warn; console.warn = () => {};
try {
  const offline = store.recordCustomerPayment({ customerId: 'offline', amount: 90, method: 'cash' });
  await new Promise((resolve) => setImmediate(resolve));
  assert(outbox.listPendingOutbox().some((e) => e.aggregateId === offline.payment.id));
  assert(outbox.listPendingOutbox().some((e) => e.aggregateId === 'OFFLINE' && e.payload.balanceAmount === 0));
} finally { console.warn = warn; remote.registerRemoteWriter(null); }
console.log('Customer collection: FIFO allocation, invoice status, caps, other balances, permissions, invalid input, refund after collection, restore and online/offline persistence PASS');
