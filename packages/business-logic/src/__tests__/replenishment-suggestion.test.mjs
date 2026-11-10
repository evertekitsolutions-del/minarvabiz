import test from "node:test";
import assert from "node:assert/strict";
import { suggestReplenishment } from "../replenishment-suggestion.ts";

const input = Object.freeze({
  orgId: "org-A", branchId: "branch-HQ", productId: "sku-1",
  preferredSupplierId: "supplier-1", asOfDate: "2026-11-10",
  onHandUnits: 8, reservedUnits: 4, confirmedInboundUnits: 0,
  soldLookbackUnits: 60, lookbackDays: 30,
  supplierLeadDays: 7, safetyDays: 3, targetCoverageDays: 14,
  minimumStockUnits: 10, minimumOrderUnits: 12, orderMultipleUnits: 6,
});
test("velocity and supplier lead time create a rounded draft, never a PO", () => {
  assert.deepEqual(suggestReplenishment(input), {
    kind: "draft_purchase_suggestion",
    orgId: "org-A", branchId: "branch-HQ", productId: "sku-1",
    supplierId: "supplier-1", asOfDate: "2026-11-10",
    dedupeKey: "org-A:branch-HQ:sku-1:2026-11-10",
    projectedAvailableUnits: 4, triggerAtUnits: 20,
    targetStockUnits: 48, suggestedOrderUnits: 48,
  });
});
test("confirmed inbound PO stock prevents duplicate reorder", () => {
  assert.equal(suggestReplenishment({...input,confirmedInboundUnits:48}),null);
});
test("zero velocity still respects a configured minimum stock", () => {
  const out=suggestReplenishment({...input,soldLookbackUnits:0,onHandUnits:2,reservedUnits:0});
  assert.equal(out?.suggestedOrderUnits,12);
  assert.equal(out?.triggerAtUnits,10);
});
test("when stock is already at a zero-velocity floor, no unnecessary draft", () => {
  assert.equal(suggestReplenishment({...input,soldLookbackUnits:0,onHandUnits:10,reservedUnits:0}),null);
});
test("negative projected availability is handled without hidden stock changes", () => {
  const out=suggestReplenishment({...input,onHandUnits:1,reservedUnits:10});
  assert.equal(out?.projectedAvailableUnits,-9);
  assert.equal(out?.suggestedOrderUnits,60);
});
test("minimum order and case pack rounding are enforced",()=>{
  const out=suggestReplenishment({...input,soldLookbackUnits:0,onHandUnits:9,reservedUnits:0,minimumOrderUnits:13,orderMultipleUnits:12});
  assert.equal(out?.suggestedOrderUnits,24);
});
test("same day and tenant yields the same dedupe key regardless of supplier",()=>{
  const a=suggestReplenishment(input);
  const b=suggestReplenishment({...input,preferredSupplierId:"supplier-2"});
  assert.equal(a?.dedupeKey,b?.dedupeKey);
});
test("different tenant and planning day cannot collide",()=>{
  assert.notEqual(suggestReplenishment(input)?.dedupeKey,suggestReplenishment({...input,orgId:"org-B"})?.dedupeKey);
  assert.notEqual(suggestReplenishment(input)?.dedupeKey,suggestReplenishment({...input,asOfDate:"2026-11-11"})?.dedupeKey);
});
test("rejects nonintegral, negative and malformed values before suggesting",()=>{
  assert.throws(()=>suggestReplenishment({...input,onHandUnits:1.2}),RangeError);
  assert.throws(()=>suggestReplenishment({...input,lookbackDays:0}),RangeError);
  assert.throws(()=>suggestReplenishment({...input,orderMultipleUnits:0}),RangeError);
  assert.throws(()=>suggestReplenishment({...input,asOfDate:"2026-02-31"}),TypeError);
  assert.throws(()=>suggestReplenishment({...input,orgId:""}),TypeError);
});
test("BigInt intermediates avoid overflow and invalid safe integer suggestions throw",()=>{
  assert.throws(()=>suggestReplenishment({
    ...input,soldLookbackUnits:Number.MAX_SAFE_INTEGER,lookbackDays:1,
    supplierLeadDays:3650,targetCoverageDays:3650,safetyDays:3650,
  }),RangeError);
});
