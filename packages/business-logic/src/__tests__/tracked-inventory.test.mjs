import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planFefoLotAllocations,
  validateSerializedSelection,
  normalizeSerialCode,
} from '../tracked-inventory.ts';

const asOfDate = '2026-10-18';
const lot = (id, expiresOn, onHandMilli, reservedMilli = 0, changes = {}) => ({
  id, orgId: 'org-a', productId: 'prod1', warehouseId: 'wh1', batchCode: id,
  expiresOn, onHandMilli, reservedMilli, status: 'active', ...changes,
});
const pick = (quantityMilli, lots, extra = {}) => planFefoLotAllocations({
  orgId: 'org-a', productId: 'prod1', warehouseId: 'wh1',
  asOfDate, quantityMilli, lots, ...extra,
});

test('FEFO earliest expiry, skip expired/blocked, honour reservations, deterministic tie', () => {
  const lots = [
    lot('b', '2026-10-19', 3000, 1000),
    lot('a', '2026-10-19', 4000, 0),
    lot('expired', '2026-10-17', 20000),
    lot('today', '2026-10-18', 1000),
    lot('blocked', '2026-10-18', 10000, 0, { status: 'blocked' }),
    lot('later', '2026-11-01', 5000),
  ];
  const before = structuredClone(lots);
  const allocations = pick(6500, lots);
  assert.deepEqual(allocations, [
    { batchId: 'today', quantityMilli: 1000 },
    { batchId: 'a', quantityMilli: 4000 },
    { batchId: 'b', quantityMilli: 1500 },
  ]);
  assert.deepEqual(lots, before);
  assert.ok(Object.isFrozen(allocations));
  assert.ok(allocations.every(Object.isFrozen));
});

test('FEFO rejects shortage atomically and never allocates another tenant or product', () => {
  assert.throws(() => pick(1001, [lot('a','2026-12-01',1000)]), /Insufficient saleable lot stock/);
  assert.throws(() => pick(1000, [lot('a','2026-12-01',1000,0,{orgId:'org-b'})]), /Lot scope mismatch/);
  assert.throws(() => pick(1000, [lot('a','2026-12-01',1000,0,{productId:'other'})]), /Lot scope mismatch/);
  assert.throws(() => pick(1000, [lot('a','2026-12-01',1000,0,{warehouseId:'wh2'})]), /Lot scope mismatch/);
});

test('FEFO rejects negative, unsafe, over-reserved, duplicates, invalid calendar dates', () => {
  const valid = [lot('a','2026-12-01',1000)];
  for (const quantityMilli of [0, -1000, 0.5, Infinity, Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(() => pick(quantityMilli, valid), /Invalid quantity milli-units/);
  }
  assert.throws(() => pick(500,[lot('a','2026-12-01',1000,1001)]), /Invalid lot stock/);
  assert.throws(() => pick(500,[lot('a','2026-12-01',1000,-1)]), /Invalid lot stock/);
  assert.throws(() => pick(500,[lot('a','2026-12-01',1000,0.5)]), /Invalid lot stock/);
  assert.throws(() => pick(500,[lot('a','2026-12-01',1000),lot('a','2026-12-02',1000)]), /Duplicate lot id/);
  assert.throws(() => pick(500,[lot('a','2026-02-30',1000)]), /Invalid expiry date/);
  assert.throws(() => pick(500, valid,{asOfDate:'2026-02-30'}), /Invalid sale date/);
  assert.throws(() => pick(500,valid,{warehouseId:''}), /Invalid lot scope/);
  assert.throws(() => pick(500,[lot('a','2026-12-01',1000,0,{status:'unknown'})]), /Invalid lot status/);
});

test('FEFO is precise for 0.001 quantity, date at boundary is saleable', () => {
  assert.deepEqual(pick(1,[lot('same','2026-10-18',1)]),[{batchId:'same',quantityMilli:1}]);
  assert.throws(() => pick(1,[lot('expired','2026-10-17',1)]),/Insufficient saleable lot stock/);
});

const imei = '490154203237518';
const serial = (id, code, kind = 'serial', extra = {}) => ({
  id, orgId:'org-a', productId:'prod1', serialCode:code, serialKind:kind,
  status:'available', ...extra,
});
const validate = (quantityMilli, units, extra = {}) => validateSerializedSelection({
  orgId:'org-a', productId:'prod1', quantityMilli, units, ...extra,
});

test('IMEI Luhn and serial scanner normalization', () => {
  assert.equal(normalizeSerialCode(imei,'imei'),imei);
  assert.equal(normalizeSerialCode(' aBc-xy/01 ','serial'),'ABC-XY/01');
  assert.throws(() => normalizeSerialCode('490154203237519','imei'),/Invalid IMEI/);
  assert.throws(() => normalizeSerialCode('49015420323751','imei'),/Invalid IMEI/);
  assert.throws(() => normalizeSerialCode('one\nline','serial'),/Invalid serial code/);
  assert.throws(() => normalizeSerialCode('   ','serial'),/Invalid serial code/);
});

test('Serial selection must match whole-unit quantity and have available unique units', () => {
  const input = [serial('s1',imei,'imei'),serial('s2','abc-12')];
  const before = structuredClone(input);
  assert.deepEqual(validate(2000,input),[{unitId:'s1',serialCode:imei},{unitId:'s2',serialCode:'ABC-12'}]);
  assert.deepEqual(input,before);
  assert.ok(Object.isFrozen(validate(1000,[serial('s2','ab')])));
  assert.throws(() => validate(1500,[serial('s1',imei,'imei')]),/whole units/);
  assert.throws(() => validate(2000,[serial('s1',imei,'imei')]),/quantity mismatch/);
  assert.throws(() => validate(1000,[serial('s1',imei,'imei',{status:'sold'})]),/Serial unavailable/);
  assert.throws(() => validate(1000,[serial('s1',imei,'imei',{orgId:'org-b'})]),/Serial scope mismatch/);
  assert.throws(() => validate(1000,[serial('s1',imei,'imei',{productId:'prod2'})]),/Serial scope mismatch/);
  assert.throws(() => validate(2000,[serial('s1','a'),serial('s2','A')]),/Duplicate serial code/);
  assert.throws(() => validate(2000,[serial('s1','a'),serial('s1','b')]),/Duplicate serial id/);
  assert.throws(() => validate(1000,[serial('s1','a',{foo:true})]),/Invalid serial kind/);
});
