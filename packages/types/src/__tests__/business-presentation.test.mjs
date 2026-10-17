import assert from "node:assert/strict";
import {
  parseBusinessGroup,
  resolveBusinessCapabilities,
  parseBusinessCapabilities,
  resolveBusinessUIProfile,
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

const ctx = (orgRecord, license = ["barcode", "expiry", "serial", "dimension", "booking"], role = license) => ({
  verifiedOrgId: "tenant-a",
  orgRecord,
  allowedByLicense: license,
  allowedByRole: role,
});
const legacy = resolveBusinessUIProfile(ctx({ id: "tenant-a" }));
assert.deepEqual(legacy, { mode: "legacy", orgId: "tenant-a", businessGroup: null, enabledCapabilities: [] });
assert.ok(Object.isFrozen(legacy));
const cctv = { id: "tenant-a", business_group: "SERIALIZED", business_type_code: "serialized_054",
  feature_config: { additionalCapabilities: ["booking"] } };
assert.deepEqual(resolveBusinessUIProfile(ctx(cctv, ["barcode", "serial", "booking"])), {
  mode: "configured", orgId: "tenant-a", businessGroup: "SERIALIZED", presetCode: "serialized_054",
  enabledCapabilities: ["barcode", "serial", "booking"],
});
assert.deepEqual(resolveBusinessUIProfile(ctx(cctv, ["barcode", "serial"])).enabledCapabilities, ["barcode", "serial"]);
assert.deepEqual(resolveBusinessUIProfile(ctx({ id: "tenant-a", business_group: "SERVICE", business_type_code: "service_085" },
  ["barcode", "booking"], ["barcode", "serial", "booking"])).enabledCapabilities, ["barcode", "booking"]);
const overlap = resolveBusinessUIProfile(ctx(cctv, ["barcode", "serial", "booking"]));
assert.ok(Object.isFrozen(overlap.enabledCapabilities));
assert.throws(() => overlap.enabledCapabilities.push("dimension"), TypeError);

assert.throws(() => resolveBusinessUIProfile(ctx({ id: "tenant-b" })), /Untrusted business profile scope/);
assert.throws(() => resolveBusinessUIProfile(ctx(null)), /Untrusted business profile scope/);
assert.throws(() => resolveBusinessUIProfile({ ...ctx(cctv), verifiedOrgId: "" }), /Untrusted business profile scope/);
assert.throws(() => resolveBusinessUIProfile(ctx({ id: "tenant-a", business_group: "OTHER", business_type_code: "service_085" })), /Invalid business profile/);
assert.throws(() => resolveBusinessUIProfile(ctx({ id: "tenant-a", business_group: "RETAIL", business_type_code: "service_085" })), /Invalid business profile/);
assert.throws(() => resolveBusinessUIProfile(ctx({ id: "tenant-a", business_group: "RETAIL", business_type_code: "retail_999" })), /Invalid business profile/);
assert.throws(() => resolveBusinessUIProfile(ctx({ id: "tenant-a", business_group: "RETAIL" })), /Invalid business profile/);
for (const feature_config of [
  { additionalCapabilities: ["booking", "booking"] }, { additionalCapabilities: ["unknown"] },
  { additionalCapabilities: "serial" }, { enabledPermissions: ["booking"] }, null, "all",
]) {
  assert.throws(() => resolveBusinessUIProfile(ctx({ ...cctv, feature_config })), /Invalid business profile/);
}
assert.throws(() => resolveBusinessUIProfile(ctx(cctv, undefined, ["booking", "serial", "WRONG"])), /Invalid business capabilities/);
assert.throws(() => resolveBusinessUIProfile({ ...ctx(cctv), allowedByLicense: null }), /Invalid business capabilities/);
assert.throws(() => resolveBusinessUIProfile(ctx({ id: "tenant-a", business_group: "__proto__", business_type_code: "__proto__" })),
  /Invalid business profile/);
console.log("PASS UBP-01 verified presentation scope, hybrid entitlements and safe legacy mode");

