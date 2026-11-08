// Node 22.6+ with --experimental-strip-types (Node 24: native TS).
// Run: node --experimental-strip-types --test tests/commerce-channel-publication.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeCatalogPublication } from "../src/commerce-channel-publication.ts";

const actor = { tenantId: "tenant-a", companyId: "company-a", branchIds: ["branch-a"], permissions: ["commerce.catalog.publish"] };
const policy = { tenantId: "tenant-a", companyId: "company-a", branchId: "branch-a", channel: "web", commerceEnabled: true, channelEnabled: true, published: true, revision: 2 };
const decide = (a = actor, p = policy, rev = 2) => authorizeCatalogPublication(a, p, rev);

test("explicitly authorized channel is allowed with canonical scope", () => {
  assert.deepEqual(decide(), { allowed: true, scope: { tenantId: "tenant-a", companyId: "company-a", branchId: "branch-a", channel: "web" }, revision: 2 });
});
test("cross-tenant, company and branch publication are denied", () => {
  for (const patch of [{ tenantId: "other" }, { companyId: "other" }, { branchId: "other" }])
    assert.deepEqual(decide(actor, { ...policy, ...patch }), { allowed: false, reason: "scope_mismatch" });
});
test("RBAC publication permission is mandatory", () => {
  assert.equal(decide({ ...actor, permissions: ["commerce.catalog.read"] }).reason, "permission_denied");
});
test("offline-only tenants and disabled channels never publish", () => {
  assert.equal(decide(actor, { ...policy, commerceEnabled: false }).reason, "module_disabled");
  assert.equal(decide(actor, { ...policy, channelEnabled: false }).reason, "channel_disabled");
});
test("unpublished draft and stale revision fail closed", () => {
  assert.equal(decide(actor, { ...policy, published: false }).reason, "unpublished");
  assert.equal(decide(actor, policy, 1).reason, "stale_revision");
});
test("malformed identifiers, revision and channel fail closed", () => {
  assert.equal(decide(actor, { ...policy, branchId: " " }).reason, "invalid_scope");
  assert.equal(decide(actor, { ...policy, revision: NaN }).reason, "invalid_scope");
  assert.equal(decide(actor, { ...policy, channel: "untrusted" }).reason, "invalid_scope");
});
