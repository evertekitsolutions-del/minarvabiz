import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename
);
const { evaluateCartRecovery } = require("../commerce-cart-recovery-policy.ts");
const now = 1_800_000_000_000;
const scope = { tenantId: "tenant1", companyId: "company1", branchId: "branch1" };
const cart = (patch = {}) => ({
  ...scope, cartId: "cart1", customerId: "customer1", revision: 3,
  status: "active", updatedAtMs: now - 90 * 60000,
  emailVerified: true, emailConsentVerified: true, lastRecoverySentAtMs: null, ...patch,
});
const policy = (patch = {}) => ({
  enabled: true, minimumIdleMinutes: 30, cooldownMinutes: 1440, maxAgeMinutes: 10080, ...patch,
});
const decide = (c = cart(), p = policy(), s = scope) => evaluateCartRecovery(s, c, p, now);

test("eligible only with exact scoped, verified, opted-in active cart", () => {
  assert.deepEqual(decide(), {
    eligible: true, cartId: "cart1", revision: 3,
    reservationKey: JSON.stringify(["tenant1", "company1", "branch1", "cart1", 3, "email"]),
  });
});
test("fail closed for disabled, checked-out, cancelled, unverified consent", () => {
  assert.equal(decide(cart(), policy({ enabled: false })).reason, "disabled");
  for (const status of ["checked_out", "cancelled"]) assert.equal(decide(cart({ status })).reason, "not_active");
  for (const patch of [{ emailVerified: false }, { emailConsentVerified: false }]) {
    assert.equal(decide(cart(patch)).reason, "unverified_consent");
  }
});
test("enforce idle, max age and send cooldown boundary", () => {
  assert.equal(decide(cart({ updatedAtMs: now - 29 * 60000 })).reason, "too_recent");
  assert.equal(decide(cart({ updatedAtMs: now - 10081 * 60000 })).reason, "expired");
  assert.equal(decide(cart({ lastRecoverySentAtMs: now - 1439 * 60000 })).reason, "cooldown");
  assert.equal(decide(cart({ lastRecoverySentAtMs: now - 1440 * 60000 })).eligible, true);
  assert.equal(decide(cart({ updatedAtMs: now - 30 * 60000 })).eligible, true);
});
test("never permit cross-tenant, cross-company or cross-branch cart recovery", () => {
  for (const field of ["tenantId", "companyId", "branchId"]) {
    assert.throws(() => decide(cart({ [field]: "other" })), /scope mismatch/);
  }
});
test("invalid timestamps, revision, flags and policy fail closed", () => {
  for (const patch of [
    { updatedAtMs: now + 1 }, { updatedAtMs: NaN }, { revision: -1 },
    { revision: 1.5 }, { lastRecoverySentAtMs: now + 1 },
    { emailConsentVerified: undefined }, { status: "unknown" }, { cartId: "../bad" },
  ]) assert.throws(() => decide(cart(patch)));
  for (const patch of [
    { minimumIdleMinutes: 0 }, { cooldownMinutes: 0 }, { maxAgeMinutes: 10 },
    { maxAgeMinutes: Infinity }, { enabled: undefined },
  ]) assert.throws(() => decide(cart(), policy(patch)));
});
test("different revisions and tenants have distinct reservation identities", () => {
  const one = decide();
  const two = decide(cart({ revision: 4 }));
  const otherScope = { tenantId: "tenant2", companyId: "company1", branchId: "branch1" };
  const other = decide(cart({ ...otherScope }), policy(), otherScope);
  assert.notEqual(one.reservationKey, two.reservationKey);
  assert.notEqual(one.reservationKey, other.reservationKey);
});
