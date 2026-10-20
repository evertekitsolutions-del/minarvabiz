import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseServiceOrderPriceDraft, validateMoneyAmountInput } from '../service-order-price-draft.ts';

// Execute the real renderer handler, replacing only its UI/persistence boundaries.
const source = fs.readFileSync(new URL('../../../../apps/desktop/src/App.tsx', import.meta.url), 'utf8');
const body = source.match(/function handleCreateOrder\(\)\{([\s\S]*?)\n  \}\n  function handleOrderStatusChange/)[1];
const base = { serviceType: 'wholesale', price: '', quantity: '3', unitPrice: '100.10',
  discount: '0', bulkDiscount: '.30', advance: '300', externalMaterialCost: '0',
  tshirt: { customerPrice: 0 } };
function submit(overrides) {
  const writes = []; const errors = [];
  const bindings = {
    form: { ...base, ...overrides }, parseServiceOrderPriceDraft,
    ordersStore: { createOrder: (input) => { writes.push(input); return { errors: [], order: input }; } },
    setFormError: (error) => errors.push(error), errorMessage: (error) => error.message,
    setCreateOpen() {}, setForm() {}, emptyOrderForm() {}, setModuleError() {},
    persistAndRefresh() { writes.push('persist'); }, setSelectedOrder() {},
  };
  new Function(...Object.keys(bindings), body)(...Object.values(bindings));
  return { writes, errors };
}
test('Windows wholesale uses exact cents before posting and persistence', () => {
  const { writes, errors } = submit({});
  assert.equal(writes[0].price, 300.3);
  assert.equal(writes[0].bulkDiscount, .3);
  assert.equal(writes[0].quantity, 3);
  assert.equal(writes[1], 'persist');
  assert.deepEqual(errors, [null]);
});
test('Windows rejects malformed money/quantity before domain or persistence writes', () => {
  for (const input of [{unitPrice:'100oops'}, {quantity:'3oops'}, {quantity:'1.5'},
    {advance:'NaN'}, {bulkDiscount:'400'}, {advance:'300.01'},
    {externalMaterialCost:'-1'}, {unitPrice:'1 00'}, {unitPrice:'1.234'}]) {
    const result = submit(input);
    assert.equal(result.writes.length, 0, JSON.stringify(input));
    assert.equal(typeof result.errors[0], 'string');
  }
});
test('T-shirt order validates the form price and uses it for both order and print detail', () => {
  const result = submit({ serviceType:'tshirt_printing', price:'120.25', advance:'20', tshirt:{customerPrice:0} });
  assert.equal(result.writes[0].price,120.25);
  assert.equal(result.writes[0].tshirt.customerPrice,120.25);
});
test('adapted catalog validation keeps Minarva precision and rejects coercion', () => {
  for (const value of [null, undefined, true, {}, [], NaN, Infinity, '-1', '1e3', '0x10', '1 00', '1.234', '']) {
    assert.equal(validateMoneyAmountInput(value).ok, false, String(value));
  }
  for (const [value, numeric] of [['.30', .3], [' 100.10 ', 100.1], [0, 0], ['0001.20', 1.2]]) {
    assert.deepEqual(validateMoneyAmountInput(value), {ok:true,numeric});
  }
  assert.deepEqual(validateMoneyAmountInput('9999999999999999999'), {ok:false,reason:'unsafe_range'});
});
test('zero prices are explicit and overflowing wholesale totals fail before posting', () => {
  const free = submit({unitPrice:'0', advance:'0', bulkDiscount:'0'});
  assert.equal(free.writes[0].price, 0);
  assert.equal(free.writes[0].unitPrice, 0);
  const overflow = submit({unitPrice:'1000000000000',quantity:'1000',advance:'0',bulkDiscount:'0'});
  assert.deepEqual(overflow.writes, []);
  assert.match(overflow.errors[0], /monetary range/);
});
