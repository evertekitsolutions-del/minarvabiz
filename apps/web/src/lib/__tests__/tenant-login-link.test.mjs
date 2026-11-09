import test from "node:test";
import assert from "node:assert/strict";
import { tenantLoginHref, matchesRequestedTenant } from "../tenant-login-link.ts";

const id = "d2118b72-773d-4bc1-bfa4-c8747f729dc5";
const other = "b8d18a1a-130e-41ab-b3f9-4085bcc4b960";

test("tenant login link is a locator, never a password/token", () => {
  assert.equal(tenantLoginHref(id), "/login?tenant=" + id);
  assert.throws(() => tenantLoginHref("../login?token=secret"), /verified organization/);
  assert.throws(() => tenantLoginHref(""), /verified organization/);
});
test("requested organization must match authenticated server membership", () => {
  assert.equal(matchesRequestedTenant(id, id), true);
  assert.equal(matchesRequestedTenant(id.toUpperCase(), id), true);
  assert.equal(matchesRequestedTenant(other, id), false);
  assert.equal(matchesRequestedTenant("../dashboard", id), false);
  assert.equal(matchesRequestedTenant(null, id), true);
});
