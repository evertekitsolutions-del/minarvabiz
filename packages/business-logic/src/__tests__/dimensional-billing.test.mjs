import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDimensionArea } from '../dimensional-billing.ts';

const area = (length, width, options = {}) => calculateDimensionArea({
  length, width, lengthUnit: 'ft', widthUnit: 'ft', billableUnit: 'sqft', ...options,
});

test('exact feet and inches area in thousandths of square foot', () => {
  assert.deepEqual(area('1','1'), {quantityMilli:1000,quantity:1,billableUnit:'sqft',pieces:1});
  assert.deepEqual(area('12','12',{lengthUnit:'in',widthUnit:'in'}), {quantityMilli:1000,quantity:1,billableUnit:'sqft',pieces:1});
  assert.deepEqual(area('30.48','30.48',{lengthUnit:'cm',widthUnit:'cm'}), {quantityMilli:1000,quantity:1,billableUnit:'sqft',pieces:1});
  assert.equal(area('0.3048','0.3048',{lengthUnit:'m',widthUnit:'m'}).quantityMilli,1000);
});

test('metre and mixed-unit conversions round the final area once', () => {
  assert.equal(area('1','1',{lengthUnit:'m',widthUnit:'m',billableUnit:'sqm'}).quantityMilli,1000);
  assert.equal(area('1','1',{lengthUnit:'m',widthUnit:'m'}).quantityMilli,10764);
  assert.equal(area('1','12',{lengthUnit:'ft',widthUnit:'in'}).quantityMilli,1000);
  assert.equal(area('1','1',{billableUnit:'sqm'}).quantityMilli,93);
});

test('piece multiplier calculated before final rounding avoids rounding drift', () => {
  assert.equal(area('0.01','0.1',{pieces:3}).quantityMilli,3);
  assert.equal(area('0.1','0.005',{pieces:3}).quantityMilli,2); // 0.0015 sqft rounds up to 0.002
  assert.equal(area('2','3',{pieces:4}).quantityMilli,24000);
});

test('fixed decimal exactness: short lengths, 6 decimal digits and half-up rounding', () => {
  assert.equal(area('0.1','0.2').quantityMilli,20);
  assert.equal(area('0.01','0.05').quantityMilli,1); // 0.0005 sqft half-up
  assert.throws(() => area('0.000001','0.000001'),/Billable area rounds to zero/);
});

test('rejects malformed, negative, zero, imprecise or unbounded dimensions', () => {
  for (const n of ['-1','0','1e3','Infinity','NaN',' 1','1 ','.5','1.0000001','', '1000000000']) {
    assert.throws(() => area(n,'1'),/Invalid dimension/,'bad '+n);
  }
  for (const n of [NaN,Infinity,-1,1.5,null]) assert.throws(() => area(n,'1'),/Invalid dimension/);
  assert.throws(() => area('1','0'),/Invalid dimension/);
  assert.throws(() => area('1','1',{pieces:0}),/Invalid piece count/);
  assert.throws(() => area('1','1',{pieces:1.5}),/Invalid piece count/);
  assert.throws(() => area('1','1',{pieces:1000001}),/Invalid piece count/);
});

test('rejects invalid units, possible int overflow, and excess quantity', () => {
  assert.throws(() => area('1','1',{lengthUnit:'px'}),/Invalid dimension unit/);
  assert.throws(() => area('1','1',{widthUnit:'km'}),/Invalid dimension unit/);
  assert.throws(() => area('1','1',{billableUnit:'litre'}),/Invalid billable area unit/);
  assert.throws(() => area('999999999','999999999',{pieces:1000000}),/Quantity outside supported range/);
});

test('pure immutable quote never mutates source; never posts invoices or stock', () => {
  const input = Object.freeze({length:'2',width:'3',lengthUnit:'ft',widthUnit:'ft',billableUnit:'sqft',pieces:2});
  const before = structuredClone(input);
  const output = calculateDimensionArea(input);
  assert.deepEqual(input,before);
  assert.ok(Object.isFrozen(output));
  assert.equal(output.quantityMilli,12000);
  assert.equal(output.quantity,12);
});
