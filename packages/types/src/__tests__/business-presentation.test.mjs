import assert from "node:assert/strict";
import {
  parseBusinessGroup,
  resolveBusinessCapabilities,
  parseBusinessCapabilities,
} from "../universal-business-profile.ts";

assert.equal(parseBusinessGroup("SERVICE"), "SERVICE");
assert.equal(parseBusinessGroup("RETAIL"), "RETAIL");
for (const value of ["service", "OTHER", "", 0, null, {}, "__proto__"]) {
  assert.throws(() => parseBusinessGroup(value), /Invalid business group/);
}
assert.deepEqual(resolveBusinessCapabilities("EXPIRE_BASED"), ["barcode", "expiry"]);
assert.deepEqual(resolveBusinessCapabilities("SERVICE"), ["booking"]);
assert.throws(() => resolveBusinessCapabilities("__proto__"), /Unknown business group/);

for (const cap of ["barcode", "expiry", "serial", "dimension", "booking"]) {
  assert.deepEqual(parseBusinessCapabilities([cap]), [cap]);
}
assert.deepEqual(parseBusinessCapabilities([]), []);
for (const bad of [null, ["serial", "unknown"], "serial", ["serial", "serial"], ["__proto__"], [12], {}, ["BOOKING"]]) {
  assert.throws(() => parseBusinessCapabilities(bad), /Invalid business capabilities/);
}
const parsed = parseBusinessCapabilities(["serial"]);
assert.ok(Object.isFrozen(parsed), "Parsed capability list must be immutable");
assert.throws(() => parsed.push("booking"), TypeError);

console.log("PASS UBP-01 capability and group validation");
