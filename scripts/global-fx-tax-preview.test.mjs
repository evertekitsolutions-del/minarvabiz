import test from "node:test";
import assert from "node:assert/strict";
import {
  GLOBAL_CURRENCY_MINOR_DIGITS, previewGlobalFxConversion, previewGlobalTax,
} from "../packages/business-logic/src/global-fx-tax-preview.ts";

const snapshot = Object.freeze({
  base: "USD", quote: "OMR", quotePerBase: "0.38450",
  capturedAt: "2026-11-10T08:00:00Z", source: "qa-fixed-fixture",
});

test("P1 currency minor units recognize OMR's three decimals", () => {
  assert.equal(GLOBAL_CURRENCY_MINOR_DIGITS.OMR, 3);
  assert.equal(GLOBAL_CURRENCY_MINOR_DIGITS.USD, 2);
  assert.deepEqual(Object.keys(GLOBAL_CURRENCY_MINOR_DIGITS).sort(),
    ["AED","EUR","INR","OMR","USD"]);
});
test("P1 FX snapshot is deterministic, immutable and rounds to OMR fils", () => {
  const v = previewGlobalFxConversion("10000", snapshot);
  assert.equal(v.quoteMinor, "38450"); // 100.00 USD => 38.450 OMR
  assert.equal(v.baseMinor, "10000");
  assert.equal(Object.isFrozen(v), true);
  assert.equal(Object.isFrozen(v.snapshot), true);
  assert.equal(v.snapshot.source, "qa-fixed-fixture");
  assert.equal(previewGlobalFxConversion("10000", snapshot).quoteMinor, v.quoteMinor);
});
test("P1 FX handles negative credit notes symmetrically without floats", () => {
  assert.equal(previewGlobalFxConversion("-101", snapshot).quoteMinor, "-388");
  assert.equal(previewGlobalFxConversion("101", snapshot).quoteMinor, "388");
  assert.equal(previewGlobalFxConversion("0", snapshot).quoteMinor, "0");
});
test("P1 snapshots fail closed on invalid input or absent provenance", () => {
  for(const bad of [
    {...snapshot, quotePerBase:"0"},
    {...snapshot, quotePerBase:"1e3"},
    {...snapshot, quotePerBase:"-1"},
    {...snapshot, quotePerBase:"0.1234567890123"},
    {...snapshot, capturedAt:"2026-11-10"},
    {...snapshot, source:""},
    {...snapshot, quote:"USD"},
    {...snapshot, quote:"BTC"},
  ]) assert.throws(() => previewGlobalFxConversion("100", bad));
  for(const invalid of ["1.5", "NaN", "01", "1e3"]) {
    assert.throws(() => previewGlobalFxConversion(invalid, snapshot));
  }
});
test("P1 country-neutral inclusive and exclusive tax are consistent", () => {
  assert.deepEqual(previewGlobalTax("11800", 1800, true),
    {netMinor:"10000", taxMinor:"1800", grossMinor:"11800"});
  assert.deepEqual(previewGlobalTax("10000", 1800, false),
    {netMinor:"10000", taxMinor:"1800", grossMinor:"11800"});
  assert.deepEqual(previewGlobalTax("11800", 1800, true),
    previewGlobalTax("10000", 1800, false));
  assert.deepEqual(previewGlobalTax("-11800", 1800, true),
    {netMinor:"-10000", taxMinor:"-1800", grossMinor:"-11800"});
});
test("P1 tax refuses implicit policy, invalid rate and malformed amounts", () => {
  for(const rate of [-1, 10001, 18.25, Infinity, NaN]) {
    assert.throws(() => previewGlobalTax("100", rate, false));
  }
  assert.throws(() => previewGlobalTax("100", 1800, undefined));
  assert.throws(() => previewGlobalTax("1.23", 1800, false));
});
