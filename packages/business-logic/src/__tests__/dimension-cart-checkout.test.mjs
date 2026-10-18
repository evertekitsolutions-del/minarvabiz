import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename,'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop:true },
  }).outputText, filename
);
const { previewDimensionRow } = require('../dimensional-billing.ts');
const { validateCart, cartLineToSaleItem } = require('../sales.ts');

const measurement = previewDimensionRow({
  length:'12', width:'18', lengthUnit:'in', widthUnit:'in',
  billableUnit:'sqft', pieces:'2',
});
assert.equal(measurement.valid,true);

const audit = {
  schema: 'dimension-line-v1', algorithm: 'area-v1',
  length: '12', width: '18', lengthUnit: 'in', widthUnit: 'in',
  billableUnit: 'sqft', pieces: 2, quantityMilli: 3000,
};
const line = (overrides={}) => ({
  productId:'product-1',productName:'Floor panel',quantity:3,
  unitPrice:100,costPrice:50,discountPercent:0,taxRate:0,
  stockQuantity:50,dimensionMetadata:audit,...overrides,
});

test('dimensional cart uses the same exact quantity for checkout and frozen saved invoice audit', () => {
  assert.deepEqual(validateCart([line()]),[]);
  const result=cartLineToSaleItem(line(),'sale-1','item-1');
  assert.equal(result.quantity,3);
  assert.deepEqual(result.dimensionMetadata,audit);
  assert.notEqual(result.dimensionMetadata,audit);
  assert.ok(Object.isFrozen(result.dimensionMetadata));
  assert.deepEqual(JSON.parse(JSON.stringify(result.dimensionMetadata)),audit);
  assert.equal(measurement.measurement.quantityMilli,result.dimensionMetadata.quantityMilli);
});

test('tampered dimensions and stale quantity cannot pass checkout', () => {
  for (const tamper of [
    {quantity:2.999},
    {dimensionMetadata:{...audit,length:'13'}},
    {dimensionMetadata:{...audit,pieces:3}},
    {dimensionMetadata:{...audit,extra:1}},
    {dimensionMetadata:{...audit,algorithm:'area-v2'}},
    {dimensionMetadata:{...audit,schema:null}},
    {dimensionMetadata:{...audit,quantityMilli:3001}},
  ]) {
    const corrupted=line(tamper);
    assert.ok(validateCart([corrupted]).some(e=>/dimension/i.test(e)),JSON.stringify(tamper));
    assert.throws(()=>cartLineToSaleItem(corrupted,'sale-1','item-1'),undefined,JSON.stringify(tamper));
  }
});

test('ordinary cart stays identical and legacy NULL metadata is ignored',()=>{
  const {dimensionMetadata,...ordinary}=line();
  assert.deepEqual(validateCart([ordinary]),[]);
  const saved=cartLineToSaleItem(ordinary,'sale-1','item-1');
  assert.equal(Object.hasOwn(saved,'dimensionMetadata'),false);
  assert.deepEqual(validateCart([line({dimensionMetadata:null})]),[]);
});
