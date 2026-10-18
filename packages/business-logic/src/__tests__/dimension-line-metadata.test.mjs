import test from 'node:test';
import assert from 'node:assert/strict';
import {
  previewDimensionRow,
  parseDimensionLineMetadata,
  dimensionLineMetadataFromMeasurement,
} from '../dimensional-billing.ts';

const draft = Object.freeze({
  length: '12', width: '18', lengthUnit: 'in',
  widthUnit: 'in', billableUnit: 'sqft', pieces: '2',
});
const source = () => {
  const preview = previewDimensionRow(draft);
  assert.equal(preview.valid, true);
  return preview.measurement;
};
const packet = () => dimensionLineMetadataFromMeasurement(source());

test('canonical measurement packet survives offline JSON roundtrip at exact sale quantity', () => {
  const input = source();
  const saved = packet();
  assert.deepEqual(saved, {
    schema: 'dimension-line-v1', algorithm: 'area-v1',
    length: '12', width: '18', lengthUnit: 'in', widthUnit: 'in',
    billableUnit: 'sqft', pieces: 2, quantityMilli: 3000,
  });
  assert.equal(input.quantity, 3);
  assert.ok(Object.isFrozen(saved));
  const fromJson = JSON.parse(JSON.stringify(saved));
  assert.deepEqual(parseDimensionLineMetadata(fromJson, 3000), saved);
  assert.ok(Object.isFrozen(parseDimensionLineMetadata(fromJson, 3000)));
});

test('stale edit and forged quantities fail closed even when the UI preview was valid', () => {
  for (const corrupt of [
    { quantityMilli: 2999 },
    { quantityMilli: 3001 },
    { length: '13' },
    { width: '19' },
    { pieces: 3 },
    { algorithm: 'area-v2' },
    { schema: 'dimension-line-v2' },
    { lengthUnit: 'yards' },
    { billableUnit: 'litre' },
    { quantityMilli: 0 },
    { quantityMilli: Number.MAX_SAFE_INTEGER },
  ]) {
    assert.throws(() => parseDimensionLineMetadata({ ...packet(), ...corrupt }, 3000), undefined, JSON.stringify(corrupt));
  }
  assert.throws(() => parseDimensionLineMetadata(packet(), 2000), /Sale-line quantity/);
  assert.throws(() => parseDimensionLineMetadata(packet(), 3), /Sale-line quantity/);
  assert.throws(() => parseDimensionLineMetadata(packet(), NaN), /Sale-line quantity/);
  assert.throws(() => dimensionLineMetadataFromMeasurement({
    ...source(), quantity: 200, quantityMilli: 3000,
  }), /inconsistent/);
  assert.throws(() => dimensionLineMetadataFromMeasurement({
    ...source(), algorithm: 'area-v2',
  }), /Unsupported/);
});

test('unknown fields, prototypes and accessor values cannot enter durable metadata', () => {
  for (const invalid of [
    null, [], 9, '', { ...packet(), random: 'value' },
    JSON.parse('{"__proto__":{},"schema":"dimension-line-v1"}'),
    Object.assign(Object.create({ inherited: true }), packet()),
  ]) {
    assert.throws(() => parseDimensionLineMetadata(invalid), undefined, String(invalid));
  }
  const tampered = { ...packet() };
  Object.defineProperty(tampered, 'length', { enumerable: true, get: () => '12' });
  assert.throws(() => parseDimensionLineMetadata(tampered), /descriptors/);
});

test('mixed units and half-up rounding are independently recomputed once', () => {
  const preview = previewDimensionRow({
    length: '1', width: '100', lengthUnit: 'm',
    widthUnit: 'cm', billableUnit: 'sqm', pieces: '3',
  });
  assert.equal(preview.valid, true);
  const saved = dimensionLineMetadataFromMeasurement(preview.measurement);
  assert.equal(saved.quantityMilli, 3000);
  assert.deepEqual(parseDimensionLineMetadata(JSON.parse(JSON.stringify(saved)), 3000), saved);
  const half = previewDimensionRow({
    length: '0.0015', width: '1', lengthUnit: 'm',
    widthUnit: 'm', billableUnit: 'sqm', pieces: '1',
  });
  assert.equal(half.valid, true);
  assert.equal(dimensionLineMetadataFromMeasurement(half.measurement).quantityMilli, 2);
});
