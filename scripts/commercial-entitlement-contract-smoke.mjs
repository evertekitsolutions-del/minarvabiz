import assert from "node:assert/strict";
import { entitlementAllowsModule, entitlementAllowsUse, validateCommercialEntitlements } from "../packages/licensing/src/entitlements.ts";

const base = {
  schemaVersion: 1,
  organizationId: "11111111-1111-4111-8111-111111111111",
  plan: "professional",
  edition: "hybrid",
  lifecycle: "active",
  countryPack: "india",
  industryPacks: ["retail"],
  modules: { sales: true, inventory: true, tailoring: false },
  limits: { users: 5, branches: 2, devices: 5, storageBytes: null, aiCredits: 0 },
  capabilities: { offline: true, sync: true, api: false },
  supportTier: "standard",
  effectiveAt: "2026-10-08T00:00:00.000Z",
  expiresAt: null,
  graceUntil: null,
  source: { provider: "manual", externalSubscriptionId: null, revision: "1" },
};

assert.deepEqual(validateCommercialEntitlements(base), []);
assert.equal(entitlementAllowsUse(base, new Date("2026-10-08T01:00:00Z")), true);
assert.equal(entitlementAllowsModule(base, "sales"), true);
assert.equal(entitlementAllowsModule(base, "tailoring"), false);
assert.equal(entitlementAllowsUse({ ...base, lifecycle: "suspended" }), false);
assert.equal(entitlementAllowsUse({ ...base, lifecycle: "expired" }), false);
assert.equal(entitlementAllowsUse({ ...base, lifecycle: "past_due" }), true, "past due retains policy-controlled access until authority changes lifecycle");
assert.equal(entitlementAllowsUse({ ...base, lifecycle: "grace", expiresAt: "2026-10-01T00:00:00Z", graceUntil: "2026-10-15T00:00:00Z" }, new Date("2026-10-10T00:00:00Z")), true);
assert.equal(entitlementAllowsUse({ ...base, lifecycle: "grace", expiresAt: "2026-10-01T00:00:00Z", graceUntil: "2026-10-15T00:00:00Z" }, new Date("2026-10-16T00:00:00Z")), false);
assert.ok(validateCommercialEntitlements({ ...base, industryPacks: ["retail", "retail"] }).includes("duplicate industry packs"));
assert.ok(validateCommercialEntitlements({ ...base, limits: { ...base.limits, users: -1 } }).includes("invalid users limit"));

console.log("Commercial entitlement contract smoke PASS");
