import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const sql = fs.readFileSync(fileURLToPath(new URL("../../../../supabase/migrations/20261107_int002_webhook_revision_cas.sql", import.meta.url)), "utf8");
const order = fs.readFileSync(fileURLToPath(new URL("../../../../supabase/MIGRATION_ORDER.txt", import.meta.url)), "utf8");
test("revision CAS migration is registered exactly once after revocation fence", () => {
  const lines = order.trim().split(/\r?\n/);
  const name = "20261107_int002_webhook_revision_cas.sql";
  assert.equal(lines.filter(line => line === name).length, 1);
  assert.ok(lines.indexOf(name) > lines.indexOf("20261107_int002_webhook_revocation_fence.sql"));
});
test("subscription CAS uses scoped PK and expected revision, no blind overwrite", () => {
  assert.match(sql, /on conflict do nothing/i);
  for (const key of ["tenant_id", "company_id", "branch_key", "subscription_id"]) {
    assert.match(sql, new RegExp(key + " = p_" + key));
  }
  assert.match(sql, /revision = p_expected_revision/);
  assert.match(sql, /revision = revision \+ 1/);
  assert.match(sql, /raise exception 'Webhook subscription revision conflict'/);
  assert.doesNotMatch(sql, /on conflict.*do update/i);
});
test("mutation RPC remains service-role-only and security invoker", () => {
  assert.match(sql, /security invoker set search_path = ''/);
  assert.match(sql, /revoke all on function public\.save_integration_webhook_subscription\([\s\S]*?from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.save_integration_webhook_subscription\([\s\S]*?to service_role/);
});
