import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const store = require('../store.ts');
const returns = require('../phase7-store.ts');
const { quoteSaleReturn } = require('../return-value.ts');
const permissions = require('../permissions.ts');
const outbox = require('../outbox-bridge.ts');
permissions.setCurrentRole('admin'); permissions.setRuntimeFeaturePolicy(null);
function fixture({ quantity = 1, price = 100, discount = 10, tax = 18, paid = 1000 } = {}) {
  const product = { id: 'p', name: 'Dress', sellingPrice: price, costPrice: 50, stockQuantity: 10, version: 1 };
  store.hydrateCore({ products: [product], customers: [{ id: 'c', name: 'Customer', totalSpending: 0, outstandingBalance: 0 }], sales: [], payments: [] });
  returns.hydratePhase7({ returns: [], auditLogs: [] }); outbox.hydrateOutbox([]);
  const result = store.createSale({ customerId: 'c', lines: [{ productId: 'p', productName: 'Dress', quantity, unitPrice: price, costPrice: 50, discountPercent: discount, taxRate: tax, stockQuantity: 10 }], paidAmount: paid, paymentMethod: 'cash' });
  assert.deepEqual(result.errors, []);
  return result.sale;
}
function selected(sale, quantity) { return { saleItemId: sale.items[0].id, productId: 'p', productName: 'Untrusted name', quantity, unitPrice: 999999, restock: true }; }
function refund(sale, quantity) { return returns.createReturn({ saleId: sale.id, reason: 'other', refundMethod: 'cash', items: [selected(sale, quantity)] }); }
for (const [discount, tax, expected] of [[10, 0, 90], [0, 18, 118], [10, 18, 106.2], [100, 18, 0]]) {
  const sale = fixture({ discount, tax });
  const quote = quoteSaleReturn(sale, [], [selected(sale, 1)]);
  assert.deepEqual(quote.errors, []); assert.equal(quote.totalRefund, expected);
  const result = refund(sale, 1);
  assert.deepEqual(result.errors, []); assert.equal(result.ret.totalRefund, expected);
  assert.equal(result.ret.items[0].productName, 'Dress'); assert.equal(result.ret.items[0].unitPrice, 100);
  assert.equal(sale.total, 0); assert.equal(sale.status, 'returned'); assert.equal(store.getProduct('p').stockQuantity, 10);
  assert.equal(store.getCustomer('c').totalSpending, 0);
  assert(outbox.listPendingOutbox().some(e => e.aggregateId === result.ret.id && e.payload.totalRefund === expected));
}
const sale = fixture({ quantity: 3, price: .05, discount: 10, tax: 0 }); // Recorded line is 13 cents.
assert.equal(sale.total, .13);
const amounts = [];
for (let i = 0; i < 3; i++) {
  if (i === 1) { // Restore between partial returns; history drives residual pennies.
    returns.hydratePhase7({ returns: JSON.parse(JSON.stringify(returns.listReturns())) });
  }
  const result = refund(sale, 1); assert.deepEqual(result.errors, []); amounts.push(result.ret.totalRefund);
}
assert.deepEqual(amounts, [.04, .05, .04]); assert.equal(sale.total, 0);
const partial = fixture({ paid: 20 });
const result = refund(partial, 1);
assert.deepEqual(result.errors, []); assert.equal(result.paidRefund, 20); assert.equal(result.receivableReduction, 86.2);
assert.equal(store.getCustomer('c').outstandingBalance, 0);
const invalid = fixture();
const state = () => JSON.stringify({ sale: store.getSale(invalid.id), product: store.getProduct('p'), customer: store.getCustomer('c'), payments: store.listPayments(), returns: returns.listReturns(), outbox: outbox.exportOutbox() });
const before = state();
for (const qty of [NaN, Infinity, 0, -1, 2]) assert(refund(invalid, qty).errors.length);
assert(returns.createReturn({ saleId: invalid.id, reason: 'other', refundMethod: 'cash', items: [selected(invalid, .5), selected(invalid, .5)] }).errors.length);
assert(returns.createReturn({ saleId: invalid.id, reason: 'other', refundMethod: 'invalid', items: [selected(invalid, 1)] }).errors.length);
assert(quoteSaleReturn(invalid, [], [{ ...selected(invalid, 1), productId: 'wrong' }]).errors.length);
assert(quoteSaleReturn({ ...invalid, status: 'cancelled' }, [], [selected(invalid, 1)]).errors.length);
assert(quoteSaleReturn({ ...invalid, paidAmount: 0 }, [], [selected(invalid, 1)]).errors.length);
assert.equal(state(), before);
permissions.setCurrentRole('tailor'); assert.throws(() => refund(invalid, 1), /denied/i); permissions.setCurrentRole('admin');
// Exchange quote and committed return use exactly the same discounted/taxed credit.
const exchangeSale = fixture();
const exchange = returns.createExchange({ saleId: exchangeSale.id, reason: 'other', returnItems: [selected(exchangeSale, 1)], replacementLines: [{ productId: 'p', productName: 'Dress', quantity: 1, unitPrice: 80, costPrice: 50, discountPercent: 0, taxRate: 0, stockQuantity: 10 }], paymentMethod: 'cash', additionalPaidAmount: 0, refundMethod: 'cash' });
assert.deepEqual(exchange.errors, []); assert.equal(exchange.ret.totalRefund, 106.2);
assert.equal(exchange.storeCreditApplied, 80); assert.equal(exchange.extraRefund, 26.2); assert.equal(exchange.amountDue, 0);
assert.equal(exchange.replacementSale.total, 80); assert.equal(exchange.replacementSale.balanceAmount, 0);
// Fractional fabric quantities and absent old lineTotal remain supported.
const fabric = fixture({ quantity: 1.5, discount: 0, tax: 0 });
assert.equal(refund(fabric, .5).ret.totalRefund, 50); assert.equal(refund(fabric, 1).ret.totalRefund, 100);
const legacy = fixture({ tax: 0 }); delete legacy.items[0].lineTotal;
assert.equal(refund(legacy, 1).ret.totalRefund, 90);
console.log('Return invoice value: discount, tax, cumulative rounding, restores, receivables, invalid inputs, permissions, exchange, fractional fabric and legacy snapshots PASS');
