import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../warehouse-store.ts", import.meta.url), "utf8");

function block(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.ok(start >= 0 && end > start, startNeedle + " block must exist");
  return source.slice(start, end);
}

const approve = block(
  "export function approveWarehouseTransfer",
  "export function dispatchWarehouseTransfer"
);
const dispatch = block(
  "export function dispatchWarehouseTransfer",
  "export function receiveWarehouseTransfer"
);
const receive = block(
  "export function receiveWarehouseTransfer",
  "export function cancelWarehouseTransfer"
);
const cancel = block(
  "export function cancelWarehouseTransfer",
  "export function consumeWarehouseStock"
);

assert.match(approve, /source\.reserved = roundQty\(source\.reserved \+ transfer\.quantity\)/);
assert.match(approve, /updateTransfer\(transfer, "approved"\)/);

assert.match(dispatch, /source\.onHand = roundQty\(source\.onHand - transfer\.quantity\)/);
assert.match(dispatch, /source\.reserved = roundQty\(source\.reserved - transfer\.quantity\)/);
assert.match(dispatch, /updateTransfer\(transfer, "in_transit"\)/);

assert.match(receive, /destination\.onHand = roundQty\(destination\.onHand \+ transfer\.quantity\)/);
assert.match(receive, /updateTransfer\(transfer, "received"\)/);

assert.match(cancel, /transfer\.status === "received" \|\| transfer\.status === "cancelled"/);
assert.match(cancel, /if \(transfer\.status === "approved"\)/);
assert.match(cancel, /source\.reserved = roundQty\(Math\.max\(0, source\.reserved - transfer\.quantity\)\)/);
assert.match(cancel, /else if \(transfer\.status === "in_transit"\)/);
assert.match(cancel, /source\.onHand = roundQty\(source\.onHand \+ transfer\.quantity\)/);
assert.match(cancel, /updateTransfer\(transfer, "cancelled"\)/);

function approvedCancel(sourceOnHand, quantity) {
  let reserved = quantity;
  reserved = Math.max(0, reserved - quantity);
  return { sourceOnHand, reserved };
}

function inTransitCancel(sourceOnHand, quantity) {
  sourceOnHand -= quantity;
  let reserved = 0;
  sourceOnHand += quantity;
  return { sourceOnHand, reserved };
}

function receiveConservation(sourceOnHand, destinationOnHand, quantity) {
  sourceOnHand -= quantity;
  destinationOnHand += quantity;
  return { sourceOnHand, destinationOnHand, total: sourceOnHand + destinationOnHand };
}

assert.deepEqual(approvedCancel(25, 7), { sourceOnHand: 25, reserved: 0 });
assert.deepEqual(inTransitCancel(25, 7), { sourceOnHand: 25, reserved: 0 });
assert.deepEqual(receiveConservation(25, 3, 7), { sourceOnHand: 18, destinationOnHand: 10, total: 28 });

console.log("WMS transfer conservation contract tests passed");
